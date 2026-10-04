// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDuplicateRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


describe("duplicate decision recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let driver: ReturnType<typeof installWorkspaceHistoryDriver>;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/submissions?page=2" }); driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });


  async function render(page = 1) {
    browser.history.replaceState({}, "", `/admin/duplicates?page=${page}`);
    await act(async () => root.render(<AdminDuplicateRoute locale={locale()} search={browser.location.search} />)); await flush();
  }
  async function renderMember(page = 1) {
    browser.history.replaceState({}, "", `/admin/duplicates?page=${page}`);
    await act(async () => root.render(<AdminDuplicateRoute locale={locale()} memberId="member-a" search={browser.location.search} />)); await flush();
  }
  function action(label = "Associate", id = "dup-1") { return container.querySelector(`button[aria-label="${label} ${id}"]`) as HTMLButtonElement; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); await flush(); }
  async function go(page: number) { await act(async () => { writeWorkspaceHistory("push", `/admin/duplicates?page=${page}`); }); await flush(); }

  function unloadBlocked() { const event = new browser.Event("beforeunload", {cancelable: true}); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function leave() { await act(async () => writeWorkspaceHistory("push", "/home")); }
  it("guards a synchronous POST, unknown result, and explicit recovery without replay", async () => {
    const post = deferred<Response>(); let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return post.promise; }
      gets++; return numbered([duplicate()]);
    });
    await render(); await act(async () => action().click());
    await act(async () => { (container.querySelector("[data-confirm-action]") as HTMLButtonElement).click(); writeWorkspaceHistory("push", "/home"); });
    expect(browser.location.pathname).toBe("/admin/duplicates"); expect(unloadBlocked()).toBe(true);
    await go(2); expect(browser.location.search).toBe("?page=1"); expect(gets).toBe(1);
    post.resolve(new Response(null, {status: 500})); await flush(); await leave();
    expect(browser.location.pathname).toBe("/admin/duplicates"); expect(unloadBlocked()).toBe(true);
    await click("Try again"); expect(unloadBlocked()).toBe(false); expect(posts).toBe(1); expect(gets).toBe(2);
    await leave(); expect(browser.location.pathname).toBe("/home");
  });
  it.each([401, 403])("keeps unknown leave protection when POST %s hides the editor", async status => {
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => init?.method === "POST" ? new Response(null, {status}) : numbered([duplicate()]));
    await render(); await act(async () => action().click()); await click("Confirm decision"); await leave();
    expect(action()).toBeNull(); expect(browser.location.pathname).toBe("/admin/duplicates"); expect(unloadBlocked()).toBe(true);
    await click("Try again"); expect(unloadBlocked()).toBe(false); await leave(); expect(browser.location.pathname).toBe("/home");
  });
  it("retains an actual POST when a replacement locale read denies access", async () => {
    const post = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return post.promise;
      return ++gets === 2 ? new Response(null, {status: 403}) : numbered([duplicate()]);
    });
    await render(); await act(async () => action().click()); await click("Confirm decision");
    await act(async () => root.render(<AdminDuplicateRoute locale={locale()} search={browser.location.search} />)); await flush();
    expect(action()).toBeNull(); await click("Try again");
    expect(gets).toBe(2); expect(unloadBlocked()).toBe(true);
    post.resolve(json({candidate: duplicate("associate")})); await flush();
    expect(action()).toBeNull(); expect(unloadBlocked()).toBe(true);
    await click("Try again"); expect(gets).toBe(3); expect(unloadBlocked()).toBe(false);
  });
  it("does not trap a confirmed decision when its pending-only refresh fails", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => init?.method === "POST" ? json({candidate: duplicate("associate")}) : ++gets === 1 ? numbered([duplicate()]) : new Response(null, {status: 500}));
    await render(); await act(async () => action().click()); await click("Confirm decision");
    expect(action().disabled).toBe(true); expect(unloadBlocked()).toBe(false); await leave(); expect(browser.location.pathname).toBe("/home");
  });
  it.each([401, 403, 500])("does not trap a readonly %s failure with no write", async status => {
    vi.stubGlobal("fetch", async () => new Response(null, {status})); await render();
    expect(unloadBlocked()).toBe(false); await leave(); expect(browser.location.pathname).toBe("/home");
  });

  it.each(["Associate", "Keep separate", "Reject"])("canceling %s performs no network mutation", async label => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { requests.push(init?.method || "GET"); return numbered([duplicate()]); });
    await render(); await act(async () => action(label).click()); await click("Cancel");
    expect(requests).toEqual(["GET"]); expect(action().disabled).toBe(false);
  });

  it("page navigation waits for confirmation cancellation without replay", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") posts++;
      const page = Number(new URL(String(input), "https://app.test").searchParams.get("page"));
      return numbered([duplicate()], page, page === 1 ? 1 : 21);
    });
    await render(); await act(async () => action().click());
    const old = container.querySelector("[data-confirm-action]") as HTMLButtonElement;
    expect(old).toBeTruthy(); await go(2); expect(browser.location.search).toBe("?page=1");
    await click("Cancel"); await go(2); await act(async () => old.click());
    expect(posts).toBe(0); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("synchronously admits only one decision across three buttons and rows", async () => {
    const post = deferred<Response>(); const writes: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { writes.push(String(init.body)); return post.promise; }
      return numbered([duplicate(), duplicate("pending", "dup-2")]);
    });
    await render();
    await act(async () => { action().click(); action("Reject").click(); action("Associate", "dup-2").click(); });
    expect(writes).toEqual([]);
    const confirm = container.querySelector("[data-confirm-action]") as HTMLButtonElement;
    await act(async () => {confirm.click();confirm.click();});
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
    await render(); await act(async () => action({associate: "Associate", keep_separate: "Keep separate", reject: "Reject"}[decision]).click()); await click("Confirm decision"); await flush();
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
    await render(); await act(async () => action().click()); await click("Confirm decision"); await flush();
    expect(action().disabled).toBe(true); expect(gets).toBe(1); expect(posts).toBe(1);
    await click("Try again"); expect(gets).toBe(2); expect(posts).toBe(1); expect(action().disabled).toBe(false);
  });

  it.each([401, 403])("clears private rows on decision %s and recovers with GET only", async (status) => {
    let posts = 0; let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return new Response(null, { status }); }
      gets++; return numbered([duplicate()]);
    });
    await render(); await act(async () => action().click()); await click("Confirm decision"); await flush();
    expect(container.textContent).not.toContain("Canonical dup-1"); expect(action()).toBeNull();
    await click("Try again"); expect(action()).toBeTruthy(); expect(posts).toBe(1); expect(gets).toBe(2);
  });

  it.each([401, 403])("clears rows on post-decision GET %s", async (status) => {
    let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => init?.method === "POST" ? json({candidate: duplicate("associate")}) : ++gets === 1 ? numbered([duplicate()]) : new Response(null, {status}));
    await render(); await act(async () => action().click()); await click("Confirm decision"); await flush();
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
    await render(2); await act(async () => action().click()); await click("Confirm decision"); await flush();
    expect(action().disabled).toBe(true);
    await click("Try again"); expect(pages).toEqual([2, 2, 2, 1]); expect(posts).toBe(1); expect(action()).toBeNull();
  });

  it("does not treat stale pending data as permission to repeat an acknowledged decision", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { if (init?.method === "POST") { posts++; return json({candidate: duplicate("associate")}); } return numbered([duplicate()]); });
    await render(); await act(async () => action().click()); await click("Confirm decision"); await flush();
    expect(action().disabled).toBe(true); await click("Try again"); expect(action().disabled).toBe(true); expect(posts).toBe(1);
  });

  it.each(["late-success", "late-denial"])("ignores %s after forced session remount at the same query", async (result) => {
    const post = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return post.promise;
      gets++; const page = Number(new URL(String(input), "https://app.test").searchParams.get("page"));
      return numbered([duplicate("pending", page === 1 ? "dup-1" : "dup-2")], page, page === 1 ? 1 : 21);
    });
    await render(); await act(async () => action().click()); await click("Confirm decision");
    // Session teardown is forced, not an admitted leave during a pending POST.
    await act(async () => root.render(null)); await render(2); await act(async () => root.render(null)); await render(1);
    post.resolve(result === "late-success" ? json({candidate: duplicate("associate")}) : new Response(null, {status: 403})); await flush();
    expect(gets).toBe(3); expect(action()).toBeTruthy(); expect(action().disabled).toBe(false);
    expect(container.querySelector("[data-page-state=forbidden]")).toBeNull();
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
    await render(); await act(async () => action().click()); await click("Confirm decision"); await flush();
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Try again") as HTMLButtonElement;
    await act(async () => { retry.click(); retry.click(); });
    expect(gets).toBe(2); expect(posts).toBe(1); expect(action().disabled).toBe(true);
    recovery.resolve(numbered([duplicate()])); await flush(); expect(action().disabled).toBe(false);
  });

  it("refuses query recovery while the write is pending, then keeps leave locked through its explicit GET", async () => {
    const post = deferred<Response>(); const recovery = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return post.promise;
      return ++gets === 1 ? numbered([duplicate()]) : recovery.promise;
    });
    await render(); await act(async () => action().click()); await click("Confirm decision"); await go(2); await go(1);
    expect(gets).toBe(1); expect(unloadBlocked()).toBe(true);
    post.resolve(new Response(null, {status: 500})); await flush();
    await click("Try again"); expect(gets).toBe(2); expect(unloadBlocked()).toBe(true);
    recovery.resolve(numbered([duplicate()])); await flush();
    expect(action().disabled).toBe(false); expect(unloadBlocked()).toBe(false);
  });

  it.each(["associate", "keep_separate", "reject"] as const)("recovers an absent unknown result by readonly %s detail without replay", async decision => {
    const calls: string[] = []; let lists = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      const path = String(input); calls.push(`${init?.method || "GET"} ${path}`);
      if (init?.method === "POST") throw new TypeError("lost receipt");
      if (path === "/api/admin/duplicates/dup-1") return json({candidate: duplicate(decision)});
      return ++lists === 1 ? numbered([duplicate()]) : numbered([]);
    });
    await render(); await act(async () => action().click()); await click("Confirm decision");
    expect(calls).toHaveLength(2);
    await click("Try again");
    expect(calls).toEqual(["GET /api/admin/duplicates?page=1&pageSize=20", "POST /api/admin/duplicates/dup-1/decision", "GET /api/admin/duplicates?page=1&pageSize=20", "GET /api/admin/duplicates/dup-1"]);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it.each(["wrong-id", "wrong-canonical", "malformed", "404", "401", "403", "500"])("retains unknown lock on %s detail and only recovers with a validated GET", async failure => {
    let lists = 0; let details = 0; let posts = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; throw new TypeError("lost"); }
      if (String(input) === "/api/admin/duplicates/dup-1") {
        if (++details > 1) return json({candidate: duplicate("keep_separate")});
        if (/^[0-9]+$/.test(failure)) return new Response(null, {status: Number(failure)});
        const candidate = duplicate("associate");
        if (failure === "wrong-id") candidate.submissionId = "other";
        if (failure === "wrong-canonical") candidate.canonicalSourceVersionId = "other";
        return json(failure === "malformed" ? {} : {candidate});
      }
      return ++lists === 1 ? numbered([duplicate()]) : numbered([]);
    });
    await render(); await act(async () => action().click()); await click("Confirm decision"); await click("Try again"); await leave();
    expect(unloadBlocked()).toBe(true); expect(browser.location.pathname).toBe("/admin/duplicates"); expect(posts).toBe(1);
    await click("Try again"); expect(details).toBe(2); expect(posts).toBe(1); expect(unloadBlocked()).toBe(false);
    await leave(); expect(browser.location.pathname).toBe("/home");
  });

  it("ignores stale detail recovery after a forced session teardown", async () => {
    const detail = deferred<Response>(); let lists = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("lost");
      if (String(input) === "/api/admin/duplicates/dup-1") return detail.promise;
      return ++lists === 2 ? numbered([]) : numbered([duplicate()]);
    });
    await render(); await act(async () => action().click()); await click("Confirm decision"); await click("Try again");
    expect(unloadBlocked()).toBe(true);
    await act(async () => root.render(null)); expect(unloadBlocked()).toBe(false); await render();
    detail.resolve(new Response(null, {status: 403})); await flush();
    expect(action().disabled).toBe(false); expect(container.querySelector("[data-page-state=forbidden]")).toBeNull();
  });

  it("restores native history arrival without replay while a POST is pending", async () => {
    const post = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => init?.method === "POST" ? post.promise : (++gets, numbered([duplicate()])));
    browser.history.replaceState({}, "", "/home"); browser.history.pushState({}, "", "/admin/duplicates?page=1");
    await render(); await act(async () => action().click()); await click("Confirm decision");
    await act(async () => driver.arrive(0)); expect(driver.requests).toHaveLength(1); expect(driver.requests[0].index).toBe(1);
    await act(async () => { driver.arrive(1); driver.requests[0].resolve(); }); await flush();
    expect(driver.requests).toHaveLength(1); expect(browser.location.pathname).toBe("/admin/duplicates"); expect(gets).toBe(1); expect(unloadBlocked()).toBe(true);
    post.resolve(new Response(null, {status: 500})); await flush();
  });

  it("does not infer a decision from absence on an uncertain recovery page", async () => {
    let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; throw new TypeError("lost response"); }
      return ++gets === 1 ? numbered([duplicate()]) : numbered([]);
    });
    await render(); await act(async () => action().click()); await click("Confirm decision"); await flush(); await click("Try again");
    expect(action()).toBeNull(); expect(container.querySelector('[role="status"]')?.textContent).toContain("do not confirm"); expect(posts).toBe(1);
  });

  it("ignores an old query's delayed GET after the current decision is denied", async () => {
    const stale = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, {status: 403});
      if (++gets === 2) return stale.promise;
      return numbered([duplicate()]);
    });
    await render(); await go(2); await go(1); await act(async () => action().click()); await click("Confirm decision"); await flush();
    stale.resolve(numbered([duplicate("pending", "stale-private")], 2, 21)); await flush();
    expect(action()).toBeNull(); expect(container.textContent).not.toContain("stale-private"); expect(container.textContent).not.toContain("Canonical dup-1");
  });

  it("keeps an unknown duplicate decision after refresh and reconciles without resending", async () => {
    const second = deferred<Response>(); let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return new Response(null, { status: 503 }); }
      if (++gets === 1) return numbered([duplicate()]);
      return second.promise;
    });
    await renderMember(); await act(async () => action().click()); await click("Confirm decision");
    expect(posts).toBe(1);
    expect(browser.sessionStorage.getItem("memory-garden:admin-duplicate:v1:member-a")).toContain("\"associate\"");
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await renderMember();
    expect(posts).toBe(1); expect(unloadBlocked()).toBe(true); expect(action()).toBeNull();
    second.resolve(numbered([duplicate()])); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:admin-duplicate:v1:member-a")).toBeNull();
    expect(unloadBlocked()).toBe(false); expect(posts).toBe(1); expect(action().disabled).toBe(false);
  });
  it("does not send a duplicate decision when the tab cannot record it", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return json({ candidate: duplicate("associate") }); }
      return numbered([duplicate()]);
    });
    await renderMember();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await act(async () => action().click()); await click("Confirm decision");
    expect(posts).toBe(0); expect(container.textContent).toContain("could not record");
  });
  it("blocks a duplicate decision when its record cannot be read and allows leave until it is discarded", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return json({ candidate: duplicate("associate") }); }
      return numbered([duplicate()]);
    });
    browser.sessionStorage.setItem("memory-garden:admin-duplicate:v1:member-a", "{");
    await renderMember();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/duplicates?page=1");
    await click("Discard record");
    await act(async () => action().click()); await click("Confirm decision");
    expect(posts).toBe(1);
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
