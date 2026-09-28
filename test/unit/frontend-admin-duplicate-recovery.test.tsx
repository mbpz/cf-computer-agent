// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDuplicateRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


describe("duplicate decision recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/submissions?page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });


  async function render(page = 1) {
    browser.history.replaceState({}, "", `/admin/duplicates?page=${page}`);
    await act(async () => root.render(<AdminDuplicateRoute locale={locale()} search={browser.location.search} />)); await flush();
  }
  function action(label = "Associate", id = "dup-1") { return container.querySelector(`button[aria-label="${label} ${id}"]`) as HTMLButtonElement; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); await flush(); }
  async function go(page: number) { await act(async () => { browser.history.pushState({}, "", `/admin/duplicates?page=${page}`); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush(); }

  it("synchronously admits only one decision across three buttons and rows", async () => {
    const post = deferred<Response>(); const writes: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { writes.push(String(init.body)); return post.promise; }
      return numbered([duplicate(), duplicate("pending", "dup-2")]);
    });
    await render();
    await act(async () => { action().click(); action("Reject").click(); action("Associate", "dup-2").click(); });
    expect(writes).toEqual(['{"decision":"associate"}']);
    expect(action("Associate", "dup-2").disabled).toBe(true);
  });

  it.each(["associate", "keep_separate", "reject"] as const)("sends the explicit %s decision and only refreshes GET", async (decision) => {
    const requests: Array<{method: string; body?: unknown}> = []; let decided = false;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      requests.push({ method: init?.method || "GET", body: init?.body });
      if (init?.method === "POST") { decided = true; return json({ candidate: duplicate(decision) }); }
      return numbered(decided ? [] : [duplicate()]);
    });
    await render(); await act(async () => action({associate: "Associate", keep_separate: "Keep separate", reject: "Reject"}[decision]).click()); await flush();
    expect(requests.map((r) => r.method)).toEqual(["GET", "POST", "GET"]);
    expect(JSON.parse(String(requests[1].body))).toEqual({ decision });
    expect(action()).toBeNull();
    expect(container.textContent).not.toContain("no write will be resent");
  });

  it.each(["network", "500", "wrong-id", "wrong-decision", "wrong-canonical"])("locks an uncertain %s outcome until an explicit fresh pending read", async (failure) => {
    let posts = 0; let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") { gets++; return numbered([duplicate()]); }
      posts++;
      if (failure === "network") throw new TypeError("connection lost");
      if (failure === "500") return new Response(null, { status: 500 });
      const candidate = duplicate("associate");
      if (failure === "wrong-id") candidate.submissionId = "other";
      if (failure === "wrong-decision") candidate.decision = "reject";
      if (failure === "wrong-canonical") candidate.canonicalSourceId = "other";
      return json({ candidate });
    });
    await render(); await act(async () => action().click()); await flush();
    expect(action().disabled).toBe(true); expect(gets).toBe(1); expect(posts).toBe(1);
    await click("Try again"); expect(gets).toBe(2); expect(posts).toBe(1); expect(action().disabled).toBe(false);
  });

  it.each([401, 403])("clears private rows on decision %s and recovers with GET only", async (status) => {
    let posts = 0; let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return new Response(null, { status }); }
      gets++; return numbered([duplicate()]);
    });
    await render(); await act(async () => action().click()); await flush();
    expect(container.textContent).not.toContain("Canonical dup-1"); expect(action()).toBeNull();
    await click("Try again"); expect(action()).toBeTruthy(); expect(posts).toBe(1); expect(gets).toBe(2);
  });

  it.each([401, 403])("clears rows on post-decision GET %s", async (status) => {
    let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => init?.method === "POST" ? json({candidate: duplicate("associate")}) : ++gets === 1 ? numbered([duplicate()]) : new Response(null, {status}));
    await render(); await act(async () => action().click()); await flush();
    expect(container.textContent).not.toContain("Canonical dup-1"); expect(action()).toBeNull();
  });

  it("retains the acknowledged decision lock after its refresh fails, then clamps using GET only", async () => {
    let gets = 0; let posts = 0; const pages: number[] = [];
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return json({candidate: duplicate("associate")}); }
      const page = Number(new URL(String(input), "https://app.test").searchParams.get("page")); pages.push(page);
      if (++gets === 1) return numbered([duplicate()], 2, 21);
      if (gets === 2) return new Response(null, {status: 500});
      return numbered([], page, 0);
    });
    await render(2); await act(async () => action().click()); await flush();
    expect(action().disabled).toBe(true);
    await click("Try again"); expect(pages).toEqual([2, 2, 2, 1]); expect(posts).toBe(1); expect(action()).toBeNull();
  });

  it("does not treat stale pending data as permission to repeat an acknowledged decision", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { if (init?.method === "POST") { posts++; return json({candidate: duplicate("associate")}); } return numbered([duplicate()]); });
    await render(); await act(async () => action().click()); await flush();
    expect(action().disabled).toBe(true); await click("Try again"); expect(action().disabled).toBe(true); expect(posts).toBe(1);
  });

  it.each(["late-success", "late-denial"])("ignores %s after away-and-back navigation to the same query", async (result) => {
    const post = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return post.promise;
      gets++; const page = Number(new URL(String(input), "https://app.test").searchParams.get("page"));
      return numbered([duplicate("pending", page === 1 ? "dup-1" : "dup-2")], page, page === 1 ? 1 : 21);
    });
    await render(); await act(async () => action().click()); await go(2); await go(1);
    post.resolve(result === "late-success" ? json({candidate: duplicate("associate")}) : new Response(null, {status: 403})); await flush();
    expect(gets).toBe(3); expect(action()).toBeTruthy(); expect(action().disabled).toBe(true);
    await click("Try again"); expect(gets).toBe(4);
  });

  it("clears the previous query's rows when a new query fails", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", async () => ++gets === 1 ? numbered([duplicate()]) : new Response(null, {status: 500}));
    await render(); await go(2); expect(action()).toBeNull(); expect(container.textContent).not.toContain("Canonical dup-1");
  });

  it("coalesces manual recovery clicks and never replays a failed write", async () => {
    const recovery = deferred<Response>(); let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; throw new TypeError("lost response"); }
      return ++gets === 1 ? numbered([duplicate()]) : recovery.promise;
    });
    await render(); await act(async () => action().click()); await flush();
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Try again") as HTMLButtonElement;
    await act(async () => { retry.click(); retry.click(); });
    expect(gets).toBe(2); expect(posts).toBe(1); expect(action().disabled).toBe(true);
    recovery.resolve(numbered([duplicate()])); await flush(); expect(action().disabled).toBe(false);
  });

  it("does not unlock from a read begun before the old-scope write settled", async () => {
    const post = deferred<Response>(); const earlyRead = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return post.promise;
      gets++; if (gets === 3) return earlyRead.promise;
      const page = Number(new URL(String(input), "https://app.test").searchParams.get("page"));
      return numbered([duplicate()], page, page === 1 ? 1 : 21);
    });
    await render(); await act(async () => action().click()); await go(2); await go(1);
    post.resolve(new Response(null, {status: 500})); await flush();
    earlyRead.resolve(numbered([duplicate()])); await flush();
    expect(action().disabled).toBe(true); expect(gets).toBe(3);
    await click("Try again"); expect(action().disabled).toBe(false); expect(gets).toBe(4);
  });

  it("does not infer a decision from absence on an uncertain recovery page", async () => {
    let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; throw new TypeError("lost response"); }
      return ++gets === 1 ? numbered([duplicate()]) : numbered([]);
    });
    await render(); await act(async () => action().click()); await flush(); await click("Try again");
    expect(action()).toBeNull(); expect(container.querySelector('[role="status"]')?.textContent).toContain("do not confirm"); expect(posts).toBe(1);
  });

  it("ignores an old query's delayed GET after the current decision is denied", async () => {
    const stale = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, {status: 403});
      if (++gets === 2) return stale.promise;
      return numbered([duplicate()]);
    });
    await render(); await go(2); await go(1); await act(async () => action().click()); await flush();
    stale.resolve(numbered([duplicate("pending", "stale-private")], 2, 21)); await flush();
    expect(action()).toBeNull(); expect(container.textContent).not.toContain("stale-private"); expect(container.textContent).not.toContain("Canonical dup-1");
  });

  it.each(["page", "pageSize", "terminal", "duplicate-id"])("rejects a mismatched %s pending list", async (field) => {
    vi.stubGlobal("fetch", async () => {
      const items = field === "duplicate-id" ? [duplicate(), duplicate()] : [duplicate(field === "terminal" ? "associate" : "pending")];
      return json({items, pagination: {page: field === "page" ? 2 : 1, pageSize: field === "pageSize" ? 50 : 20, total: field === "page" ? 21 : items.length, totalPages: field === "page" ? 2 : 1}});
    });
    await render(); expect(action()).toBeNull(); expect(container.querySelector('[data-page-state="error"]')).toBeTruthy();
  });
});
function duplicate(decision: "pending" | "associate" | "keep_separate" | "reject" = "pending", id = "dup-1") { return { submissionId: id, canonicalSubmissionId: `${id}-canonical`, canonicalSourceId: `${id}-source`, canonicalSourceVersionId: `${id}-version`, submissionTitle: id, canonicalTitle: `Canonical ${id}`, decision }; }
function numbered(items: unknown[], page = 1, total = items.length) { return json({ items, pagination: { page, pageSize: 20, total, totalPages: total ? Math.ceil(total / 20) : 0 } }); }
function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index++) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
