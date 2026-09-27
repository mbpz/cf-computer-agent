// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPlanningIntent, savePlanningIntent, acknowledgePlanningIntent, clearPlanningIntent } from "../../frontend/lib/planning-create-intent";
const intent = { id: "intent-123", clientKey: "key-123", title: "Private title", description: null };
const key = "memory-garden:planning-create:v1:alice:GOALS";
let data = new Map<string, string>();
function storage() {
  data = new Map();
  const value = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  vi.stubGlobal("window", { sessionStorage: value }); return value;
}
afterEach(() => vi.unstubAllGlobals());
describe("member-scoped planning creation journal", () => {
  it("persists original payload across reads, isolates members and modules, and acknowledges monotonically", () => {
    storage(); expect(loadPlanningIntent("alice", "GOALS")).toEqual({ kind: "empty" });
    expect(savePlanningIntent("alice", "GOALS", intent)).toBe(true);
    expect(loadPlanningIntent("alice", "GOALS")).toMatchObject({ kind: "ready", intent, acknowledged: false });
    expect(loadPlanningIntent("bob", "GOALS")).toEqual({ kind: "empty" });
    expect(loadPlanningIntent("alice", "PROJECTS")).toEqual({ kind: "empty" });
    expect(acknowledgePlanningIntent("alice", "GOALS", intent)).toBe(true);
    expect(savePlanningIntent("alice", "GOALS", intent)).toBe(true);
    expect(loadPlanningIntent("alice", "GOALS")).toMatchObject({ acknowledged: true });
    expect(clearPlanningIntent("alice", "GOALS", intent)).toBe(true);
    expect(loadPlanningIntent("alice", "GOALS")).toEqual({ kind: "empty" });
  });
  it("does not overwrite or clear a different unresolved payload", () => {
    storage(); savePlanningIntent("alice", "GOALS", intent);
    for (const other of [{ ...intent, id: "other" }, { ...intent, title: "Altered" }]) {
      expect(savePlanningIntent("alice", "GOALS", other)).toBe(false);
      expect(acknowledgePlanningIntent("alice", "GOALS", other)).toBe(false);
      expect(clearPlanningIntent("alice", "GOALS", other)).toBe(false);
    }
    expect(loadPlanningIntent("alice", "GOALS")).toMatchObject({ intent, acknowledged: false });
  });
  it.each(["{", "null", "[]", JSON.stringify({ version: 99 }), "x".repeat(2_500_001)])("blocks corrupted records without deleting them %#", raw => {
    storage(); data.set(key, raw);
    expect(loadPlanningIntent("alice", "GOALS")).toEqual({ kind: "blocked" });
    expect(savePlanningIntent("alice", "GOALS", intent)).toBe(false);
    expect(clearPlanningIntent("alice", "GOALS", intent)).toBe(false);
    expect(data.get(key)).toBe(raw);
  });
  it.each(["member", "module", "payload", "extra", "phase"])("blocks invalid envelope %s", mutation => {
    storage(); savePlanningIntent("alice", "GOALS", intent); const record = JSON.parse(data.get(key)!);
    if (mutation === "member") record.memberId = "bob";
    if (mutation === "module") record.module = "PROJECTS";
    if (mutation === "payload") record.intent.title = "  invalid  ";
    if (mutation === "extra") record.secret = "unexpected";
    if (mutation === "phase") record.acknowledged = "yes";
    data.set(key, JSON.stringify(record)); expect(loadPlanningIntent("alice", "GOALS")).toEqual({ kind: "blocked" });
  });
  it("fails closed on unavailable, denied, dropped or quota-limited storage", () => {
    vi.stubGlobal("window", {}); expect(loadPlanningIntent("alice", "GOALS")).toEqual({ kind: "blocked" });
    const value = storage(); value.setItem = () => { throw new Error("quota"); };
    expect(savePlanningIntent("alice", "GOALS", intent)).toBe(false);
    value.setItem = () => {}; expect(savePlanningIntent("alice", "GOALS", intent)).toBe(false);
    Object.defineProperty((globalThis as unknown as { window: object }).window, "sessionStorage", { get() { throw new Error("denied"); } });
    expect(loadPlanningIntent("alice", "GOALS")).toEqual({ kind: "blocked" });
  });
  it("rejects invalid outgoing intents before storing", () => {
    storage();
    for (const invalid of [{ ...intent, id: "../bad" }, { ...intent, title: "🌱".repeat(201) }, { ...intent, description: "a".repeat(200001) }, { ...intent, extra: true }]) expect(savePlanningIntent("alice", "GOALS", invalid)).toBe(false);
    expect(data.size).toBe(0);
  });
});
