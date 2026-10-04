import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBoardMove, discardBlockedBoardMove, loadBoardMove, saveBoardMove, type BoardMoveIntent } from "../../frontend/lib/board-move-intent";

const KEY = "memory-garden:board-move:v1:member-a";
const intent: BoardMoveIntent = { taskId: "task-1", title: "Alpha", source: "todo", target: "doing" };

describe("board move intent storage", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves, reloads and clears one member-scoped move", () => {
    expect(saveBoardMove("member-a", intent)).toBe(true);
    expect(loadBoardMove("member-a")).toEqual({ kind: "ready", intent });
    expect(loadBoardMove("member-b")).toEqual({ kind: "empty" });
    expect(clearBoardMove("member-a", intent)).toBe(true);
    expect(store.has(KEY)).toBe(false);
  });

  it("never replaces or clears a different unresolved move", () => {
    expect(saveBoardMove("member-a", intent)).toBe(true);
    const other = { ...intent, target: "done" as const };
    expect(saveBoardMove("member-a", other)).toBe(false);
    expect(clearBoardMove("member-a", other)).toBe(false);
    expect(loadBoardMove("member-a")).toEqual({ kind: "ready", intent });
  });

  it.each([
    ["another member", { version: 1, memberId: "member-b", intent }],
    ["an extra field", { version: 1, memberId: "member-a", intent, extra: true }],
    ["the same source and target", { version: 1, memberId: "member-a", intent: { ...intent, target: "todo" } }],
    ["a canceled source", { version: 1, memberId: "member-a", intent: { ...intent, source: "canceled" } }],
    ["an unsafe task id", { version: 1, memberId: "member-a", intent: { ...intent, taskId: "../x" } }],
  ])("treats a record with %s as blocked and only lets it be discarded", (_label, record) => {
    store.set(KEY, JSON.stringify(record));
    expect(loadBoardMove("member-a")).toEqual({ kind: "blocked" });
    expect(saveBoardMove("member-a", intent)).toBe(false);
    expect(clearBoardMove("member-a", intent)).toBe(false);
    expect(discardBlockedBoardMove("member-a")).toBe(true);
    expect(loadBoardMove("member-a")).toEqual({ kind: "empty" });
  });

  it("does not discard a readable record", () => {
    expect(saveBoardMove("member-a", intent)).toBe(true);
    expect(discardBlockedBoardMove("member-a")).toBe(false);
    expect(loadBoardMove("member-a").kind).toBe("ready");
  });
});
