import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acknowledgeCalendarIntent, clearCalendarIntent, loadCalendarIntent, saveCalendarIntent, validCalendarIntent, type CalendarCreateIntent } from "../../frontend/lib/calendar-create-intent";
const intent: CalendarCreateIntent = { id: "one", clientKey: "key", title: "Private event", startsAt: "2026-09-28T01:00:00.000Z", endsAt: "2026-09-28T02:00:00.000Z", timezone: "UTC" };
const key = "memory-garden:calendar-create:v1:alice";
describe("calendar member-scoped tab recovery journal", () => {
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    values = new Map();
    storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) };
    vi.stubGlobal("window", { sessionStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("writes, freezes and isolates the original intent per member", () => {
    expect(saveCalendarIntent("alice", intent)).toBe(true);
    const restored = loadCalendarIntent("alice");
    expect(restored).toEqual({ kind: "ready", intent, acknowledged: false });
    if (restored.kind === "ready") expect(Object.isFrozen(restored.intent)).toBe(true);
    expect(loadCalendarIntent("bob")).toEqual({ kind: "empty" });
    expect(saveCalendarIntent("bob", { ...intent, title: "Bob" })).toBe(true);
    expect(loadCalendarIntent("alice")).toEqual(restored);
  });
  it("keeps acknowledgment monotonic and never acknowledges a missing record", () => {
    expect(acknowledgeCalendarIntent("alice", intent)).toBe(false);
    expect(saveCalendarIntent("alice", intent)).toBe(true);
    expect(acknowledgeCalendarIntent("alice", intent)).toBe(true);
    expect(saveCalendarIntent("alice", intent)).toBe(true);
    expect(loadCalendarIntent("alice")).toMatchObject({ acknowledged: true });
  });
  it("cannot replace or clear a different unresolved request", () => {
    saveCalendarIntent("alice", intent);
    for (const other of [{ ...intent, id: "other" }, { ...intent, title: "different" }]) {
      expect(saveCalendarIntent("alice", other)).toBe(false);
      expect(clearCalendarIntent("alice", other)).toBe(false);
    }
    expect(clearCalendarIntent("alice", intent)).toBe(true);
    expect(loadCalendarIntent("alice")).toEqual({ kind: "empty" });
  });
  it.each(["broken", "null", JSON.stringify({ version: 2, memberId: "alice", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "bob", intent, acknowledged: false }), JSON.stringify({ version: 1, memberId: "alice", intent, acknowledged: "false" })])("fails closed for malformed storage %s", raw => {
    values.set(key, raw); expect(loadCalendarIntent("alice")).toEqual({ kind: "blocked" });
    expect(saveCalendarIntent("alice", intent)).toBe(false); expect(clearCalendarIntent("alice", intent)).toBe(false);
    expect(values.get(key)).toBe(raw);
  });
  it("blocks inaccessible or missing storage and absent identity", () => {
    expect(saveCalendarIntent("", intent)).toBe(false);
    storage.getItem.mockImplementation(() => { throw new Error("denied"); });
    expect(loadCalendarIntent("alice")).toEqual({ kind: "blocked" });
    vi.stubGlobal("window", undefined); expect(saveCalendarIntent("alice", intent)).toBe(false);
  });
  it("detects quota failure, dropped writes and failed cleanup", () => {
    storage.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    expect(saveCalendarIntent("alice", intent)).toBe(false);
    storage.setItem.mockImplementationOnce(() => undefined); expect(saveCalendarIntent("alice", intent)).toBe(false);
    expect(saveCalendarIntent("alice", intent)).toBe(true);
    storage.removeItem.mockImplementationOnce(() => undefined); expect(clearCalendarIntent("alice", intent)).toBe(false);
  });
  it.each([{ ...intent, title: " " }, { ...intent, title: " spaced " }, { ...intent, endsAt: intent.startsAt }, { ...intent, startsAt: "bad" }, { ...intent, timezone: "Bad/Zone" }, { ...intent, id: "../bad" }, { ...intent, extra: true }])("rejects invalid intent %#", value => {
    expect(validCalendarIntent(value)).toBe(false); expect(saveCalendarIntent("alice", value as CalendarCreateIntent)).toBe(false);
  });
});
