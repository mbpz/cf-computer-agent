// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAnalyticsOverview, LoadAdminAnalyticsInput } from "../../frontend/lib/admin-analytics-data";
import { loadAdminAnalytics } from "../../frontend/lib/admin-analytics-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { AdminAnalyticsRoute } from "../../frontend/app";
import { ApiRequestError } from "../../frontend/lib/api";

type Loader = (input: LoadAdminAnalyticsInput) => Promise<AdminAnalyticsOverview>;

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    return undefined;
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));

const { Window } = await import("happy-dom");

describe("AdminAnalyticsRoute", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    browser = new Window({ url: "https://app.test/admin/analytics" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history);
    vi.stubGlobal("location", browser.location);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
  });

  it("loads the first window from the days filter and ignores URL page params", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?days=14&page=3&pageSize=50");
    const inputs: LoadAdminAnalyticsInput[] = [];
    const loader: Loader = async (input) => { inputs.push(input); return overview(1, 20, 1, [`/visitor-${input.days}`]); };
    await renderRoute(loader);
    expect(inputShape(inputs.at(-1)!)).toEqual({ days: 14, page: 1, pageSize: 20 });
    expect(container.textContent).toContain("/visitor-14");

    await act(async () => {
      browser.history.pushState({}, "", "/admin/analytics?days=7");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    });
    await flush();
    expect(inputShape(inputs.at(-1)!)).toEqual({ days: 7, page: 1, pageSize: 20 });
    expect(container.textContent).toContain("/visitor-7");
  });

  it("restarts the loaded window at the first page when days changes", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?days=14");
    const inputs: LoadAdminAnalyticsInput[] = [];
    const loader: Loader = async (input) => { inputs.push(input); return overview(input.page, input.pageSize, 21, Array.from({ length: 20 }, (_, index) => `/day${input.days}-p${input.page}-${index}`)); };
    await renderRoute(loader);
    expect(inputShape(inputs.at(-1)!)).toEqual({ days: 14, page: 1, pageSize: 20 });
    expect(container.textContent).toContain("/day14-p1-0");

    await changeSelect("#admin-analytics-range", "30");
    expect(Object.fromEntries(new URLSearchParams(browser.location.search))).toEqual({ days: "30" });
    expect((container.querySelector("#admin-analytics-range") as HTMLSelectElement).value).toBe("30");
    expect(inputShape(inputs.at(-1)!)).toEqual({ days: 30, page: 1, pageSize: 20 });
    expect(container.textContent).toContain("/day30-p1-0");
    expect(container.textContent).not.toContain("/day14-p1-0");
  });

  it("keeps ready rows while a reload is pending or fails", async () => {
    const requests: Array<{ input: LoadAdminAnalyticsInput; deferred: ReturnType<typeof deferred<AdminAnalyticsOverview>> }> = [];
    const loader: Loader = (input) => {
      const pending = deferred<AdminAnalyticsOverview>();
      requests.push({ input, deferred: pending });
      return pending.promise;
    };
    await act(async () => root.render(<AdminAnalyticsRoute locale={locale()} search="" load={loader} />));
    requests[0]!.deferred.resolve(overview(1, 20, 1, ["/ready"]));
    await flush();

    await act(async () => (container.querySelector('[data-analytics-refresh]') as HTMLButtonElement).click());
    expect(container.textContent).toContain("/ready");
    expect(container.querySelector('[data-analytics-stale]')).not.toBeNull();

    requests[1]!.deferred.reject(new Error("failed"));
    await flush();
    expect(container.textContent).toContain("/ready");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('[data-analytics-retry]')).not.toBeNull();
  });

  it("aborts a superseded window request and accepts only the latest result", async () => {
    const requests: Array<{ input: LoadAdminAnalyticsInput; deferred: ReturnType<typeof deferred<AdminAnalyticsOverview>> }> = [];
    const loader: Loader = (input) => {
      const pending = deferred<AdminAnalyticsOverview>();
      requests.push({ input, deferred: pending });
      return pending.promise;
    };
    await act(async () => root.render(<AdminAnalyticsRoute locale={locale()} search="" load={loader} />));
    requests[0]!.deferred.resolve(overview(1, 20, 1, ["/ready"]));
    await flush();

    await act(async () => (container.querySelector('[data-analytics-refresh]') as HTMLButtonElement).click());
    await changeSelect("#admin-analytics-range", "30");
    expect(requests[1]!.input.signal?.aborted).toBe(true);

    requests[2]!.deferred.resolve(overview(1, 20, 1, ["/latest"]));
    await flush();
    requests[1]!.deferred.resolve(overview(1, 20, 1, ["/stale"]));
    await flush();
    expect(container.textContent).toContain("/latest");
    expect(container.textContent).not.toContain("/stale");
  });

  it("appends the next page's visitors on end-of-list without duplicating the first page", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?page=4");
    const inputs: LoadAdminAnalyticsInput[] = [];
    const loader: Loader = async (input) => { inputs.push(input); return overview(input.page, input.pageSize, 41, Array.from({ length: 20 }, (_, index) => `/visit-p${input.page}-${index}`)); };
    await renderRoute(loader);
    expect(inputs.map((input) => input.page)).toEqual([1]);
    expect(container.textContent).toContain("/visit-p1-0");

    await scrollToEnd();
    expect(inputs.map((input) => input.page)).toEqual([1, 2]);
    expect(container.textContent).toContain("/visit-p1-0");
    expect(container.textContent).toContain("/visit-p2-0");
  });

  it("stops requesting once the last page is appended", async () => {
    const inputs: LoadAdminAnalyticsInput[] = [];
    const loader: Loader = async (input) => { inputs.push(input); return overview(input.page, input.pageSize, 21, input.page === 1 ? Array.from({ length: 20 }, (_, index) => `/only-p1-${index}`) : ["/only-p2-0"]); };
    await renderRoute(loader);
    await scrollToEnd();
    expect(inputs.map((input) => input.page)).toEqual([1, 2]);
    await scrollToEnd();
    expect(inputs.map((input) => input.page)).toEqual([1, 2]);
    expect(container.textContent).toContain("/only-p2-0");
  });

  it("retries the original initial query once even on double click", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?days=14&page=3&pageSize=50");
    const recovery = deferred<AdminAnalyticsOverview>();
    const inputs: LoadAdminAnalyticsInput[] = [];
    await renderRoute((input) => { inputs.push(input); return inputs.length === 1 ? Promise.reject(new Error("offline")) : recovery.promise; });
    const retry = container.querySelector('[data-analytics-retry]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    await act(async () => { retry.click(); retry.click(); });
    expect(inputs).toHaveLength(2);
    expect(inputShape(inputs[1]!)).toEqual({ days: 14, page: 1, pageSize: 20 });
    recovery.resolve({ ...overview(1, 20, 1, ["/recovered"]), range: { from: "2026-08-13", to: "2026-08-26", days: 14 } });
    await flush();
    expect(container.textContent).toContain("/recovered");
  });

  it("never labels seven-day results as a new range while pending or failed", async () => {
    const next = deferred<AdminAnalyticsOverview>();
    await renderRoute((input) => input.days === 7 ? Promise.resolve(overview(1, 20, 1, ["/old-seven-day-visitor"])) : next.promise);
    expect(container.textContent).toContain("2026-08-20");
    await changeSelect("#admin-analytics-range", "30");
    expect(container.textContent).not.toContain("/old-seven-day-visitor");
    next.reject(new Error("offline"));
    await flush();
    expect(container.textContent).not.toContain("/old-seven-day-visitor");
    expect(container.querySelector('[data-analytics-retry]')).not.toBeNull();
  });

  it("disables refresh until its one pending read settles and marks old data stale", async () => {
    const next = deferred<AdminAnalyticsOverview>();
    let calls = 0;
    await renderRoute(() => ++calls === 1 ? Promise.resolve(overview(1, 20, 1, ["/before-refresh"])) : next.promise);
    const refresh = container.querySelector('[data-analytics-refresh]') as HTMLButtonElement;
    expect(refresh).not.toBeNull();
    await act(async () => { refresh.click(); refresh.click(); });
    expect(calls).toBe(2);
    expect(refresh.disabled).toBe(true);
    expect(container.querySelector('[data-analytics-stale]')).not.toBeNull();
    next.resolve(overview(1, 20, 2, ["/after-refresh", "/new-visit"]));
    await flush();
    expect(container.textContent).toContain("/after-refresh");
    expect(container.querySelector('[data-analytics-stale]')).toBeNull();
  });

  it("replaces visitor counts and rows together after a refresh, rejecting mixed snapshots before retry", async () => {
    const old = (index: number) => `/old-${index}`;
    const before = overview(1, 20, 21, Array.from({ length: 20 }, (_, index) => old(index)));
    before.daily = [{ day: "2026-08-26", pageViews: 21, uniqueVisitors: 21, loginUsers: 0 }];
    const after = overview(1, 20, 22, ["/shifted-row", ...Array.from({ length: 19 }, (_, index) => old(index))]);
    after.daily = [{ day: "2026-08-26", pageViews: 22, uniqueVisitors: 22, loginUsers: 0 }];
    const mixed = { ...after, totals: before.totals };
    const replies = [before, mixed, after];
    const queries: string[] = [];
    await renderRoute((input) => loadAdminAnalytics(input, async (url) => {
      queries.push(String(url));
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    }));
    // Response.json() and the lazy page settle beyond a single microtask flush.
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('[data-analytics-refresh]')).not.toBeNull();
    });
    await act(async () => (container.querySelector('[data-analytics-refresh]') as HTMLButtonElement).click());
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-analytics-stale]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("/shifted-row");
    expect(container.textContent).toContain("21");
    await act(async () => (container.querySelector('[data-analytics-retry]') as HTMLButtonElement).click());
    await vi.waitFor(async () => {
      await flush();
      expect(container.textContent).toContain("/shifted-row");
    });
    expect(container.querySelector('[data-analytics-stale]')).toBeNull();
    expect(container.textContent).toContain("/shifted-row");
    expect(container.textContent).toContain("22");
    expect(queries).toEqual(Array(3).fill("/api/admin/analytics/overview?days=7&page=1&pageSize=20"));
  });

  it("shows a valid one-day URL selection and falls back for duplicate day filters", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?days=1");
    const inputs: LoadAdminAnalyticsInput[] = [];
    const load: Loader = async (input) => { inputs.push(input); return { ...overview(1, 20, 0, []), range: { from: "2026-08-26", to: "2026-08-26", days: input.days } }; };
    await renderRoute(load);
    expect((container.querySelector('#admin-analytics-range') as HTMLSelectElement).value).toBe("1");
    await act(async () => {
      browser.history.pushState({}, "", "/admin/analytics?days=14&days=30");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    });
    expect(inputs.at(-1)!.days).toBe(7);
  });

  it.each([401, 403])("clears visitor details on HTTP %s instead of keeping stale private data", async (status) => {
    let calls = 0;
    await renderRoute(async () => { if (++calls > 1) throw new ApiRequestError("FORBIDDEN", "Denied", status, false); return overview(1, 20, 1, ["/private-visitor"]); });
    await act(async () => (container.querySelector('[data-analytics-refresh]') as HTMLButtonElement).click());
    await flush();
    expect(container.textContent).not.toContain("/private-visitor");
    expect(container.querySelector('[data-page-state="forbidden"]')).not.toBeNull();
  });

  it("aborts a pending read when the route unmounts", async () => {
    let signal: AbortSignal | undefined;
    const next = deferred<AdminAnalyticsOverview>();
    await renderRoute((input) => { signal = input.signal; return next.promise; });
    await act(async () => root.render(<div>Other route</div>));
    expect(signal?.aborted).toBe(true);
    next.resolve(overview(1, 20, 1, ["/late"]));
    await flush();
    expect(container.textContent).toBe("Other route");
  });

  async function renderRoute(load: Loader): Promise<void> {
    await act(async () => root.render(<AdminAnalyticsRoute locale={locale()} search={browser.location.search} load={load} />));
    await flush();
  }

  async function changeSelect(selector: string, value: string): Promise<void> {
    const select = container.querySelector(selector) as HTMLSelectElement;
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new browser.Event("change", { bubbles: true }));
    });
    await flush();
  }

  async function scrollToEnd(): Promise<void> {
    const scroller = container.querySelector("div.overflow-auto") as HTMLElement;
    await act(async () => {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new browser.Event("scroll", { bubbles: true }));
    });
    await flush();
  }
});

function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }

function overview(page: number, pageSize: 20 | 50 | 100, total: number, paths: string[]): AdminAnalyticsOverview {
  return {
    range: { from: "2026-08-20", to: "2026-08-26", days: 7 },
    totals: { pageViews: total, uniqueVisitors: total, loginUsers: 0 },
    daily: [],
    breakdowns: { paths: [], regions: [], countries: [] },
    recentVisitors: {
      items: paths.map((path, index) => ({ occurredAt: `2026-08-26T00:00:0${index}.000Z`, path, ip: "203.0.113.0", country: null, region: null, city: null, colo: null, userAgent: null, member: null })),
      pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
    },
  };
}

function inputShape(input: LoadAdminAnalyticsInput) { return { days: input.days, page: input.page, pageSize: input.pageSize }; }

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> { await act(async () => { await Promise.resolve(); }); }
