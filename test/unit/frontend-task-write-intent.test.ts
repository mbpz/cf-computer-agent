import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTaskWrite, discardBlockedTaskWrite, loadTaskWrite, saveTaskWrite, taskWriteOutcome, validTaskWrite, type TaskWriteIntent } from "../../frontend/lib/task-write-intent";
import type { TaskDetail } from "../../frontend/lib/tasks-data";

const detail: TaskDetail = {
  task: { id: "t1", title: "Alpha", notes: "N", status: "doing", progress: 40, priority: "high", dueAt: "2026-10-01T10:00:00.000Z", completedAt: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
  tags: ["a", "b"],
  links: [{ id: "l1", taskId: "t1", knowledgeItemId: "k1", knowledgeTitle: null, createdAt: "2026-09-01T00:00:00Z" }],
};
const fields = { title: "Alpha", notes: "N", priority: "high" as const, dueAt: "2026-10-01T10:00:00Z" };

describe("task write intent", () => {
  it.each<[string, TaskWriteIntent, "applied" | "not_applied"]>([
    ["matching fields with an equivalent instant", { op: "update", taskId: "t1", fields }, "applied"],
    ["different fields", { op: "update", taskId: "t1", fields: { ...fields, title: "Beta" } }, "not_applied"],
    ["a created task with the intended fields", { op: "create", taskId: "t1", fields }, "applied"],
    ["the intended status", { op: "status", taskId: "t1", status: "doing" }, "applied"],
    ["another status", { op: "status", taskId: "t1", status: "done" }, "not_applied"],
    ["the intended progress", { op: "progress", taskId: "t1", progress: 40 }, "applied"],
    ["the same tags after server normalisation", { op: "tags", taskId: "t1", tags: [" b", "a", "a"] }, "applied"],
    ["different tags", { op: "tags", taskId: "t1", tags: ["a"] }, "not_applied"],
    ["a present link", { op: "link", taskId: "t1", knowledgeItemId: "k1" }, "applied"],
    ["a missing link", { op: "link", taskId: "t1", knowledgeItemId: "k2" }, "not_applied"],
    ["a removed link", { op: "unlink", taskId: "t1", linkId: "l9" }, "applied"],
    ["a link still present", { op: "unlink", taskId: "t1", linkId: "l1" }, "not_applied"],
  ])("compares %s", (_label, intent, expected) => {
    expect(taskWriteOutcome(intent, detail)).toBe(expected);
  });

  it.each([
    ["an unknown op", { op: "archive", taskId: "t1" }],
    ["an extra key", { op: "status", taskId: "t1", status: "done", extra: 1 }],
    ["an invalid status", { op: "status", taskId: "t1", status: "archived" }],
    ["fractional progress", { op: "progress", taskId: "t1", progress: 1.5 }],
    ["an empty title", { op: "update", taskId: "t1", fields: { ...fields, title: " " } }],
    ["an unsafe id", { op: "link", taskId: "../t1", knowledgeItemId: "k1" }],
    ["too many tags", { op: "tags", taskId: "t1", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
  ])("rejects %s", (_label, value) => {
    expect(validTaskWrite(value)).toBe(false);
  });

  describe("storage", () => {
    let store: Map<string, string>;
    const KEY = "memory-garden:task-write:v1:alice";
    const intent: TaskWriteIntent = { op: "status", taskId: "t1", status: "done" };
    beforeEach(() => {
      store = new Map();
      vi.stubGlobal("window", { sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("keeps one member-scoped intent, allows re-saving the same one, and refuses a different one", () => {
      expect(saveTaskWrite("alice", intent)).toBe(true);
      expect(saveTaskWrite("alice", intent)).toBe(true);
      expect(saveTaskWrite("alice", { ...intent, status: "todo" })).toBe(false);
      expect(loadTaskWrite("bob")).toEqual({ kind: "empty" });
      expect(clearTaskWrite("alice", { ...intent, status: "todo" })).toBe(false);
      expect(clearTaskWrite("alice", intent)).toBe(true);
      expect(store.size).toBe(0);
    });

    it("blocks a record for another member until it is explicitly discarded", () => {
      store.set(KEY, JSON.stringify({ version: 1, memberId: "bob", intent }));
      expect(loadTaskWrite("alice")).toEqual({ kind: "blocked" });
      expect(saveTaskWrite("alice", intent)).toBe(false);
      expect(discardBlockedTaskWrite("alice")).toBe(true);
      expect(loadTaskWrite("alice")).toEqual({ kind: "empty" });
    });
  });
});
