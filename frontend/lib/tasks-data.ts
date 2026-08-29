import { ApiRequestError, apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface TaskItem {
  id: string;
  title: string;
  notes: string;
  status: "todo" | "doing" | "blocked" | "done" | "canceled";
  progress: number;
  priority: "low" | "medium" | "high";
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLinkItem { id: string; taskId: string; knowledgeItemId: string; knowledgeTitle: string | null; createdAt: string; }
export interface TaskSummary { todo: number; doing: number; blocked: number; done: number; canceled: number; dueToday: number; overdue: number; }
export interface TaskFilters { status?: string; priority?: string; tag?: string; due?: string; q?: string; }
export type TaskPage = FrontendNumberedPage<TaskItem>;
export interface TaskDetail { task: TaskItem; tags: string[]; links: TaskLinkItem[]; }
export interface TaskCreateInput { title: string; notes?: string; priority?: string; dueAt?: string | null; knowledgeItemId?: string; }

function taskQuery(filters: TaskFilters, pagination: FrontendPageRequest): string {
  const params = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize) });
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.due) params.set("due", filters.due);
  if (filters.q) params.set("q", filters.q);
  return `/api/tasks?${params.toString()}`;
}

export async function loadTasks(
  filters: TaskFilters,
  pagination: FrontendPageRequest,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<TaskPage> {
  return normalizeNumberedPage(
    await apiFetch(taskQuery(filters, pagination), { requester, signal }),
    normalizeTaskStrict,
  );
}

export function createTasksRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: { filters: TaskFilters } & FrontendPageRequest, signal) =>
    loadTasks(input.filters, input, requester, signal));
}

export async function loadTaskSummary(requester: Fetcher = fetch): Promise<TaskSummary> {
  return apiFetch<TaskSummary>("/api/tasks/summary", { requester });
}

export async function loadTaskDetail(id: string, requester: Fetcher = fetch): Promise<TaskDetail> {
  return apiFetch<TaskDetail>(`/api/tasks/${encodeURIComponent(id)}`, { requester });
}

export async function createTask(input: TaskCreateInput, requester: Fetcher = fetch): Promise<{ task: TaskItem; created: boolean }> {
  return apiFetch<{ task: TaskItem; created: boolean }>("/api/tasks", {
    requester, method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), ...input }),
  });
}

export async function updateTask(id: string, patch: { title: string; notes: string; priority: string; dueAt: string | null }, requester: Fetcher = fetch): Promise<TaskItem> {
  return apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
}

export async function deleteTask(id: string, requester: Fetcher = fetch): Promise<void> {
  try {
    await apiFetch<void>(`/api/tasks/${encodeURIComponent(id)}`, { requester, method: "DELETE" });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
  }
}

export async function setTaskStatus(id: string, status: string, requester: Fetcher = fetch): Promise<TaskItem> {
  return apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}/status`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
}

export async function setTaskProgress(id: string, progress: number, requester: Fetcher = fetch): Promise<TaskItem> {
  return apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}/progress`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress }) });
}

export async function replaceTaskTags(id: string, tags: string[], requester: Fetcher = fetch): Promise<string[]> {
  const data = await apiFetch<{ tags?: unknown }>(`/api/tasks/${encodeURIComponent(id)}/tags`, { requester, method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags }) });
  return Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [];
}

export async function addTaskLink(taskId: string, knowledgeItemId: string, requester: Fetcher = fetch): Promise<TaskLinkItem> {
  const data = await apiFetch<{ link?: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}/links`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ knowledgeItemId }) });
  const link = data.link as TaskLinkItem | undefined;
  if (!link || typeof link.id !== "string") throw new Error("TASK_LINK_INVALID");
  return link;
}

export async function removeTaskLink(taskId: string, linkId: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch<void>(`/api/tasks/${encodeURIComponent(taskId)}/links/${encodeURIComponent(linkId)}`, { requester, method: "DELETE" });
}

function normalizeTask(value: unknown): TaskItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string") return null;
  return {
    id: record.id, title: record.title, notes: typeof record.notes === "string" ? record.notes : "",
    status: isStatus(record.status) ? record.status : "todo",
    progress: typeof record.progress === "number" ? record.progress : 0,
    priority: isPriority(record.priority) ? record.priority : "medium",
    dueAt: typeof record.dueAt === "string" ? record.dueAt : null,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

function normalizeTaskStrict(value: unknown): TaskItem {
  const task = normalizeTask(value);
  if (!task) throw new Error("TASK_RESPONSE_INVALID");
  return task;
}

function isStatus(value: unknown): value is TaskItem["status"] {
  return value === "todo" || value === "doing" || value === "blocked" || value === "done" || value === "canceled";
}

function isPriority(value: unknown): value is TaskItem["priority"] {
  return value === "low" || value === "medium" || value === "high";
}
