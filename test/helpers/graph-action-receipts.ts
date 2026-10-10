import type { Task, TaskLink } from "../../src/tasks/types";
import type { FocusSession } from "../../src/focus/types";
import type { ProjectTimelineItem } from "../../src/project-timeline/types";

const time = "2026-10-10T00:00:00.000Z";
export function taskReceipt(id: string, created = true): { task: Task; link: TaskLink; created: boolean } {
  return { created, link: { id: `link-${id}`, taskId: id, knowledgeItemId: "knowledge-1", knowledgeTitle: "Review launch brief", createdAt: time }, task: { id, memberId: "member-a", title: "Review launch brief", notes: "", status: "todo", progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: time, updatedAt: time } };
}
export function focusReceipt(id: string, taskId = "t1", created = true): { session: FocusSession; created: boolean } {
  return { created, session: { id, clientKey: id, memberId: "member-a", taskId, calendarEventId: null, startTitle: "Draft brief", durationMinutes: 25, status: "active", startedAt: time, pausedAt: null, endedAt: null, elapsedMs: 0, createdAt: time, updatedAt: time } };
}
export function timelineReceipt(id: string, kind: ProjectTimelineItem["kind"], created = true): { item: ProjectTimelineItem; created: boolean } {
  return { created, item: { id, clientKey: id, memberId: "member-a", projectId: "project-1", kind, title: "Launch", body: "", status: "open", startsAt: null, dueAt: null, createdAt: time, updatedAt: time } };
}
