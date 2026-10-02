// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceLeaveGuard, endWorkspaceSession, subscribeWorkspaceLocation, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import type { WorkspaceLeaveDecision } from "../../frontend/lib/workspace-navigation-gate";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("workspace explicit navigation admission", () => {
  let browser: InstanceType<typeof Window>;
  beforeEach(() => { browser = new Window({ url: "https://app.test/tasks?page=2" }); vi.stubGlobal("window", browser); });
  afterEach(() => { browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function dirty() {
    let decision!: WorkspaceLeaveDecision;
    const dismiss = vi.fn();
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: "confirm", version: "draft-1", prompt(next) { decision = next; }, dismiss }));
    return { get decision() { return decision; }, dismiss, unregister };
  }

  it("commits history, query state, then one notification in order", () => {
    const seen: string[] = [];
    let query = "old";
    subscribeWorkspaceLocation(() => seen.push(`${browser.location.pathname}:${query}`));
    const result = writeWorkspaceHistory("push", "/inbox", () => { expect(browser.location.pathname).toBe("/inbox"); query = "new"; });
    expect(result).toBe("committed"); expect(seen).toEqual(["/inbox:new"]);
  });
  it.each(["push", "replace"] as const)("canceling %s does not touch URL, history, query or events", mode => {
    const guard = dirty(); const changed = vi.fn(); const commit = vi.fn(); subscribeWorkspaceLocation(changed);
    const length = browser.history.length;
    expect(writeWorkspaceHistory(mode, "/tasks?page=3", commit)).toBe("deferred");
    expect(browser.location.search).toBe("?page=2"); expect(commit).not.toHaveBeenCalled();
    guard.decision.cancel();
    expect(browser.history.length).toBe(length); expect(browser.location.search).toBe("?page=2");
    expect(commit).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });
  it("accepting pagination runs the captured commit exactly once", () => {
    const guard = dirty(); const commit = vi.fn(); const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    writeWorkspaceHistory("push", "/tasks?page=3", commit);
    guard.decision.accept(); guard.decision.accept();
    expect(browser.location.search).toBe("?page=3"); expect(commit).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledTimes(1);
  });
  it("a write lock rejects without side effects", () => {
    registerWorkspaceLeaveGuard(() => ({ kind: "block" })); const commit = vi.fn();
    expect(writeWorkspaceHistory("push", "/inbox", commit)).toBe("blocked"); expect(commit).not.toHaveBeenCalled(); expect(browser.location.pathname).toBe("/tasks");
  });
  it("does not replace a pending target with a second request", () => {
    const guard = dirty(); writeWorkspaceHistory("push", "/inbox");
    expect(writeWorkspaceHistory("push", "/calendar")).toBe("blocked"); guard.decision.accept(); expect(browser.location.pathname).toBe("/inbox");
  });
  it("normalization replace is not an unguarded escape hatch", () => {
    const guard = dirty(); const length = browser.history.length;
    expect(writeWorkspaceHistory("replace", "/tasks?page=1")).toBe("deferred"); guard.decision.accept();
    expect(browser.location.search).toBe("?page=1"); expect(browser.history.length).toBe(length);
  });
  it("guards belong to their window, and cleanup captures the original window", () => {
    const guard = dirty(); const second = new Window({ url: "https://app.test/calendar" });
    try {
      vi.stubGlobal("window", second); const secondGuard = dirty(); guard.unregister();
      expect(writeWorkspaceHistory("push", "/inbox")).toBe("deferred"); secondGuard.decision.cancel(); secondGuard.unregister();
      expect(writeWorkspaceHistory("push", "/inbox")).toBe("committed");
      vi.stubGlobal("window", browser); expect(writeWorkspaceHistory("push", "/search")).toBe("committed");
    } finally { second.close(); }
  });
  it("an accepted callback commits only to its captured window", () => {
    const guard = dirty(); writeWorkspaceHistory("push", "/inbox"); const second = new Window({ url: "https://app.test/calendar" });
    try { vi.stubGlobal("window", second); guard.decision.accept(); expect(browser.location.pathname).toBe("/inbox"); expect(second.location.pathname).toBe("/calendar"); }
    finally { second.close(); }
  });
  it("a rejected history write cannot mutate query state or publish an event", () => {
    const commit = vi.fn(); const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    vi.spyOn(browser.history, "pushState").mockImplementation(() => { throw new Error("history rejected"); });
    expect(() => writeWorkspaceHistory("push", "/inbox", commit)).toThrow("history rejected");
    expect(commit).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });
  it("publishes an already committed URL even if route side effects throw, then releases admission", () => {
    const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    expect(() => writeWorkspaceHistory("push", "/inbox", () => { throw new Error("route callback failed"); })).toThrow("route callback failed");
    expect(browser.location.pathname).toBe("/inbox"); expect(changed).toHaveBeenCalledOnce();
    expect(writeWorkspaceHistory("push", "/calendar")).toBe("committed");
  });
  it("a location subscriber cannot recursively redirect an admitted commit", () => {
    let nested: unknown; let notifications = 0;
    subscribeWorkspaceLocation(() => { notifications++; nested = writeWorkspaceHistory("push", "/calendar"); });
    expect(writeWorkspaceHistory("push", "/inbox")).toBe("committed");
    expect(nested).toBe("blocked"); expect(notifications).toBe(1); expect(browser.location.pathname).toBe("/inbox");
  });
  it("subscription cleanup uses the original window", () => {
    const changed = vi.fn(); const remove = subscribeWorkspaceLocation(changed); const second = new Window({ url: "https://app.test/" });
    try { vi.stubGlobal("window", second); remove(); vi.stubGlobal("window", browser); writeWorkspaceHistory("push", "/inbox"); expect(changed).not.toHaveBeenCalled(); }
    finally { second.close(); }
  });
  it("successful session end clears private state despite a guard and invalidates old consent", () => {
    const guard = dirty(); const oldCommit = vi.fn(); writeWorkspaceHistory("push", "/calendar", oldCommit); const oldDecision = guard.decision;
    let privateState = true; const observations: boolean[] = []; subscribeWorkspaceLocation(() => observations.push(privateState));
    endWorkspaceSession(() => { privateState = false; });
    expect(browser.location.pathname).toBe("/"); expect(observations).toEqual([false]); expect(guard.dismiss).toHaveBeenCalledTimes(1);
    oldDecision.accept(); expect(oldCommit).not.toHaveBeenCalled();
    const nextOwner = dirty(); guard.unregister();
    expect(writeWorkspaceHistory("push", "/inbox")).toBe("deferred"); nextOwner.decision.cancel();
  });
  it("session cleanup is not held hostage by a throwing prompt dismissal", () => {
    registerWorkspaceLeaveGuard(() => ({ kind: "confirm", version: "1", prompt() {}, dismiss() { throw new Error("dismiss failed"); } }));
    writeWorkspaceHistory("push", "/calendar"); const clear = vi.fn();
    expect(() => endWorkspaceSession(clear)).toThrow("dismiss failed"); expect(clear).toHaveBeenCalledOnce(); expect(browser.location.pathname).toBe("/");
  });
});
