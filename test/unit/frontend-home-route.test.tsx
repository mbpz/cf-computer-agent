// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import type { WorkspaceLeaveDecision } from "../../frontend/lib/workspace-navigation-gate";
import { App } from "../../frontend/app";



const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const taskSummary = { todo: 3, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 1 };
const knowledge = { items: [{ knowledgeItemId: "k1", title: "Private guide", lastVisitedAt: "2026-10-01T00:00:00Z", visitCount: 1 }] };
const session = { member: { id: "member-1", email: "one@test.example", role: "contributor" }, capabilities: [], logoutUrl: "/auth/logout" };
type Request = { path: string; signal?: AbortSignal | null; resolve: (value: Response) => void };
describe("home summary real route", () => {
  let browser: InstanceType<typeof Window>, container: HTMLElement, root: Root, requests: Request[];
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("MutationObserver", browser.MutationObserver);
    vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); requests = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/session") return Promise.resolve(Response.json(session));
      if (path === "/api/navigation") return Promise.resolve(Response.json({ tree: [] }));
      if (path === "/api/notifications/summary") return Promise.resolve(Response.json({ unread: 0 }));
      if (path.startsWith("/api/telemetry/")) return Promise.resolve(new Response(null, { status: 204 }));
      return new Promise<Response>(resolve => requests.push({ path, signal: init?.signal, resolve }));
    }));
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function flush() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
  async function render() { await act(async () => root.render(<App />)); for (let n = 0; n < 20 && requests.length < 3; n++) await flush(); expect(requests).toHaveLength(3); }
  async function answer(index: number, body: unknown, status = 200) { await act(async () => { requests[index].resolve(Response.json(body, { status })); }); await flush(); }
  const section = (name: string) => Array.from(container.querySelectorAll("h3")).find(h => h.textContent === ({ tasks: "My tasks", knowledge: "Recent knowledge", activity: "Activity" } as Record<string,string>)[name])?.closest(".bg-card");
  it.each([true, false])("logout confirmed=%s respects the security boundary rather than ordinary leave consent", async confirmed => {
    await render(); await answer(0, taskSummary); await answer(1, knowledge); await answer(2, { items: [] });
    const baseFetch = vi.mocked(fetch).getMockImplementation()!; let loggedOut = false;
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input) === "/auth/logout") { loggedOut = confirmed; return Promise.resolve(new Response(null, { status: confirmed ? 204 : 503 })); }
      if (String(input) === "/api/session" && loggedOut) return Promise.resolve(Response.json({ error: { code: "AUTH_REQUIRED", message: "Signed out", retryable: false } }, { status: 401 }));
      return baseFetch(input, init);
    });
    let decision!: WorkspaceLeaveDecision; const dismiss = vi.fn(); const oldCommit = vi.fn();
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: "confirm", version: "draft", prompt(value) { decision = value; }, dismiss }));
    try {
      writeWorkspaceHistory("push", "/settings", oldCommit);
      await act(async () => (container.querySelector('[data-account-trigger]') as HTMLButtonElement).click());
      await act(async () => (container.querySelector('[data-account-logout]') as HTMLButtonElement).click()); await flush();
      expect(vi.mocked(fetch).mock.calls.some(([path, init]) => path === "/auth/logout" && init?.method === "POST")).toBe(true);
      if (confirmed) {
        expect(container.textContent).not.toContain("Private guide"); expect(container.textContent).not.toContain("one@test.example");
        expect(requests.slice(0, 3).every(r => r.signal?.aborted)).toBe(true); expect(dismiss).toHaveBeenCalledOnce();
        await act(async () => decision.accept()); expect(oldCommit).not.toHaveBeenCalled(); expect(browser.location.pathname).toBe("/");
      } else {
        expect(container.textContent).toContain("Private guide"); expect(container.textContent).toContain("Sign out failed"); expect(dismiss).not.toHaveBeenCalled();
        await act(async () => decision.cancel()); expect(browser.location.pathname).toBe("/"); expect(oldCommit).not.toHaveBeenCalled();
      }
    } finally { unregister(); }
  });

  it.each(["tasks", "knowledge", "activity"])("shows %s failure instead of zero or empty while preserving successful sections", async name => {
    await render();
    await answer(0, taskSummary, name === "tasks" ? 500 : 200);
    await answer(1, knowledge, name === "knowledge" ? 500 : 200);
    await answer(2, { items: [], nextCursor: null }, name === "activity" ? 500 : 200);
    expect(section(name)?.textContent).toContain("Unable to load");
    expect(section(name)?.textContent).not.toContain("No recent");
    if (name === "tasks") expect(section(name)?.textContent).not.toMatch(/\b0\b/);
    if (name !== "knowledge") expect(container.textContent).toContain("Private guide");
    expect(section(name)?.querySelector("button")).not.toBeNull();
  });
  it("coalesces retry and recovers through GET reads only", async () => {
    await render(); await answer(0, {}, 500); await answer(1, knowledge); await answer(2, { items: [] });
    const retry = section("tasks")?.querySelector("button"); expect(retry).toBeTruthy();
    await act(async () => { retry!.click(); retry!.click(); }); expect(requests).toHaveLength(6);
    await answer(3, taskSummary); await answer(4, { items: [] }); await answer(5, { items: [] });
    expect(section("tasks")?.textContent).toContain("3"); expect(section("tasks")?.textContent).not.toContain("Unable to load");
    expect(section("knowledge")?.textContent).toContain("No recent knowledge yet.");
    const reads = vi.mocked(fetch).mock.calls.filter(([path]) => !String(path).startsWith("/api/telemetry/"));
    expect(reads.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
  it.each([401,403])("clears all protected sections immediately on %s even with pending siblings", async status => {
    await render(); await answer(1, knowledge); await answer(0, {}, status);
    expect(container.textContent).toContain("Unable to load");
    expect(container.textContent).not.toContain("Private guide");
    expect(requests.every(r => r.signal?.aborted)).toBe(true);
    expect(container.querySelector("#workbench-title")).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).some(b => b.textContent === "Try again")).toBe(false);
    await answer(2, { items: [] }); expect(container.querySelector("#workbench-title")).toBeNull();
  });
  it("aborts all reads on navigation and ignores late responses after return", async () => {
    await render();
    await act(async () => { browser.history.pushState({}, "", "/settings"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); });
    expect(requests.every(r => r.signal?.aborted)).toBe(true);
    await act(async () => { browser.history.pushState({}, "", "/"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); });
    expect(requests).toHaveLength(6);
    await answer(3, taskSummary); await answer(4, { items: [] }); await answer(5, { items: [] });
    await answer(0, { ...taskSummary, todo: 99 }); await answer(1, knowledge); await answer(2, { items: [] });
    expect(container.textContent).not.toContain("Private guide"); expect(section("tasks")?.textContent).not.toContain("99");
  });
  it.each([0,1,2])("rejects malformed summary section %s rather than presenting fake data", async bad => {
    await render();
    await answer(0, bad === 0 ? { ...taskSummary, todo: -1 } : taskSummary);
    await answer(1, bad === 1 ? {} : knowledge);
    await answer(2, bad === 2 ? {} : { items: [] });
    expect(section(["tasks","knowledge","activity"][bad])?.textContent).toContain("Unable to load");
  });
  it("renders genuine zero and empty results without an error or retry", async () => {
    await render(); await answer(0, { ...taskSummary, todo: 0, overdue: 0 }); await answer(1, { items: [] }); await answer(2, { items: [] });
    expect(section("tasks")?.textContent).toContain("0 tasks");
    expect(section("knowledge")?.textContent).toContain("No recent knowledge yet.");
    expect(section("activity")?.textContent).toContain("No recent activity yet.");
    expect(container.textContent).not.toContain("Unable to load");
  });
  it("renders a retriable full error when all reads fail", async () => {
    await render(); for (let i = 0; i < 3; i++) await answer(i, {}, 503);
    expect(container.querySelector("#workbench-title")).toBeNull();
    const retry = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Try again");
    expect(retry).toBeTruthy(); await act(async () => retry!.click()); expect(requests).toHaveLength(6);
    await answer(3, taskSummary); await answer(4, knowledge); await answer(5, { items: [] });
    expect(container.textContent).toContain("Private guide");
  });
  it.each([1,2])("rejects corrupt rows in section %s rather than silently dropping them", async bad => {
    await render(); await answer(0, taskSummary);
    await answer(1, bad === 1 ? { items: [null] } : knowledge);
    await answer(2, bad === 2 ? { items: [{ id: "bad" }] } : { items: [] });
    expect(section(bad === 1 ? "knowledge" : "activity")?.textContent).toContain("Unable to load");
  });
  it("cleans up on app unmount and isolates a new signed-in session from late old responses", async () => {
    await render(); await act(async () => root.unmount());
    expect(requests.every(r => r.signal?.aborted)).toBe(true);
    const fetchBefore = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) => String(input) === "/api/session"
      ? Promise.resolve(Response.json({ ...session, member: { ...session.member, id: "member-2", email: "two@test.example" } }))
      : fetchBefore(input, init));
    root = createRoot(container); await act(async () => root.render(<App />));
    for (let n = 0; n < 20 && requests.length < 6; n++) await flush();
    expect(requests).toHaveLength(6);
    await answer(3, taskSummary); await answer(4, { items: [] }); await answer(5, { items: [] });
    for (const [i, body] of [taskSummary, knowledge, { items: [] }].entries()) await answer(i, body);
    expect(container.textContent).toContain("two@test.example"); expect(container.textContent).not.toContain("Private guide");
  });

});
