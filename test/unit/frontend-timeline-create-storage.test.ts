// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTimelineIntent, saveTimelineIntent, acknowledgeTimelineIntent, clearTimelineIntent } from "../../frontend/lib/timeline-create-intent";
const intent = { id: "intent-123", clientKey: "key-123", title: "Private title", kind: "meeting" as const, body: "", startsAt: null, dueAt: null };
const key = "memory-garden:timeline-create:v1:alice:p";
let data = new Map<string, string>();
function storage() {
  data = new Map();
  const value = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  vi.stubGlobal("window", { sessionStorage: value }); return value;
}
afterEach(() => vi.unstubAllGlobals());
describe("timeline member-scoped planning creation journal", () => {
  it("persists original payload across reads, isolates members and projects, and acknowledges monotonically", () => {
    storage(); expect(loadTimelineIntent("alice", "p")).toEqual({ kind: "empty" });
    expect(saveTimelineIntent("alice", "p", intent)).toBe(true);
    expect(loadTimelineIntent("alice", "p")).toMatchObject({ kind: "ready", intent, acknowledged: false });
    expect(loadTimelineIntent("bob", "p")).toEqual({ kind: "empty" });
    expect(loadTimelineIntent("alice", "q")).toEqual({ kind: "empty" });
    expect(acknowledgeTimelineIntent("alice", "p", intent)).toBe(true);
    expect(saveTimelineIntent("alice", "p", intent)).toBe(true);
    expect(loadTimelineIntent("alice", "p")).toMatchObject({ acknowledged: true });
    expect(clearTimelineIntent("alice", "p", intent)).toBe(true);
    expect(loadTimelineIntent("alice", "p")).toEqual({ kind: "empty" });
  });
  it("does not overwrite or clear a different unresolved payload", () => {
    storage(); saveTimelineIntent("alice", "p", intent);
    for (const other of [{ ...intent, id: "other" }, { ...intent, title: "Altered" }]) {
      expect(saveTimelineIntent("alice", "p", other)).toBe(false);
      expect(acknowledgeTimelineIntent("alice", "p", other)).toBe(false);
      expect(clearTimelineIntent("alice", "p", other)).toBe(false);
    }
    expect(loadTimelineIntent("alice", "p")).toMatchObject({ intent, acknowledged: false });
  });
  it.each(["{", "null", "[]", JSON.stringify({ version: 99 }), "x".repeat(2_500_001)])("blocks corrupted records without deleting them %#", raw => {
    storage(); data.set(key, raw);
    expect(loadTimelineIntent("alice", "p")).toEqual({ kind: "blocked" });
    expect(saveTimelineIntent("alice", "p", intent)).toBe(false);
    expect(clearTimelineIntent("alice", "p", intent)).toBe(false);
    expect(data.get(key)).toBe(raw);
  });
  it.each(["member", "project", "payload", "extra", "phase"])("blocks invalid envelope %s", mutation => {
    storage(); saveTimelineIntent("alice", "p", intent); const record = JSON.parse(data.get(key)!);
    if (mutation === "member") record.memberId = "bob";
    if (mutation === "project") record.projectId = "q";
    if (mutation === "payload") record.intent.title = "  invalid  ";
    if (mutation === "extra") record.secret = "unexpected";
    if (mutation === "phase") record.acknowledged = "yes";
    data.set(key, JSON.stringify(record)); expect(loadTimelineIntent("alice", "p")).toEqual({ kind: "blocked" });
  });
  it("fails closed on unavailable, denied, dropped or quota-limited storage", () => {
    vi.stubGlobal("window", {}); expect(loadTimelineIntent("alice", "p")).toEqual({ kind: "blocked" });
    const value = storage(); value.setItem = () => { throw new Error("quota"); };
    expect(saveTimelineIntent("alice", "p", intent)).toBe(false);
    value.setItem = () => {}; expect(saveTimelineIntent("alice", "p", intent)).toBe(false);
    Object.defineProperty((globalThis as unknown as { window: object }).window, "sessionStorage", { get() { throw new Error("denied"); } });
    expect(loadTimelineIntent("alice", "p")).toEqual({ kind: "blocked" });
  });
  it("preserves every immutable field and compares full payload before clearing", () => {
    storage(); const full = { ...intent, kind: "milestone" as const, body: "Private body", startsAt: "2026-09-27T01:00:00.000Z", dueAt: "2026-09-27T02:00:00.000Z" };
    expect(saveTimelineIntent("alice", "p", full)).toBe(true);
    expect(loadTimelineIntent("alice", "p")).toMatchObject({ intent: full });
    for (const altered of [{ ...full, kind: "decision" as const }, { ...full, body: "changed" }, { ...full, startsAt: null }, { ...full, dueAt: null }]) {
      expect(saveTimelineIntent("alice", "p", altered)).toBe(false);
      expect(clearTimelineIntent("alice", "p", altered)).toBe(false);
    }
    expect(clearTimelineIntent("alice", "p", full)).toBe(true);
  });
  it.each([
    { startsAt: "invalid" }, { startsAt: "2026-09-27T00:00:00Z" }, { dueAt: "2026-02-30T00:00:00.000Z" },
    { startsAt: "2026-09-27T01:00:00.000Z", dueAt: "2026-09-27T00:00:00.000Z" },
  ])("rejects noncanonical or reversed timeline dates %#", patch => {
    storage(); expect(saveTimelineIntent("alice", "p", { ...intent, ...patch })).toBe(false); expect(data.size).toBe(0);
  });
  it("rejects invalid outgoing intents before storing", () => {
    storage();
    for (const invalid of [{ ...intent, id: "../bad" }, { ...intent, title: "🌱".repeat(201) }, { ...intent, body: "a".repeat(200001) }, { ...intent, extra: true }]) expect(saveTimelineIntent("alice", "p", invalid)).toBe(false);
    expect(data.size).toBe(0);
  });
});
