// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceNavigationGate, type WorkspaceLeaveDecision, type WorkspaceLeaveState } from "../../frontend/lib/workspace-navigation-gate";
import { createWorkspaceHistoryTraversal, type WorkspaceHistoryEntry } from "../../frontend/lib/workspace-history-traversal";

const a = { key: "a", id: "a-1", url: "https://app.test/tasks?page=2" };
const b = { key: "b", id: "b-1", url: "https://app.test/inbox" };
const c = { key: "c", id: "c-1", url: "https://app.test/calendar" };
function harness() {
  const gate = createWorkspaceNavigationGate(); let current: WorkspaceHistoryEntry | null = a;
  let kind: "allow" | "block" | "confirm" = "confirm"; let version = "1";
  const decisions: WorkspaceLeaveDecision[] = []; const published: WorkspaceHistoryEntry[] = [];
  const moves: Array<{ entry: WorkspaceHistoryEntry; reject: (reason: unknown) => void; resolve: () => void }> = [];
  const fault = vi.fn(); const dismiss = vi.fn();
  const remove = gate.register((): WorkspaceLeaveState => kind === "confirm" ? { kind, version, prompt: d => { decisions.push(d); }, dismiss } : { kind });
  const controller = createWorkspaceHistoryTraversal(gate, {
    read: () => current,
    traverse: entry => new Promise<void>((resolve, reject) => { moves.push({ entry, resolve, reject }); }),
    publish: entry => { published.push(entry); }, fault,
  });
  const arrive = (entry: WorkspaceHistoryEntry | null) => { current = entry; controller.observe(); };
  return { gate, controller, decisions, published, moves, fault, remove, dismiss, arrive, moveWithoutEvent: (entry: WorkspaceHistoryEntry) => { current = entry; }, setKind: (value: typeof kind) => { kind = value; }, edit: () => { version += "x"; } };
}

