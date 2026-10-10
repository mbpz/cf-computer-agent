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
export type TaskSubtaskStatus = "todo" | "doing" | "done" | "canceled";
export interface TaskSubtask { id: string; taskId: string; title: string; status: TaskSubtaskStatus; position: number; updatedAt: string; }
export interface TaskDependency { taskId: string; dependsOnTaskId: string; }
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

export async function setTaskProgress(id: string, progress: number, requester: Fetcher = fetch, expectedUpdatedAt?: string): Promise<TaskItem> {
  const body = expectedUpdatedAt === undefined ? { progress } : { progress, expectedUpdatedAt };
  return taskReceipt(await apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}/progress`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), id);
}

export async function replaceTaskTags(id: string, tags: string[], requester: Fetcher = fetch, expectedUpdatedAt?: string): Promise<string[]> {
  const body = expectedUpdatedAt === undefined ? { tags } : { tags, expectedUpdatedAt };
  const data = await apiFetch<{ tags?: unknown }>(`/api/tasks/${encodeURIComponent(id)}/tags`, { requester, method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!Array.isArray(data?.tags) || !data.tags.every((tag) => typeof tag === "string")) throw new Error("TASK_TAGS_INVALID");
  return data.tags;
}

export async function addTaskLink(taskId: string, knowledgeItemId: string, requester: Fetcher = fetch, expectedUpdatedAt?: string): Promise<TaskLinkItem> {
  const body = expectedUpdatedAt === undefined ? { knowledgeItemId } : { knowledgeItemId, expectedUpdatedAt };
  const data = await apiFetch<{ link?: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}/links`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return linkReceipt(data?.link, taskId, knowledgeItemId);
}

export async function loadSubtasks(taskId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<TaskSubtask[]> {
  const data = await apiFetch<unknown>(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, { requester, signal });
  if (!Array.isArray(data)) throw new Error("TASK_SUBTASKS_INVALID");
  return data.map((item) => subtaskReceipt(item, taskId));
}
export async function createSubtask(taskId: string, input: { id: string; title: string; status: TaskSubtaskStatus; position: number }, requester: Fetcher = fetch): Promise<TaskSubtask> {
  const data = await apiFetch<{ subtask?: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const subtask = subtaskReceipt(data?.subtask, taskId);
  if (subtask.id !== input.id) throw new Error("TASK_SUBTASK_INVALID");
  return subtask;
}
export async function updateSubtask(taskId: string, subtaskId: string, input: { title: string; status: TaskSubtaskStatus; position: number; expectedUpdatedAt: string }, requester: Fetcher = fetch): Promise<TaskSubtask> {
  const data = await apiFetch<unknown>(`/api/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const subtask = subtaskReceipt(data, taskId);
  if (subtask.id !== subtaskId) throw new Error("TASK_SUBTASK_INVALID");
  return subtask;
}
export async function deleteSubtask(taskId: string, subtaskId: string, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<void> {
  try {
    await apiFetch<void>(`/api/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`, { requester, method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt }) });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
  }
}
export async function loadDependencies(taskId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<TaskDependency[]> {
  const data = await apiFetch<unknown>(`/api/tasks/${encodeURIComponent(taskId)}/dependencies`, { requester, signal });
  if (!Array.isArray(data)) throw new Error("TASK_DEPENDENCIES_INVALID");
  return data.map((item) => dependencyReceipt(item, taskId));
}
export async function addDependency(taskId: string, dependsOnTaskId: string, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<TaskDependency> {
  const data = await apiFetch<{ dependency?: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}/dependencies`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dependsOnTaskId, expectedUpdatedAt }) });
  const dependency = dependencyReceipt(data?.dependency, taskId);
  if (dependency.dependsOnTaskId !== dependsOnTaskId) throw new Error("TASK_DEPENDENCY_INVALID");
  return dependency;
}
export async function removeDependency(taskId: string, dependsOnTaskId: string, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<void> {
  try {
    await apiFetch<void>(`/api/tasks/${encodeURIComponent(taskId)}/dependencies/${encodeURIComponent(dependsOnTaskId)}`, { requester, method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt }) });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
  }
}
export async function removeTaskLink(taskId: string, linkId: string, requester: Fetcher = fetch, expectedUpdatedAt?: string): Promise<void> {
  try {
    await apiFetch<void>(`/api/tasks/${encodeURIComponent(taskId)}/links/${encodeURIComponent(linkId)}`, expectedUpdatedAt === undefined
      ? { requester, method: "DELETE" }
      : { requester, method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt }) });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
  }
}

function normalizeTask(value: unknown): TaskItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const status = record.status;
  const priority = record.priority;
  const progress = record.progress;
  if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.notes !== "string") return null;
  if (!isStatus(status) || !isPriority(priority) || typeof progress !== "number" || !Number.isSafeInteger(progress) || progress < 0 || progress > 100) return null;
  return {
    id: record.id, title: record.title, notes: record.notes,
    status,
    progress,
    priority,
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

function subtaskReceipt(value: unknown, taskId: string): TaskSubtask {
  const item = value as TaskSubtask | undefined;
  const status = item?.status;
  if (!item || typeof item.id !== "string" || !item.id || item.taskId !== taskId || typeof item.title !== "string" || !item.title
    || (status !== "todo" && status !== "doing" && status !== "done" && status !== "canceled")
    || !Number.isInteger(item.position) || item.position < 0 || typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error("TASK_SUBTASK_INVALID");
  return { id: item.id, taskId, title: item.title, status, position: item.position, updatedAt: item.updatedAt };
}
function dependencyReceipt(value: unknown, taskId: string): TaskDependency {
  const item = value as TaskDependency | undefined;
  if (!item || item.taskId !== taskId || typeof item.dependsOnTaskId !== "string" || !item.dependsOnTaskId) throw new Error("TASK_DEPENDENCY_INVALID");
  return { taskId, dependsOnTaskId: item.dependsOnTaskId };
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
