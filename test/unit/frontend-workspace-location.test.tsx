// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWorkspaceHistoryFault, retryWorkspaceHistory, readWorkspaceLocation, registerWorkspaceLeaveGuard, endWorkspaceSession, subscribeWorkspaceLocation, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { createWorkspaceBrowserHistory } from "../../frontend/lib/workspace-browser-history";
import { createWorkspaceNavigationGate } from "../../frontend/lib/workspace-navigation-gate";
import type { WorkspaceLeaveDecision } from "../../frontend/lib/workspace-navigation-gate";

import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

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
  it.each([true, false])("publishes only an admitted history arrival (Navigation API=%s)", native => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis, native);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks?page=2");
    const guard = dirty(); const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    driver.arrive(1);
    expect(readWorkspaceLocation()).toMatchObject({ pathname: "/tasks", search: "?page=2" });
    expect(changed).not.toHaveBeenCalled(); expect(driver.requests[0].index).toBe(2);
    expect(writeWorkspaceHistory("push", "/calendar")).toBe("blocked");
    driver.arrive(2); guard.decision.cancel();
    expect(browser.location.pathname).toBe("/tasks"); expect(changed).not.toHaveBeenCalled();
    driver.arrive(1); driver.arrive(2); guard.decision.accept();
    expect(driver.requests.at(-1)?.index).toBe(1); expect(changed).not.toHaveBeenCalled();
    driver.arrive(1); driver.arrive(1);
    expect(changed).toHaveBeenCalledOnce(); expect(readWorkspaceLocation().pathname).toBe("/inbox");
  });
  it("does not use the transient raw URL to resolve explicit navigation", () => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks?page=2");
    dirty(); driver.arrive(1); const mutation = vi.fn();
    expect(writeWorkspaceHistory("replace", "?page=3", mutation)).toBe("blocked");
    expect(mutation).not.toHaveBeenCalled(); expect(readWorkspaceLocation().search).toBe("?page=2");
  });
  it("successful logout disposes the history reservation and old consent", () => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    const guard = dirty(); driver.arrive(1); driver.arrive(2); const old = guard.decision;
    const changed = vi.fn(); subscribeWorkspaceLocation(changed); endWorkspaceSession(vi.fn());
    old.accept(); expect(browser.location.pathname).toBe("/"); expect(readWorkspaceLocation().pathname).toBe("/");
    expect(changed).toHaveBeenCalledOnce(); expect(writeWorkspaceHistory("push", "/calendar")).toBe("committed");
  });

  it("an older explicit prompt cannot commit during browser restoration", () => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    const guard = dirty(); const commit = vi.fn(); writeWorkspaceHistory("push", "/calendar", commit);
    const old = guard.decision; driver.arrive(1);
    expect(() => old.accept()).not.toThrow(); expect(commit).not.toHaveBeenCalled();
    expect(readWorkspaceLocation().pathname).toBe("/tasks"); driver.arrive(2); guard.decision.cancel();
  });

  it("fails closed on an untracked fallback position and can retry once the exact original entry returns", async () => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis, false);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    dirty(); const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    driver.corruptState(1); driver.arrive(1); await Promise.resolve(); await Promise.resolve();
    expect(driver.requests).toEqual([]); expect(readWorkspaceHistoryFault()).toBe("restore-failed");
    expect(readWorkspaceLocation().pathname).toBe("/tasks"); expect(changed).not.toHaveBeenCalled();
    expect(writeWorkspaceHistory("push", "/calendar")).toBe("blocked");
    driver.arrive(2); expect(await retryWorkspaceHistory()).toBe(true);
    expect(readWorkspaceHistoryFault()).toBeNull(); expect(changed).not.toHaveBeenCalled();
    expect(writeWorkspaceHistory("push", "/calendar")).toBe("deferred");
  });
  it.each([true, false])("retains the accepted route if restoration times out (native=%s)", async native => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis, native);
    const timers: Array<() => void> = [];
    vi.spyOn(browser, "setTimeout").mockImplementation(((callback: () => void) => { timers.push(callback); return 1; }) as unknown as typeof browser.setTimeout);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    dirty(); const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    driver.arrive(1); expect(timers).toHaveLength(1); timers[0]();
    await Promise.resolve(); await Promise.resolve();
    expect(readWorkspaceHistoryFault()).toBe("restore-failed");
    expect(readWorkspaceLocation().pathname).toBe("/tasks"); expect(changed).not.toHaveBeenCalled();
    expect(writeWorkspaceHistory("push", "/calendar")).toBe("blocked");
    driver.arrive(2); expect(changed).not.toHaveBeenCalled();
    const retried = retryWorkspaceHistory();
    if (native) driver.requests.at(-1)!.resolve();
    expect(await retried).toBe(true); expect(readWorkspaceHistoryFault()).toBeNull();
  });
  it("does not traverse a native anchor whose identity was replaced", async () => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    dirty(); const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    driver.forget(2); driver.arrive(1); await Promise.resolve(); await Promise.resolve();
    expect(driver.requests).toEqual([]); expect(readWorkspaceHistoryFault()).toBe("restore-failed");
    expect(readWorkspaceLocation().pathname).toBe("/tasks"); expect(changed).not.toHaveBeenCalled();
    expect(await retryWorkspaceHistory()).toBe(false);
  });

  it("preserves unrelated history state when stamping the fallback anchor", () => {
    browser.history.replaceState({ anotherOwner: "retain" }, "", "/tasks");
    readWorkspaceLocation(); expect(browser.history.state).toMatchObject({ anotherOwner: "retain" });
  });

  it.each([true, false])("does not publish a queued old-session replay after logout (native=%s)", async native => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis, native);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    const guard = dirty(); const changed = vi.fn(); subscribeWorkspaceLocation(changed);
    driver.arrive(1); driver.arrive(2); await Promise.resolve();
    guard.decision.accept(); expect(driver.requests.at(-1)?.index).toBe(1);
    endWorkspaceSession(() => {}); changed.mockClear();
    driver.arrive(1); await Promise.resolve(); await Promise.resolve();
    expect(readWorkspaceLocation().pathname).toBe("/");
    expect(browser.location.pathname).toBe("/");
    expect(changed).not.toHaveBeenCalled();
    expect(writeWorkspaceHistory("push", "/home")).toBe("committed");
  });

  it.each([true, false])("fallback document restart never trusts the preceding epoch (guard present=%s)", async guarded => {
    const owner = browser as unknown as Window & typeof globalThis;
    const driver = installWorkspaceHistoryDriver(owner, false);
    const previous = createWorkspaceBrowserHistory(owner, createWorkspaceNavigationGate(), () => false, vi.fn());
    previous.write("push", "https://app.test/inbox");
    previous.write("push", "https://app.test/tasks?page=2");
    previous.dispose();
    const published = vi.fn();
    const gate = createWorkspaceNavigationGate();
    const prompt = vi.fn();
    if (guarded) gate.register(() => ({ kind: "confirm", version: "new-document-draft", prompt, dismiss() {} }));
    const current = createWorkspaceBrowserHistory(owner, gate, () => guarded, published);
    try {
      driver.arrive(1);
      expect(driver.requests).toHaveLength(0); // Never guess a delta across epochs.
      expect(prompt).not.toHaveBeenCalled();
      if (guarded) {
        expect(current.url().href).toBe("https://app.test/tasks?page=2");
        await Promise.resolve(); await Promise.resolve();
        expect(current.fault()).toBe("restore-failed");
        expect(current.busy()).toBe(true);
        expect(() => current.write("push", "https://app.test/calendar")).toThrow("History is busy");
        expect(published).not.toHaveBeenCalled();
      } else {
        expect(current.url().href).toBe("https://app.test/inbox");
        expect(current.fault()).toBeNull();
        expect(published).toHaveBeenCalledOnce();
      }
    } finally { current.dispose(); }
  });

});
