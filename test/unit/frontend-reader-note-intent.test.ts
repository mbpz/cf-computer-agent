// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearReaderNoteIntent, finishReaderNoteIntent, loadReaderNoteIntent, prepareReaderNoteIntent, settleReaderNoteIntent, type NoteSaveIntent } from "../../frontend/lib/reader-note-intent";

describe("reader note tab intent journal", () => {
  let data: Map<string, string>; let storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  const intent: NoteSaveIntent = { id: "operation-a", kind: "save", fields: { title: "Title", body: "Body" }, citations: [{ revisionId: "revision-a", chunkId: "chunk-a", startLine: 1, endLine: 2 }] };
  const load = () => loadReaderNoteIntent("member-a", "knowledge-a");
  const prepare = () => prepareReaderNoteIntent("member-a", "knowledge-a", intent);
  const settle = () => settleReaderNoteIntent("member-a", "knowledge-a", intent, "applied");
  const clear = () => clearReaderNoteIntent("member-a", "knowledge-a", intent);
  beforeEach(() => { data = new Map(); storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } }; vi.stubGlobal("window", { sessionStorage: storage }); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("persists, acknowledges, then clears only this exact operation", () => {
    expect(load()).toEqual({ kind: "empty" }); prepare(); expect(load()).toEqual({ kind: "ready", intent, outcome: "pending" });
    expect(clear).toThrow(); settle(); expect(load()).toEqual({ kind: "ready", intent, outcome: "applied" }); clear(); expect(load()).toEqual({ kind: "empty" });
  });
  it("does not overwrite even an identical pending operation", () => { prepare(); expect(prepare).toThrow(); expect(load().kind).toBe("ready"); });
  it("does not expose another member or item's record", () => { prepare(); expect(loadReaderNoteIntent("member-b", "knowledge-a").kind).toBe("empty"); expect(loadReaderNoteIntent("member-a", "knowledge-b").kind).toBe("empty"); });
  it("refuses stale completion over a newer operation", () => {
    prepare(); settle(); clear(); const next = { ...intent, id: "operation-b" }; prepareReaderNoteIntent("member-a", "knowledge-a", next);
    expect(() => finishReaderNoteIntent("member-a", "knowledge-a", intent, "applied")).toThrow(); expect(load()).toEqual({ kind: "ready", intent: next, outcome: "pending" });
  });
  it("never flips one terminal result to the other", () => { prepare(); settle(); expect(() => settleReaderNoteIntent("member-a", "knowledge-a", intent, "rejected")).toThrow(); });
  it.each(["getItem", "setItem"] as const)("fails closed when %s throws", method => { vi.spyOn(storage, method).mockImplementation(() => { throw new Error("denied"); }); expect(prepare).toThrow(); });
  it("checks storage readback before permitting a write", () => { vi.spyOn(storage, "setItem").mockImplementation(() => {}); expect(prepare).toThrow(); });
  it.each(["throw", "ignore"])("does not claim cleanup when removal %s", mode => { prepare(); settle(); vi.spyOn(storage, "removeItem").mockImplementation(() => { if (mode === "throw") throw new Error("denied"); }); expect(clear).toThrow(); expect(load().kind).toBe("ready"); });
  it.each([
    ["wrong member", (v: any) => { v.member = "member-b"; }],
    ["wrong item", (v: any) => { v.item = "knowledge-b"; }],
    ["unknown envelope field", (v: any) => { v.extra = true; }],
    ["unknown operation field", (v: any) => { v.intent.extra = true; }],
    ["array outcome", (v: any) => { v.outcome = ["pending"]; }],
    ["unknown outcome", (v: any) => { v.outcome = "done"; }],
    ["invalid citation", (v: any) => { v.intent.citations[0].startLine = 0; }],
    ["oversize body", (v: any) => { v.intent.fields.body = "x".repeat(32769); }],
    ["unsupported kind", (v: any) => { v.intent.kind = "delete"; }],
  ] as const)("preserves but blocks %s", (_name, change) => { prepare(); const [k, raw] = [...data][0]; const v = JSON.parse(raw); change(v); const changed = JSON.stringify(v); data.set(k, changed); expect(load()).toEqual({ kind: "blocked" }); expect(prepare).toThrow(); expect(clear).toThrow(); expect(data.get(k)).toBe(changed); });
  it.each(["{", "x".repeat(420001)])("blocks malformed or oversized serialized data", raw => { prepare(); data.set([...data.keys()][0], raw); expect(load().kind).toBe("blocked"); });
  it("supports exact share/revoke targets and preserves the draft", () => {
    for (const kind of ["share", "revoke"] as const) {
      const operation = { id: `op-${kind}`, kind, noteId: "note-a", title: "Title", recipientId: "member-b", email: "person@test.dev", fields: { title: "Edited", body: "Unsaved" } };
      prepareReaderNoteIntent("member-a", "knowledge-a", operation); expect(load()).toEqual({ kind: "ready", intent: operation, outcome: "pending" }); finishReaderNoteIntent("member-a", "knowledge-a", operation, "rejected");
    }
  });
});
