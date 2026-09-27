// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { loadPlanningWrite, beginPlanningWrite, clearPlanningWrite } from "../../frontend/lib/planning-write-recovery";
const record = { token: "request-1", id: "row", expectedUpdatedAt: "2026-09-27T00:00:00.000Z" };
const key = "memory-garden:planning-write:v1:alice:GOALS";
let entries: Map<string, string>;
function setup() {
  entries = new Map();
  const storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => { entries.set(k, v); }, removeItem: (k: string) => { entries.delete(k); } };
  vi.stubGlobal("window", { sessionStorage: storage }); return storage;
}
afterEach(() => vi.unstubAllGlobals());
it("persists a scoped read-only barrier and only clears the exact operation", () => {
  setup(); expect(beginPlanningWrite("alice", "GOALS", record)).toBe(true);
  expect(loadPlanningWrite("alice", "GOALS")).toEqual({ kind: "ready", record });
  expect(loadPlanningWrite("bob", "GOALS")).toEqual({ kind: "empty" });
  expect(loadPlanningWrite("alice", "PROJECTS")).toEqual({ kind: "empty" });
  expect(beginPlanningWrite("alice", "GOALS", record)).toBe(false);
  for (const other of [{ ...record, token: "other" }, { ...record, id: "other" }, { ...record, expectedUpdatedAt: "2026-09-27T00:00:00.001Z" }]) {
    expect(clearPlanningWrite("alice", "GOALS", other)).toBe(false);
  }
  expect(clearPlanningWrite("alice", "GOALS", record)).toBe(true);
  expect(loadPlanningWrite("alice", "GOALS")).toEqual({ kind: "empty" });
});
it.each(["{", "null", "[]", "x".repeat(4097), JSON.stringify({ version: 2 })])("fails closed for damaged records without discarding them %#", raw => {
  setup(); entries.set(key, raw); expect(loadPlanningWrite("alice", "GOALS")).toEqual({ kind: "blocked" });
  expect(beginPlanningWrite("alice", "GOALS", record)).toBe(false); expect(clearPlanningWrite("alice", "GOALS", record)).toBe(false); expect(entries.get(key)).toBe(raw);
});
it("rejects wrong scope, extra fields, malformed ids and noncanonical versions", () => {
  setup(); const valid = { version: 1, memberId: "alice", module: "GOALS", record };
  for (const value of [{ ...valid, memberId: "bob" }, { ...valid, module: "PROJECTS" }, { ...valid, extra: 1 }, { ...valid, record: { ...record, payload: "private" } }, { ...valid, record: { ...record, id: "../row" } }, { ...valid, record: { ...record, expectedUpdatedAt: "yesterday" } }]) {
    entries.set(key, JSON.stringify(value)); expect(loadPlanningWrite("alice", "GOALS").kind).toBe("blocked");
  }
  entries.clear(); expect(beginPlanningWrite("alice", "GOALS", { ...record, expectedUpdatedAt: "2026-09-27" })).toBe(false);
  expect(beginPlanningWrite("", "GOALS", record)).toBe(false);
});
it("verifies writes and removals and blocks unavailable or denied storage", () => {
  const storage = setup(); vi.spyOn(storage, "setItem").mockImplementation(() => {});
  expect(beginPlanningWrite("alice", "GOALS", record)).toBe(false); vi.restoreAllMocks();
  expect(beginPlanningWrite("alice", "GOALS", record)).toBe(true);
  vi.spyOn(storage, "removeItem").mockImplementation(() => {}); expect(clearPlanningWrite("alice", "GOALS", record)).toBe(false);
  vi.stubGlobal("window", {}); expect(loadPlanningWrite("alice", "GOALS").kind).toBe("blocked");
  vi.stubGlobal("window", { get sessionStorage() { throw new Error("denied"); } });
  expect(loadPlanningWrite("alice", "GOALS").kind).toBe("blocked"); expect(beginPlanningWrite("alice", "GOALS", record)).toBe(false);
});
