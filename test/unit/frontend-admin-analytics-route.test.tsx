// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAnalyticsOverview, LoadAdminAnalyticsInput } from "../../frontend/lib/admin-analytics-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { AdminAnalyticsRoute } from "../../frontend/app";

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

  it("initializes from URL and restores days and pagination on popstate", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?days=14&page=3&pageSize=50");
    const inputs: LoadAdminAnalyticsInput[] = [];
    const loader: Loader = async (input) => { inputs.push(input); return overview(input.page, input.pageSize, 101, [`/page-${input.page}`]); };
    await renderRoute(loader);
    expect(inputShape(inputs.at(-1)!)).toEqual({ days: 14, page: 3, pageSize: 50 });

    await act(async () => {
      browser.history.pushState({}, "", "/admin/analytics?days=7&page=2&pageSize=20");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    });
    expect(inputShape(inputs.at(-1)!)).toEqual({ days: 7, page: 2, pageSize: 20 });
  });

  it("resets page one when days or page size changes", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?days=14&page=3&pageSize=50");
    const loader: Loader = async (input) => overview(input.page, input.pageSize, 120, [`/page-${input.page}`]);
    await renderRoute(loader);

    await changeSelect("#admin-analytics-range", "30");
    expect(Object.fromEntries(new URLSearchParams(browser.location.search))).toEqual({ days: "30", pageSize: "50" });

    browser.history.replaceState({}, "", "/admin/analytics?days=30&page=3&pageSize=50");
    browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    await flush();
    const pushState = vi.spyOn(browser.history, "pushState");
    await changeSelect('select[aria-label="Rows per page"]', "100");
    expect(Object.fromEntries(new URLSearchParams(browser.location.search))).toEqual({ days: "30", pageSize: "100" });
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("aborts stale requests, keeps ready data pending or failed, and accepts only the latest result", async () => {
    const requests: Array<{ input: LoadAdminAnalyticsInput; deferred: ReturnType<typeof deferred<AdminAnalyticsOverview>> }> = [];
    const loader: Loader = (input) => {
      const pending = deferred<AdminAnalyticsOverview>();
      requests.push({ input, deferred: pending });
      return pending.promise;
    };
    await act(async () => root.render(<AdminAnalyticsRoute locale={locale()} search="" load={loader} />));
    requests[0]!.deferred.resolve(overview(1, 20, 60, ["/ready"]));
    await flush();

    await clickPage(2);
    expect(requests[0]!.input.signal?.aborted).toBe(true);
    expect(container.textContent).toContain("/ready");
    expect(container.querySelector('button[aria-label="Page 2"]')?.hasAttribute("disabled")).toBe(true);

    requests[1]!.deferred.reject(new Error("failed"));
    await flush();
    expect(container.textContent).toContain("/ready");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    await clickPage(3);
    await act(async () => {
      browser.history.pushState({}, "", "/admin/analytics?page=2");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    });
    await flush();
    expect(requests[2]!.input.signal?.aborted).toBe(true);
    requests[3]!.deferred.resolve(overview(2, 20, 60, ["/latest"]));
    await flush();
    requests[2]!.deferred.resolve(overview(3, 20, 60, ["/stale"]));
    await flush();
    expect(container.textContent).toContain("/latest");
    expect(container.textContent).not.toContain("/stale");
  });

  it("renders a legal empty page beyond the last page", async () => {
    browser.history.replaceState({}, "", "/admin/analytics?page=4");
    await renderRoute(async () => overview(4, 20, 21, []));
    expect(container.textContent).toContain("0–0");
    expect(container.textContent).toContain("4 / 2");
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
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

  async function clickPage(page: number): Promise<void> {
    const button = container.querySelector(`button[aria-label="Page ${page}"]`) as HTMLButtonElement;
    await act(async () => button.click());
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
