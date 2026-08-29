export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high";
export type TaskFilterState = {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  due?: "today" | "overdue" | "none";
  q?: string;
};
