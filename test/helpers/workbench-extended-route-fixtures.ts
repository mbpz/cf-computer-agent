import type { InboxItem } from "../../frontend/lib/inbox-data";
import type { Goal } from "../../frontend/lib/goals-data";
import type { Project } from "../../frontend/lib/projects-data";
import type { CalendarEvent } from "../../frontend/lib/calendar-data";
import type { TaskItem, TaskSummary } from "../../frontend/lib/tasks-data";
import type { TodaySnapshot } from "../../frontend/lib/today-data";
import type { FocusSession } from "../../frontend/lib/focus-data";
import type { WorkbenchReviewSnapshot } from "../../frontend/lib/workbench-review-data";

export const extendedRoutes = ["inbox", "goals", "projects", "calendar", "today", "focus", "review"] as const;
export type ExtendedRoute = typeof extendedRoutes[number];
const now = "2026-09-13T08:00:00.000Z";
const zero: TaskSummary = { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 };

export function extendedPayload(route: ExtendedRoute, empty = false, suffix = "first") {
  const marker = `READY::${route}::${suffix}`;
  const common = { id: `${route}-${suffix}`, clientKey: `${route}-${suffix}`, createdAt: now, updatedAt: now };
  const inbox: InboxItem = { ...common, kind: "text", content: marker, sourceUrl: null, status: "inbox", promotedTaskId: null, promotedSubmissionId: null };
  const goal: Goal = { ...common, title: marker, description: null, status: "active", progress: 0, targetAt: null };
  const project: Project = { ...goal };
  const event: CalendarEvent = { ...common, kind: "event", title: marker, description: "", startsAt: now, endsAt: "2026-09-13T09:00:00.000Z", timezone: "UTC", allDay: false, status: "scheduled", taskId: null, projectId: null };
  const task: TaskItem = { id: `${route}-${suffix}`, title: marker, notes: "", status: route === "review" ? "done" : "todo", progress: 0, priority: "medium", dueAt: now, completedAt: route === "review" ? now : null, createdAt: now, updatedAt: now };
  const items = empty ? [] : [task];
  switch (route) {
    case "inbox": return { items: empty ? [] : [inbox] };
    case "goals": return { items: empty ? [] : [goal] };
    case "projects": return { items: empty ? [] : [project] };
    case "calendar": return { items: empty ? [] : [event] };
    case "today": return { date: "2026-09-13", tasks: { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } }, taskSummary: { ...zero, todo: items.length }, inbox: [], projects: [], calendar: [] } satisfies TodaySnapshot;
    case "focus": return { session: empty ? null : { ...common, taskId: marker, calendarEventId: null, status: "active", startedAt: now, pausedAt: null, endedAt: null, elapsedMs: 0 } satisfies FocusSession };
    case "review": return { id: "review-snapshot", period: "daily", periodKey: "2026-09-13", from: now, to: now, taskSummary: { ...zero, done: items.length }, completed: items, overdue: [], blocked: [], inbox: [], projects: [], focusElapsedMs: 0 } satisfies WorkbenchReviewSnapshot;
  }
}
