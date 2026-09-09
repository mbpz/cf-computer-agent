import { describe, expect, it } from "vitest";
import { WorkbenchReviewService } from "../../src/workbench-review/service";

describe("WorkbenchReviewService", () => {
  it("builds and reuses a deterministic private daily snapshot", async () => {
    let saved: any;
    const service = new WorkbenchReviewService({ find: async () => saved ?? null, upsert: async (_member: string, value: any) => { saved = value; return value; } } as never, {
      tasks: { summary: async () => ({ todo: 1, doing: 0, blocked: 1, done: 2, canceled: 0, dueToday: 0, overdue: 1 }), list: async (_m: string, filters: { status?: string; due?: string }) => ({ items: [{ id: filters.status || filters.due || "item" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }) } as never,
      inbox: { list: async () => ({ items: [{ id: "inbox-1" }] }) } as never,
      projects: { list: async () => ({ items: [{ id: "project-1" }] }) } as never,
      focus: { current: async () => null } as never,
    }, () => new Date("2026-09-09T10:00:00.000Z"));
    const first = await service.get("member-a", "daily");
    const second = await service.get("member-a", "daily");
    expect(first.id).toBe("review:member-a:daily:2026-09-09");
    expect(first.completed).toHaveLength(1);
    expect(second).toBe(first);
  });
});
