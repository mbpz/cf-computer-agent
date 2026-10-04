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
export interface TaskCreateInput { id?: string; title: string; notes?: string; priority?: string; dueAt?: string | null; knowledgeItemId?: string; }

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

export async function loadTaskSummary(requester: Fetcher = fetch, signal?: AbortSignal): Promise<TaskSummary> {
  const data = await apiFetch<TaskSummary>("/api/tasks/summary", { requester, signal });
  if (!data || ![data.todo, data.doing, data.blocked, data.done, data.canceled, data.dueToday, data.overdue].every(value => Number.isSafeInteger(value) && value >= 0)
    || !Number.isSafeInteger(data.todo + data.doing + data.blocked + data.done + data.canceled)) throw new Error("TASK_SUMMARY_INVALID");
  return data;
}

export async function loadTaskDetail(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<TaskDetail> {
  const data = await apiFetch<TaskDetail>(`/api/tasks/${encodeURIComponent(id)}`, { requester, signal });
  const task = taskReceipt(data?.task, id);
  if (!Array.isArray(data.tags) || !data.tags.every((tag) => typeof tag === "string") || !Array.isArray(data.links)) throw new Error("TASK_DETAIL_INVALID");
  return { task, tags: data.tags, links: data.links.map((link) => linkReceipt(link, id)) };
}

export async function createTask(input: TaskCreateInput, requester: Fetcher = fetch): Promise<{ task: TaskItem; created: boolean }> {
  const id = input.id ?? crypto.randomUUID();
  const data = await apiFetch<{ task: TaskItem; created: boolean }>("/api/tasks", {
    requester, method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, id }),
  });
  if (typeof data?.created !== "boolean") throw new Error("TASK_RESPONSE_INVALID");
  return { task: taskReceipt(data.task, id), created: data.created };
}

export async function updateTask(id: string, patch: { title: string; notes: string; priority: string; dueAt: string | null; expectedUpdatedAt?: string }, requester: Fetcher = fetch): Promise<TaskItem> {
  return taskReceipt(await apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }), id);
}

export async function deleteTask(id: string, requester: Fetcher = fetch): Promise<void> {
  try {
    await apiFetch<void>(`/api/tasks/${encodeURIComponent(id)}`, { requester, method: "DELETE" });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
  }
}

/** With `expectedStatus`, the server rejects with 409 if the task moved elsewhere, unless it is already at `status`. */
export async function setTaskStatus(id: string, status: string, requester: Fetcher = fetch, expectedStatus?: string): Promise<TaskItem> {
  const body = expectedStatus === undefined ? { status } : { status, expectedStatus };
  return taskReceipt(await apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}/status`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), id);
}

export async function setTaskProgress(id: string, progress: number, requester: Fetcher = fetch): Promise<TaskItem> {
  return taskReceipt(await apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}/progress`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress }) }), id);
}

export async function replaceTaskTags(id: string, tags: string[], requester: Fetcher = fetch): Promise<string[]> {
  const data = await apiFetch<{ tags?: unknown }>(`/api/tasks/${encodeURIComponent(id)}/tags`, { requester, method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags }) });
  if (!Array.isArray(data?.tags) || !data.tags.every((tag) => typeof tag === "string")) throw new Error("TASK_TAGS_INVALID");
  return data.tags;
}

export async function addTaskLink(taskId: string, knowledgeItemId: string, requester: Fetcher = fetch): Promise<TaskLinkItem> {
  const data = await apiFetch<{ link?: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}/links`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ knowledgeItemId }) });
  return linkReceipt(data?.link, taskId, knowledgeItemId);
}

export async function removeTaskLink(taskId: string, linkId: string, requester: Fetcher = fetch): Promise<void> {
  try {
    await apiFetch<void>(`/api/tasks/${encodeURIComponent(taskId)}/links/${encodeURIComponent(linkId)}`, { requester, method: "DELETE" });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
  }
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

function taskReceipt(value: unknown, expectedId: string): TaskItem {
  const record = value as TaskItem | undefined;
  const validDate = (date: unknown) => typeof date === "string" && Number.isFinite(Date.parse(date));
  if (!record || record.id !== expectedId || typeof record.title !== "string" || typeof record.notes !== "string"
    || !isStatus(record.status) || !isPriority(record.priority) || !Number.isSafeInteger(record.progress) || record.progress < 0 || record.progress > 100
    || (record.dueAt !== null && !validDate(record.dueAt)) || (record.completedAt !== null && !validDate(record.completedAt))
    || !validDate(record.createdAt) || !validDate(record.updatedAt)) throw new Error("TASK_RESPONSE_INVALID");
  return record;
}

function linkReceipt(value: unknown, taskId: string, knowledgeItemId?: string): TaskLinkItem {
  const link = value as TaskLinkItem | undefined;
  if (!link || typeof link.id !== "string" || !link.id || link.taskId !== taskId
    || typeof link.knowledgeItemId !== "string" || !link.knowledgeItemId
    || (knowledgeItemId !== undefined && link.knowledgeItemId !== knowledgeItemId)
    || (link.knowledgeTitle !== null && typeof link.knowledgeTitle !== "string")
    || typeof link.createdAt !== "string") throw new Error("TASK_LINK_INVALID");
  return link;
}
