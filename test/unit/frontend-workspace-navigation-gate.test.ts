// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceNavigationGate, type WorkspaceLeaveDecision, type WorkspaceLeaveState } from "../../frontend/lib/workspace-navigation-gate";

function draft() {
  let version = "draft-1";
  let kind: "allow" | "block" | "confirm" = "confirm";
  const decisions: WorkspaceLeaveDecision[] = [];
  const dismiss = vi.fn();
  const prompt = vi.fn((decision: WorkspaceLeaveDecision) => { decisions.push(decision); });
  const read = vi.fn((): WorkspaceLeaveState => kind === "confirm" ? { kind, version, prompt, dismiss } : { kind });
  return { read, dismiss, prompt, decisions, edit: () => { version += "-changed"; }, state: (value: typeof kind) => { kind = value; } };
}

describe("workspace navigation admission", () => {
  it("commits a clean navigation exactly once", () => {
    const gate = createWorkspaceNavigationGate(); const commit = vi.fn();
    gate.register(() => ({ kind: "allow" }));
    expect(gate.request(commit)).toBe("committed"); expect(commit).toHaveBeenCalledTimes(1);
  });
  it("also commits when no owner is registered", () => {
    const gate = createWorkspaceNavigationGate(); const commit = vi.fn();
    expect(gate.request(commit)).toBe("committed"); expect(commit).toHaveBeenCalledTimes(1);
  });
  it("prioritizes pending/unknown write locks over any dirty prompt", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn();
    gate.register(owner.read); gate.register(() => ({ kind: "block" }));
    expect(gate.request(commit)).toBe("blocked"); expect(owner.prompt).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
  });
  it("defers dirty navigation until explicit confirmation", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); gate.register(owner.read);
    expect(gate.request(commit)).toBe("deferred"); expect(commit).not.toHaveBeenCalled();
    owner.decisions[0].accept(); expect(owner.dismiss).toHaveBeenCalledTimes(1); expect(commit).toHaveBeenCalledTimes(1);
  });
  it("cancel leaves all commit side effects untouched and permits a new attempt", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const first = vi.fn(); const second = vi.fn(); gate.register(owner.read);
    gate.request(first); owner.decisions[0].cancel();
    expect(first).not.toHaveBeenCalled(); expect(owner.dismiss).toHaveBeenCalledTimes(1);
    expect(gate.request(second)).toBe("deferred"); owner.decisions[1].accept(); expect(second).toHaveBeenCalledTimes(1);
  });
  it("does not replace the first pending target with a second navigation", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const first = vi.fn(); const second = vi.fn(); gate.register(owner.read);
    gate.request(first); expect(gate.request(second)).toBe("blocked");
    owner.decisions[0].accept(); expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled(); expect(owner.prompt).toHaveBeenCalledTimes(1);
  });
  it("consumes confirm/cancel callbacks once", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); gate.register(owner.read); gate.request(commit);
    const decision = owner.decisions[0]; decision.accept(); decision.accept(); decision.cancel();
    expect(commit).toHaveBeenCalledTimes(1); expect(owner.dismiss).toHaveBeenCalledTimes(1);
  });
  it("rejects a stale callback after cancel and reopen with the same draft", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const first = vi.fn(); const second = vi.fn(); gate.register(owner.read);
    gate.request(first); const stale = owner.decisions[0]; stale.cancel(); gate.request(second); stale.accept(); stale.cancel();
    expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled(); expect(owner.dismiss).toHaveBeenCalledTimes(1);
    owner.decisions[1].accept(); expect(second).toHaveBeenCalledTimes(1);
  });
  it("invalidates an old scope on a new registration", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); gate.register(owner.read); gate.request(commit);
    gate.register(() => ({ kind: "allow" })); owner.decisions[0].accept();
    expect(commit).not.toHaveBeenCalled(); expect(owner.dismiss).toHaveBeenCalledTimes(1);
  });
  it("unmount cancels the pending decision", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); const unregister = gate.register(owner.read);
    gate.request(commit); unregister(); owner.decisions[0].accept(); expect(commit).not.toHaveBeenCalled();
    expect(gate.request(commit)).toBe("committed");
  });
  it("old idempotent cleanup cannot invalidate the next owner's attempt", () => {
    const gate = createWorkspaceNavigationGate(); const oldOwner = draft(); const owner = draft(); const commit = vi.fn();
    const unregister = gate.register(oldOwner.read); unregister(); gate.register(owner.read); gate.request(commit); unregister();
    owner.decisions[0].accept(); expect(commit).toHaveBeenCalledTimes(1); expect(owner.dismiss).toHaveBeenCalledTimes(1);
  });
  it("a changed draft invalidates confirmation rather than discarding new data", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); gate.register(owner.read); gate.request(commit);
    owner.edit(); owner.decisions[0].accept(); expect(commit).not.toHaveBeenCalled(); expect(owner.dismiss).toHaveBeenCalledTimes(1);
    expect(gate.request(commit)).toBe("deferred"); owner.decisions[1].accept(); expect(commit).toHaveBeenCalledTimes(1);
  });
  it("rechecks a write lock that appears after the prompt", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); gate.register(owner.read); gate.request(commit);
    owner.state("block"); owner.decisions[0].accept(); expect(commit).not.toHaveBeenCalled();
    owner.state("allow"); expect(gate.request(commit)).toBe("committed");
  });
  it("requires every dirty owner to consent before committing", () => {
    const gate = createWorkspaceNavigationGate(); const a = draft(); const b = draft(); const commit = vi.fn(); gate.register(a.read); gate.register(b.read);
    gate.request(commit); expect(b.prompt).not.toHaveBeenCalled(); a.decisions[0].accept();
    expect(commit).not.toHaveBeenCalled(); expect(b.prompt).toHaveBeenCalledTimes(1); b.decisions[0].accept(); expect(commit).toHaveBeenCalledTimes(1);
  });
  it("revalidates earlier consents when another owner is still deciding", () => {
    const gate = createWorkspaceNavigationGate(); const a = draft(); const b = draft(); const commit = vi.fn(); gate.register(a.read); gate.register(b.read);
    gate.request(commit); a.decisions[0].accept(); a.edit(); b.decisions[0].accept();
    expect(commit).not.toHaveBeenCalled(); expect(a.dismiss).toHaveBeenCalledTimes(1); expect(b.dismiss).toHaveBeenCalledTimes(1);
  });
  it("prompts an originally clean owner that becomes dirty during another prompt", () => {
    const gate = createWorkspaceNavigationGate(); const a = draft(); const b = draft(); const commit = vi.fn(); a.state("allow"); gate.register(a.read); gate.register(b.read);
    gate.request(commit); a.state("confirm"); b.decisions[0].accept(); expect(commit).not.toHaveBeenCalled();
    a.decisions[0].accept(); expect(commit).toHaveBeenCalledTimes(1);
  });
  it("explicit invalidation clears old decisions but retains current registrations", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); gate.register(owner.read); gate.request(commit);
    gate.invalidate(); owner.decisions[0].accept(); expect(commit).not.toHaveBeenCalled(); expect(gate.request(commit)).toBe("deferred");
  });
  it("a failing guard never commits and does not wedge future navigation", () => {
    const gate = createWorkspaceNavigationGate(); const commit = vi.fn(); const unregister = gate.register(() => { throw new Error("guard failure"); });
    expect(() => gate.request(commit)).toThrow("guard failure"); expect(commit).not.toHaveBeenCalled(); unregister(); expect(gate.request(commit)).toBe("committed");
  });
  it("a failing prompt is dismissed and cannot retain a live callback", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn();
    owner.prompt.mockImplementation(decision => { owner.decisions.push(decision); throw new Error("prompt failure"); }); gate.register(owner.read);
    expect(() => gate.request(commit)).toThrow("prompt failure"); owner.decisions[0].accept(); expect(commit).not.toHaveBeenCalled();
    expect(owner.dismiss).toHaveBeenCalledTimes(1); owner.state("allow"); expect(gate.request(commit)).toBe("committed");
  });
  it("a failing dismissal does not commit and releases the attempt", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn(); gate.register(owner.read); gate.request(commit);
    owner.dismiss.mockImplementation(() => { throw new Error("dismiss failure"); });
    expect(() => owner.decisions[0].accept()).toThrow("dismiss failure"); expect(commit).not.toHaveBeenCalled();
    owner.state("allow"); expect(gate.request(commit)).toBe("committed");
  });
  it("releases the reservation even when the accepted commit throws", () => {
    const gate = createWorkspaceNavigationGate(); const next = vi.fn();
    expect(() => gate.request(() => { throw new Error("commit failure"); })).toThrow("commit failure"); expect(gate.request(next)).toBe("committed");
  });
  it("supports a synchronous explicit consent without double committing", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const commit = vi.fn();
    owner.prompt.mockImplementation(decision => decision.accept()); gate.register(owner.read);
    expect(gate.request(commit)).toBe("committed"); expect(commit).toHaveBeenCalledTimes(1); expect(owner.dismiss).toHaveBeenCalledTimes(1);
  });
  it("rejects reentrant requests during the admitted commit", () => {
    const gate = createWorkspaceNavigationGate(); const second = vi.fn();
    expect(gate.request(() => { expect(gate.request(second)).toBe("blocked"); })).toBe("committed"); expect(second).not.toHaveBeenCalled();
  });
  it("does not permit navigation reentrancy from prompt dismissal", () => {
    const gate = createWorkspaceNavigationGate(); const owner = draft(); const second = vi.fn(); gate.register(owner.read); gate.request(vi.fn());
    owner.dismiss.mockImplementation(() => { expect(gate.request(second)).toBe("blocked"); });
    owner.decisions[0].cancel(); expect(second).not.toHaveBeenCalled();
  });
});
