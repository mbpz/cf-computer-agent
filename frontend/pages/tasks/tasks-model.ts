import type { TaskFilterState, TaskPriority, TaskStatus } from "./task-types";

export type { TaskPriority, TaskStatus };

/**
 * The condition set a task list read answers. Both the delete confirmation's validity and
 * the route's stale-row reset compare this key, so a condition change is defined once.
 */
export function taskFilterKey(filters: TaskFilterState): string {
  return JSON.stringify([filters.q, filters.status, filters.priority, filters.tag, filters.due]);
}

export function taskStatusKey(status: TaskStatus): string {
  return { todo: "TASKS_STATUS_TODO", doing: "TASKS_STATUS_DOING", blocked: "TASKS_STATUS_BLOCKED", done: "TASKS_STATUS_DONE", canceled: "TASKS_STATUS_CANCELED" }[status];
}

export function taskPriorityKey(priority: TaskPriority): string {
  return { low: "TASKS_PRIORITY_LOW", medium: "TASKS_PRIORITY_MEDIUM", high: "TASKS_PRIORITY_HIGH" }[priority];
}

export function priorityBadgeClass(priority: TaskPriority): string {
  return priority === "high" ? "border-destructive/40 text-destructive" : priority === "low" ? "text-muted-foreground" : "";
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return status === "done" || status === "canceled";
}

export type DueInfo = { kind: "overdue" | "today" | "later" | "none"; date: Date | null };

export function dueInfo(dueAt: string | null, status: TaskStatus, now = new Date()): DueInfo {
  if (!dueAt || isTerminalStatus(status)) return { kind: "none", date: null };
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return { kind: "none", date: null };
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86_400_000;
  const time = date.getTime();
  if (time < startOfToday) return { kind: "overdue", date };
  if (time < endOfToday) return { kind: "today", date };
  return { kind: "later", date };
}
