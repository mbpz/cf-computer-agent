import { describe, expect, it } from "vitest";
import { buildWorkbenchSummary } from "../../frontend/lib/workbench-data";

describe("workbench summary", () => {
  it("normalizes empty sources without exposing undefined values", () => {
    const summary = buildWorkbenchSummary({});

    expect(summary).toEqual({
      taskCount: 0,
      overdueTaskCount: 0,
      recentKnowledge: [],
      recentActivity: [],
      quickActions: expect.any(Array),
    });
    expect(JSON.stringify(summary)).not.toContain("undefined");
  });

  it("combines tasks, recently visited knowledge, and activity into stable cards", () => {
    const summary = buildWorkbenchSummary({
      tasks: [
        { id: "task-1", title: "Ship shell", notes: "", status: "todo", progress: 0, priority: "high", dueAt: "2026-09-08T00:00:00.000Z", completedAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
        { id: "task-2", title: "Done", notes: "", status: "done", progress: 100, priority: "low", dueAt: "2026-09-01T00:00:00.000Z", completedAt: "2026-09-02T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" },
      ],
      knowledge: [
        { id: "knowledge-1", title: "Workbench guide", lastVisitedAt: "2026-09-08T03:00:00.000Z", visitCount: 3 },
      ],
      activity: [
        { id: "activity-1", action: "knowledge.published", resourceType: "knowledge", resourceId: "knowledge-1", createdAt: "2026-09-08T03:01:00.000Z" },
        { id: "activity-2", action: "submission.created", resourceType: "submission", resourceId: "submission-1", createdAt: "2026-09-08T02:00:00.000Z" },
      ],
      now: Date.parse("2026-09-09T00:00:00.000Z"),
    });

    expect(summary.taskCount).toBe(2);
    expect(summary.overdueTaskCount).toBe(1);
    expect(summary.recentKnowledge[0]).toMatchObject({ id: "knowledge-1", title: "Workbench guide" });
    expect(summary.recentActivity.map((item) => item.id)).toEqual(["activity-1", "activity-2"]);
    expect(summary.recentActivity[0]?.href).toBe("/knowledge/knowledge-1");
    expect(summary.recentActivity[1]?.href).toBe("/my-submissions");
  });

  it("prefers a task summary when the page does not load task rows", () => {
    const summary = buildWorkbenchSummary({
      taskSummary: { todo: 2, doing: 1, blocked: 1, done: 4, canceled: 0, dueToday: 1, overdue: 2 },
    });

    expect(summary.taskCount).toBe(8);
    expect(summary.overdueTaskCount).toBe(2);
  });
});
