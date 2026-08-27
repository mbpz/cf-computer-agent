import type { Page, PageRequest } from "../pagination";

export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high";
export type TaskDueFilter = "today" | "overdue" | "none";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "doing", "blocked", "done", "canceled"];
export const TASK_PRIORITIES: readonly TaskPriority[] = ["low", "medium", "high"];

export interface Task {
  id: string;
  memberId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCreate {
  id: string;
  memberId: string;
  title: string;
  notes: string;
  priority: TaskPriority;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskUpdate {
  title: string;
  notes: string;
  priority: TaskPriority;
  dueAt: number | null;
  updatedAt: number;
}

export interface TaskLink {
  id: string;
  taskId: string;
  knowledgeItemId: string;
  knowledgeTitle: string | null;
  createdAt: string;
}

export interface TaskLinkInsert {
  id: string;
  taskId: string;
  memberId: string;
  knowledgeItemId: string;
  createdAt: number;
}

export interface TaskListFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  due?: TaskDueFilter;
  q?: string;
}

export interface TaskListRequest extends PageRequest {
  filters: TaskListFilters;
}

export type TaskPage = Page<Task>;

export interface TaskSummary {
  todo: number;
  doing: number;
  blocked: number;
  done: number;
  canceled: number;
  dueToday: number;
  overdue: number;
}
