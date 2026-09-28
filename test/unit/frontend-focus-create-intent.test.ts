import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acknowledgeFocusIntent, clearFocusIntent, loadFocusIntent, saveFocusIntent, validFocusIntent, type FocusCreateIntent } from "../../frontend/lib/focus-create-intent";
const intent: FocusCreateIntent = { id: "one", clientKey: "key", taskId: "task-1", title: "Private focus", durationMinutes: 25 };
const key = "memory-garden:focus-create:v1:alice";
describe("focus member-scoped tab recovery journal", () => {
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    values = new Map();
    storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) };
    vi.stubGlobal("window", { sessionStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("writes, freezes and isolates the original intent per member", () => {
    expect(saveFocusIntent("alice", intent)).toBe(true);
    const restored = loadFocusIntent("alice");
    expect(restored).toEqual({ kind: "ready", intent, acknowledged: false });
    if (restored.kind === "ready") expect(Object.isFrozen(restored.intent)).toBe(true);
    expect(loadFocusIntent("bob")).toEqual({ kind: "empty" });
    expect(saveFocusIntent("bob", { ...intent, title: "Bob" })).toBe(true);
    expect(loadFocusIntent("alice")).toEqual(restored);
  });
  it("keeps acknowledgment monotonic and never acknowledges a missing record", () => {
    expect(acknowledgeFocusIntent("alice", intent)).toBe(false);
    expect(saveFocusIntent("alice", intent)).toBe(true);
    expect(acknowledgeFocusIntent("alice", intent)).toBe(true);
    expect(saveFocusIntent("alice", intent)).toBe(true);
    expect(loadFocusIntent("alice")).toMatchObject({ acknowledged: true });
  });
  it("cannot replace or clear a different unresolved request", () => {
    saveFocusIntent("alice", intent);
    for (const other of [{ ...intent, id: "other" }, { ...intent, title: "different" }]) {
      expect(saveFocusIntent("alice", other)).toBe(false);
      expect(clearFocusIntent("alice", other)).toBe(false);
    }
    expect(clearFocusIntent("alice", intent)).toBe(true);
    expect(loadFocusIntent("alice")).toEqual({ kind: "empty" });
  });
  it.each(["broken", "null", JSON.stringify({ version: 2, memberId: "alice", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "bob", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "alice", intent, acknowledged: "false" })])("fails closed for malformed storage %s", raw => {
    values.set(key, raw); expect(loadFocusIntent("alice")).toEqual({ kind: "blocked" });
    expect(saveFocusIntent("alice", intent)).toBe(false); expect(clearFocusIntent("alice", intent)).toBe(false);
    expect(values.get(key)).toBe(raw);
  });
  it("blocks inaccessible or missing storage and absent identity", () => {
    expect(saveFocusIntent("", intent)).toBe(false);
    storage.getItem.mockImplementation(() => { throw new Error("denied"); });
    expect(loadFocusIntent("alice")).toEqual({ kind: "blocked" });
    vi.stubGlobal("window", undefined); expect(saveFocusIntent("alice", intent)).toBe(false);
  });
  it("detects quota failure, dropped writes and failed cleanup", () => {
    storage.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    expect(saveFocusIntent("alice", intent)).toBe(false);
    storage.setItem.mockImplementationOnce(() => undefined); expect(saveFocusIntent("alice", intent)).toBe(false);
    expect(saveFocusIntent("alice", intent)).toBe(true);
    storage.removeItem.mockImplementationOnce(() => undefined); expect(clearFocusIntent("alice", intent)).toBe(false);
  });
  it.each([{ ...intent, title: " " }, { ...intent, title: " spaced " }, { ...intent, durationMinutes: 0 }, { ...intent, durationMinutes: 1.5 }, { ...intent, taskId: "" }, { ...intent, id: "../bad" }, { ...intent, extra: true }])("rejects invalid intent %#", value => {
    expect(validFocusIntent(value)).toBe(false); expect(saveFocusIntent("alice", value as FocusCreateIntent)).toBe(false);
  });
});