describe("accepted history traversal", () => {
  it("keeps the accepted position and restores its exact identity before asking to leave", () => {
    const h = harness(); h.arrive(b);
    expect(h.controller.accepted()).toEqual(a); expect(h.controller.busy()).toBe(true);
    expect(h.moves.map(m => m.entry)).toEqual([a]); expect(h.published).toEqual([]); expect(h.decisions).toHaveLength(0);
    h.arrive(a); expect(h.decisions).toHaveLength(1); expect(h.controller.busy()).toBe(true);
  });
  it("cancel keeps the original URL/entry and never publishes a destination", () => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].cancel();
    expect(h.controller.accepted()).toEqual(a); expect(h.controller.busy()).toBe(false); expect(h.published).toEqual([]); expect(h.moves).toHaveLength(1);
  });
  it("confirmation prepares exactly one replay and publishes only at actual arrival", () => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].accept(); h.decisions[0].accept();
    expect(h.moves.map(m => m.entry)).toEqual([a, b]); expect(h.published).toEqual([]);
    expect(h.gate.request(vi.fn())).toBe("blocked"); h.arrive(b); h.arrive(b);
    expect(h.published).toEqual([b]); expect(h.controller.accepted()).toEqual(b); expect(h.controller.busy()).toBe(false);
  });
  it.each(["edit", "block"] as const)("restores without publishing when %s invalidates consent during native replay", change => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].accept();
    if (change === "edit") h.edit(); else h.setKind("block"); h.arrive(b);
    expect(h.published).toEqual([]); expect(h.moves.map(m => m.entry)).toEqual([a, b, a]); h.arrive(a);
    expect(h.controller.busy()).toBe(false); expect(h.controller.accepted()).toEqual(a);
  });
  it("pending/unknown writes restore without offering discard", () => {
    const h = harness(); h.setKind("block"); h.arrive(b); h.arrive(a);
    expect(h.decisions).toEqual([]); expect(h.moves.map(m => m.entry)).toEqual([a]); expect(h.controller.busy()).toBe(false); expect(h.published).toEqual([]);
  });
  it("does not replace the first destination during restoration", () => {
    const h = harness(); h.arrive(b); h.arrive(c); h.arrive(a); h.decisions[0].accept();
    expect(h.moves.map(m => m.entry)).toEqual([a, b]); h.arrive(b); expect(h.published).toEqual([b]);
  });
  it("a new traversal during the prompt cancels old consent and restores instead of committing either target", () => {
    const h = harness(); h.arrive(b); h.arrive(a); const old = h.decisions[0]; h.arrive(c); old.accept(); h.arrive(a);
    expect(h.published).toEqual([]); expect(h.controller.busy()).toBe(false); expect(h.dismiss).toHaveBeenCalledOnce();
  });
  it("an unknown destination is restored by the known origin identity, never a guessed delta", () => {
    const h = harness(); h.arrive(null); expect(h.moves.map(m => m.entry)).toEqual([a]); h.arrive(a);
    expect(h.fault).toHaveBeenCalledWith("unknown-entry"); expect(h.published).toEqual([]); expect(h.decisions).toEqual([]); expect(h.controller.busy()).toBe(false);
  });
  it("same URL at a different entry is still a traversal; same key with replaced content is not an accepted arrival", () => {
    const h = harness(); const sameUrl = { ...a, key: "other", id: "other-1" }; h.arrive(sameUrl); h.arrive(a); h.decisions[0].accept();
    h.arrive({ ...sameUrl, id: "replaced" }); expect(h.published).toEqual([]); expect(h.moves.at(-1)?.entry).toEqual(a);
  });
  it("finished promises never substitute for an arrival event or publish it twice", async () => {
    const h = harness(); h.setKind("allow"); h.arrive(b); h.moves[0].resolve(); await Promise.resolve();
    expect(h.published).toEqual([]); h.arrive(a); h.moves[1].resolve(); await Promise.resolve(); expect(h.published).toEqual([]);
    h.arrive(b); h.arrive(b); expect(h.published).toEqual([b]);
  });
  it("restoration failure leaves the accepted view locked, not silently at the target", async () => {
    const h = harness(); h.arrive(b); h.moves[0].reject(new Error("missing original entry")); await Promise.resolve();
    expect(h.fault).toHaveBeenCalledWith("restore-failed"); expect(h.controller.busy()).toBe(true); expect(h.controller.accepted()).toEqual(a); expect(h.published).toEqual([]);
  });
  it("a rejected replay restores the original entry and invalidates the old permit", async () => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].accept(); h.moveWithoutEvent(b); h.moves[1].reject(new Error("replay rejected")); await Promise.resolve();
    expect(h.moves.at(-1)?.entry).toEqual(a); h.arrive(a); h.decisions[0].accept(); expect(h.published).toEqual([]); expect(h.fault).toHaveBeenCalledWith("replay-failed");
  });
  it("session disposal makes old browser completions and prompts inert", async () => {
    const h = harness(); h.arrive(b); h.arrive(a); const old = h.decisions[0]; h.controller.dispose(); old.accept(); h.arrive(b);
    h.moves[0].reject(new Error("late")); await Promise.resolve(); expect(h.published).toEqual([]); expect(h.fault).not.toHaveBeenCalled(); expect(h.controller.busy()).toBe(true);
  });
  it("an admitted explicit commit becomes the new restoration anchor", () => {
    const h = harness(); h.moveWithoutEvent(c); h.controller.recordCommit(); h.arrive(b);
    expect(h.controller.accepted()).toEqual(c); expect(h.moves[0].entry).toEqual(c);
  });
  it("guard unregister while waiting on replay restores instead of trusting prior approval", async () => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].accept();
    h.moveWithoutEvent(b); h.remove();
    expect(h.moves.at(-1)?.entry).toEqual(a); h.arrive(a);
    expect(h.controller.busy()).toBe(true); h.moves[1].resolve(); await Promise.resolve();
    expect(h.published).toEqual([]); expect(h.controller.busy()).toBe(false);
  });
  it("a rejection from the initial restore cannot invalidate the later replay", async () => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].accept();
    h.moves[0].reject(new Error("late restore rejection")); await Promise.resolve(); h.arrive(b);
    expect(h.published).toEqual([b]); expect(h.fault).not.toHaveBeenCalled();
  });
  it("a rebase is rejected while a traversal owns the accepted anchor", () => {
    const h = harness(); h.arrive(b);
    expect(() => h.controller.recordCommit()).toThrow("busy history");
    expect(h.controller.accepted()).toEqual(a);
  });
  it("a busy unrelated gate is not replaced by history admission", () => {
    const h = harness(); const explicit = vi.fn(); h.gate.request(explicit);
    h.arrive(b); h.arrive(a);
    expect(h.controller.busy()).toBe(false); expect(h.decisions).toHaveLength(1);
    h.decisions[0].accept(); expect(explicit).toHaveBeenCalledOnce(); expect(h.published).toEqual([]);
  });
  it("copies accepted entries so external mutation cannot rewrite the restore anchor", () => {
    const h = harness(); h.controller.accepted().url = "https://app.test/changed";
    h.arrive(b); expect(h.moves[0].entry).toEqual(a);
  });
  it("a synchronous restore failure locks rather than publishing the raw location", () => {
    const gate = createWorkspaceNavigationGate(); let current = a; const fault = vi.fn(); const publish = vi.fn();
    const controller = createWorkspaceHistoryTraversal(gate, { read: () => current,
      traverse: () => { throw new Error("entry disposed"); }, publish, fault });
    current = b; controller.observe();
    expect(fault).toHaveBeenCalledWith("restore-failed"); expect(controller.busy()).toBe(true); expect(publish).not.toHaveBeenCalled();
  });
  it("initial unknown history is refused rather than fabricated", () => {
    expect(() => createWorkspaceHistoryTraversal(createWorkspaceNavigationGate(), {
      read: () => null, traverse: vi.fn(), publish: vi.fn(), fault: vi.fn(),
    })).toThrow("known initial entry");
  });

  it("keeps admission locked when canceled before a queued replay actually arrives", async () => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].accept(); h.remove();
    expect(h.controller.busy()).toBe(true);
    h.arrive(b); expect(h.published).toEqual([]); expect(h.moves.at(-1)?.entry).toEqual(a);
    h.arrive(a); h.moves[1].resolve(); await Promise.resolve();
    expect(h.controller.busy()).toBe(false); expect(h.published).toEqual([]);
  });
  it("a canceled queued replay that fails at the origin releases without a fake arrival", async () => {
    const h = harness(); h.arrive(b); h.arrive(a); h.decisions[0].accept(); h.remove();
    expect(h.controller.busy()).toBe(true); h.moves[1].reject(new Error("aborted")); await Promise.resolve();
    expect(h.controller.busy()).toBe(false); expect(h.fault).not.toHaveBeenCalled(); expect(h.moves).toHaveLength(2);
  });

});
