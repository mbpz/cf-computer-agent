import { describe, expect, it } from "vitest";
import { TodayService } from "../../src/today/service";

describe("TodayService", () => {
  it("aggregates bounded member-scoped work for one day", async () => {
    const service = new TodayService({
      tasks: { list: async () => ({ items: [{ id: "task-1" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }), summary: async () => ({ todo: 1, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 1, overdue: 0 }) } as never,
      inbox: { list: async () => ({ items: [{ id: "inbox-1" }], nextCursor: undefined }) } as never,
      projects: { list: async () => ({ items: [{ id: "project-1" }], nextCursor: undefined }) } as never,
      calendar: { list: async () => ({ items: [{ id: "event-1" }], nextCursor: undefined }) } as never,
    }, () => new Date("2026-09-09T10:00:00.000Z"));
    const snapshot = await service.get("member-a");
    expect(snapshot.date).toBe("2026-09-09");
    expect(snapshot.tasks.items).toHaveLength(1);
    expect(snapshot.inbox).toHaveLength(1);
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.calendar).toHaveLength(1);
  });
});
