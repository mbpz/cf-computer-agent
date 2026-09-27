import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acknowledgeInboxIntent, clearInboxIntent, loadInboxIntent, saveInboxIntent, validInboxIntent, type InboxCreateIntent } from "../../frontend/lib/inbox-create-intent";
const intent: InboxCreateIntent = { id: "one", clientKey: "key", kind: "text", content: "Private note", sourceUrl: null };
const key = "memory-garden:inbox-create:v1:alice";
describe("inbox member-scoped tab recovery journal", () => {
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    values = new Map();
    storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) };
    vi.stubGlobal("window", { sessionStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("writes, freezes and isolates the original intent per member", () => {
    expect(saveInboxIntent("alice", intent)).toBe(true);
    const restored = loadInboxIntent("alice");
    expect(restored).toEqual({ kind: "ready", intent, acknowledged: false });
    if (restored.kind === "ready") expect(Object.isFrozen(restored.intent)).toBe(true);
    expect(loadInboxIntent("bob")).toEqual({ kind: "empty" });
    expect(saveInboxIntent("bob", { ...intent, content: "Bob" })).toBe(true);
    expect(loadInboxIntent("alice")).toEqual(restored);
  });
  it("keeps acknowledgment monotonic and never acknowledges a missing record", () => {
    expect(acknowledgeInboxIntent("alice", intent)).toBe(false);
    expect(saveInboxIntent("alice", intent)).toBe(true);
    expect(acknowledgeInboxIntent("alice", intent)).toBe(true);
    expect(saveInboxIntent("alice", intent)).toBe(true);
    expect(loadInboxIntent("alice")).toMatchObject({ acknowledged: true });
  });
  it("cannot replace or clear a different unresolved request", () => {
    saveInboxIntent("alice", intent);
    for (const other of [{ ...intent, id: "other" }, { ...intent, content: "different" }]) {
      expect(saveInboxIntent("alice", other)).toBe(false);
      expect(clearInboxIntent("alice", other)).toBe(false);
    }
    expect(clearInboxIntent("alice", intent)).toBe(true);
    expect(loadInboxIntent("alice")).toEqual({ kind: "empty" });
  });
  it.each(["broken", "null", JSON.stringify({ version: 2, memberId: "alice", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "bob", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "alice", intent, acknowledged: "false" })])("fails closed for malformed storage %s", raw => {
    values.set(key, raw); expect(loadInboxIntent("alice")).toEqual({ kind: "blocked" });
    expect(saveInboxIntent("alice", intent)).toBe(false); expect(clearInboxIntent("alice", intent)).toBe(false);
    expect(values.get(key)).toBe(raw);
  });
  it("blocks inaccessible or missing storage and absent identity", () => {
    expect(saveInboxIntent("", intent)).toBe(false);
    storage.getItem.mockImplementation(() => { throw new Error("denied"); });
    expect(loadInboxIntent("alice")).toEqual({ kind: "blocked" });
    vi.stubGlobal("window", undefined); expect(saveInboxIntent("alice", intent)).toBe(false);
  });
  it("detects quota failure, dropped writes and failed cleanup", () => {
    storage.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    expect(saveInboxIntent("alice", intent)).toBe(false);
    storage.setItem.mockImplementationOnce(() => undefined); expect(saveInboxIntent("alice", intent)).toBe(false);
    expect(saveInboxIntent("alice", intent)).toBe(true);
    storage.removeItem.mockImplementationOnce(() => undefined); expect(clearInboxIntent("alice", intent)).toBe(false);
  });
  it.each([{ ...intent, content: " " }, { ...intent, content: " spaced " }, { ...intent, content: "\u0000" }, { ...intent, sourceUrl: "https://example.com" }, { ...intent, kind: "link", sourceUrl: "javascript:alert(1)" }, { ...intent, kind: "link", sourceUrl: null }, { ...intent, id: "../bad" }, { ...intent, extra: true }])("rejects invalid intent %#", value => {
    expect(validInboxIntent(value)).toBe(false); expect(saveInboxIntent("alice", value as InboxCreateIntent)).toBe(false);
  });
  it("accepts a frozen valid link payload", () => {
    const link = Object.freeze({ ...intent, kind: "link" as const, sourceUrl: "https://example.com/a?q=b#c" });
    expect(saveInboxIntent("alice", link)).toBe(true); expect(loadInboxIntent("alice")).toMatchObject({ intent: link });
  });
});
