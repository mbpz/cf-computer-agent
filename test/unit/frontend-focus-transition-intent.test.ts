import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acknowledgeFocusTransition, clearFocusTransition, loadFocusTransition, saveFocusTransition, validFocusTransition, type FocusTransitionIntent } from "../../frontend/lib/focus-transition-intent";
const intent: FocusTransitionIntent = { id: "one", clientKey: "key", taskId: "task-1", action: "pause", expectedUpdatedAt: "2026-09-28T00:00:00.000Z" };
const key = "memory-garden:focus-transition:v1:alice";
describe("focus transition member-scoped tab recovery journal", () => {
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    values = new Map();
    storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) };
    vi.stubGlobal("window", { sessionStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("writes, freezes and isolates the original intent per member", () => {
    expect(saveFocusTransition("alice", intent)).toBe(true);
    const restored = loadFocusTransition("alice");
    expect(restored).toEqual({ kind: "ready", intent, acknowledged: false });
    if (restored.kind === "ready") expect(Object.isFrozen(restored.intent)).toBe(true);
    expect(loadFocusTransition("bob")).toEqual({ kind: "empty" });
    expect(saveFocusTransition("bob", { ...intent, action: "complete" })).toBe(true);
    expect(loadFocusTransition("alice")).toEqual(restored);
  });
  it("keeps acknowledgment monotonic and never acknowledges a missing record", () => {
    expect(acknowledgeFocusTransition("alice", intent)).toBe(false);
    expect(saveFocusTransition("alice", intent)).toBe(true);
    expect(acknowledgeFocusTransition("alice", intent)).toBe(true);
    expect(saveFocusTransition("alice", intent)).toBe(true);
    expect(loadFocusTransition("alice")).toMatchObject({ acknowledged: true });
  });
  it("cannot replace or clear a different unresolved request", () => {
    saveFocusTransition("alice", intent);
    for (const other of [{ ...intent, id: "other" }, { ...intent, action: "complete" as const }]) {
      expect(saveFocusTransition("alice", other)).toBe(false);
      expect(clearFocusTransition("alice", other)).toBe(false);
    }
    expect(clearFocusTransition("alice", intent)).toBe(true);
    expect(loadFocusTransition("alice")).toEqual({ kind: "empty" });
  });
  it.each(["broken", "null", JSON.stringify({ version: 2, memberId: "alice", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "bob", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "alice", intent, acknowledged: "false" })])("fails closed for malformed storage %s", raw => {
    values.set(key, raw); expect(loadFocusTransition("alice")).toEqual({ kind: "blocked" });
    expect(saveFocusTransition("alice", intent)).toBe(false); expect(clearFocusTransition("alice", intent)).toBe(false);
    expect(values.get(key)).toBe(raw);
  });
  it("blocks inaccessible or missing storage and absent identity", () => {
    expect(saveFocusTransition("", intent)).toBe(false);
    storage.getItem.mockImplementation(() => { throw new Error("denied"); });
    expect(loadFocusTransition("alice")).toEqual({ kind: "blocked" });
    vi.stubGlobal("window", undefined); expect(saveFocusTransition("alice", intent)).toBe(false);
  });
  it("detects quota failure, dropped writes and failed cleanup", () => {
    storage.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    expect(saveFocusTransition("alice", intent)).toBe(false);
    storage.setItem.mockImplementationOnce(() => undefined); expect(saveFocusTransition("alice", intent)).toBe(false);
    expect(saveFocusTransition("alice", intent)).toBe(true);
    storage.removeItem.mockImplementationOnce(() => undefined); expect(clearFocusTransition("alice", intent)).toBe(false);
  });
  it.each([{ ...intent, action: "delete" }, { ...intent, expectedUpdatedAt: "bad" }, { ...intent, expectedUpdatedAt: 1 }, { ...intent, expectedUpdatedAt: "2026-02-30T00:00:00.000Z" }, { ...intent, taskId: "" }, { ...intent, id: "../bad" }, { ...intent, extra: true }])("rejects invalid intent %#", value => {
    expect(validFocusTransition(value)).toBe(false); expect(saveFocusTransition("alice", value as FocusTransitionIntent)).toBe(false);
  });
});
