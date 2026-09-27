import { canonicalPlanningVersion } from "./planning-write-recovery";
import { normalizeNumberedPage, type FrontendPageRequest, type FrontendNumberedPage } from "./numbered-page";
import type { PlanningCreateIntent } from "./planning-create-intent";
import { apiFetch, type Fetcher } from "./api";

export type ProjectStatus = "planned" | "active" | "paused" | "completed" | "archived";
export interface Project { id: string; clientKey: string; title: string; description: string | null; status: ProjectStatus; progress: number; targetAt: string | null; createdAt: string; updatedAt: string; }
export interface ProjectGoalSummary { id: string; title: string; }
export interface ProjectSummary { goalCount: number; taskCount: number; completedTaskCount: number; goals: ProjectGoalSummary[]; }
export interface ProjectPage { items: Project[]; nextCursor?: string; }
export type ProjectTimelineKind = "meeting" | "decision" | "action_item" | "milestone";
export type ProjectTimelineStatus = "open" | "done" | "archived";
export interface ProjectTimelineItem { id: string; projectId: string; clientKey: string; kind: ProjectTimelineKind; title: string; body: string; status: ProjectTimelineStatus; startsAt: string | null; dueAt: string | null; createdAt: string; updatedAt: string; }
export interface TimelineCreateIntent { readonly id: string; readonly clientKey: string; readonly kind: ProjectTimelineKind; readonly title: string; readonly body: string; readonly startsAt: string | null; readonly dueAt: string | null; }
export interface ProjectTimelinePage { items: ProjectTimelineItem[]; nextCursor?: string; }

export async function loadNumberedProjects(input: FrontendPageRequest, requester: Fetcher = fetch, signal?: AbortSignal): Promise<FrontendNumberedPage<Project>> {
  const params = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  const result = normalizeNumberedPage(await apiFetch<unknown>(`/api/projects?${params.toString()}`, { requester, signal }), value => {
    const item = normalizeProject(value);
    if (!item) throw new Error("PROJECT_RESPONSE_INVALID");
    return item;
  });
  if (result.pagination.page !== input.page || result.pagination.pageSize !== input.pageSize || new Set(result.items.map(item => item.id)).size !== result.items.length) throw new Error("PROJECT_RESPONSE_INVALID");
  return result;
}

export async function loadProjects(input: { limit?: number; cursor?: string; status?: ProjectStatus } = {}, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ProjectPage> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.status) params.set("status", input.status);
  const value = await apiFetch<unknown>(`/api/projects?${params.toString()}`, { requester, signal });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.map(normalizeProject).filter((item): item is Project => item !== null) : [];
  if (!Array.isArray(record.items) || items.length !== record.items.length) throw new Error("PROJECT_RESPONSE_INVALID");
  return { items, ...(typeof record.nextCursor === "string" ? { nextCursor: record.nextCursor } : {}) };
}

export async function loadProjectSummary(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ProjectSummary> {
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}/summary`, { requester, signal });
  return normalizeProjectSummary(value);
}

export function normalizeProjectSummary(value: unknown): ProjectSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_SUMMARY_INVALID");
  const record = value as Record<string, unknown>;
  const goals = Array.isArray(record.goals) ? record.goals.map(normalizeGoal).filter((item): item is ProjectGoalSummary => item !== null) : [];
  const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!isCount(record.goalCount) || !isCount(record.taskCount) || !isCount(record.completedTaskCount)
    || record.completedTaskCount > record.taskCount || !Array.isArray(record.goals) || goals.length !== record.goals.length
    || goals.length > record.goalCount || goals.length > 10 || new Set(goals.map((goal) => goal.id)).size !== goals.length) throw new Error("PROJECT_SUMMARY_INVALID");
  return { goalCount: record.goalCount as number, taskCount: record.taskCount as number, completedTaskCount: record.completedTaskCount as number, goals };
}

export async function loadProject(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<Project> {
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}`, { requester, signal });
  const project = normalizeProject(value);
  if (!project || project.id !== id) throw new Error("PROJECT_RESPONSE_INVALID");
  return project;
}

export async function loadProjectTimeline(id: string, input: { limit?: number; cursor?: string } = {}, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ProjectTimelinePage> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}/timeline?${params.toString()}`, { requester, signal });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_TIMELINE_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.map(normalizeTimeline).filter((item): item is ProjectTimelineItem => item !== null) : [];
  if (!Array.isArray(record.items) || items.length !== record.items.length || items.length > (input.limit ?? 20)
    || items.some(item => item.projectId !== id) || new Set(items.map(item => item.id)).size !== items.length
    || (record.nextCursor !== undefined && (typeof record.nextCursor !== "string" || !record.nextCursor || record.nextCursor === input.cursor))) throw new Error("PROJECT_TIMELINE_RESPONSE_INVALID");
  return { items, ...(typeof record.nextCursor === "string" ? { nextCursor: record.nextCursor } : {}) };
}

export async function loadProjectTimelineItem(projectId: string, id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ProjectTimelineItem> {
  const item = normalizeTimeline(await apiFetch<unknown>(`/api/projects/${encodeURIComponent(projectId)}/timeline/${encodeURIComponent(id)}`, { requester, signal }));
  if (!item || item.projectId !== projectId || item.id !== id || !canonicalPlanningVersion(item.updatedAt)) throw new Error("PROJECT_TIMELINE_RESPONSE_INVALID");
  return item;
}

export async function createProjectTimeline(id: string, input: TimelineCreateIntent, requester: Fetcher = fetch): Promise<{ item: ProjectTimelineItem; created: boolean }> {
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}/timeline`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_TIMELINE_CREATE_INVALID");
  const record = value as Record<string, unknown>;
  const item = normalizeTimeline(record.item);
  if (!item || item.projectId !== id || item.id !== input.id || item.clientKey !== input.clientKey || typeof record.created !== "boolean") throw new Error("PROJECT_TIMELINE_CREATE_INVALID");
  return { item, created: record.created };
}

export async function setProjectTimelineStatus(projectId: string, id: string, status: ProjectTimelineStatus, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<ProjectTimelineItem> {
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(projectId)}/timeline/${encodeURIComponent(id)}/status`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, expectedUpdatedAt }) });
  const item = normalizeTimeline(value);
  const epoch = item ? Date.parse(item.updatedAt) : NaN;
  if (!item || item.projectId !== projectId || item.id !== id || item.status !== status
    || !Number.isSafeInteger(epoch) || new Date(epoch).toISOString() !== item.updatedAt
    || !(epoch > Date.parse(expectedUpdatedAt))) throw new Error("PROJECT_TIMELINE_STATUS_RECEIPT_INVALID");
  return item;
}

export async function createProject(input: PlanningCreateIntent, requester: Fetcher = fetch): Promise<{ project: Project; created: boolean }> {
  const value = await apiFetch<unknown>("/api/projects", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_CREATE_INVALID");
  const record = value as Record<string, unknown>;
  const project = normalizeProject(record.project);
  if (!project || project.id !== input.id || project.clientKey !== input.clientKey || typeof record.created !== "boolean") throw new Error("PROJECT_CREATE_INVALID");
  return { project, created: record.created };
}

export async function setProjectStatus(id: string, status: ProjectStatus, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<Project> {
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}/status`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, expectedUpdatedAt }) });
  const item = normalizeProject(value);
  if (!item || item.id !== id || item.status !== status || !canonicalPlanningVersion(item.updatedAt)
    || !(Date.parse(item.updatedAt) > Date.parse(expectedUpdatedAt))) throw new Error("PROJECT_WRITE_RECEIPT_INVALID");
  return item;
}

function normalizeProject(value: unknown): Project | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.clientKey !== "string" || typeof record.title !== "string") return null;
  if (record.status !== "planned" && record.status !== "active" && record.status !== "paused" && record.status !== "completed" && record.status !== "archived") return null;
  if (typeof record.progress !== "number" || !Number.isInteger(record.progress) || record.progress < 0 || record.progress > 100) return null;
  return { id: record.id, clientKey: record.clientKey, title: record.title, description: typeof record.description === "string" ? record.description : null, status: record.status, progress: record.progress, targetAt: typeof record.targetAt === "string" ? record.targetAt : null, createdAt: typeof record.createdAt === "string" ? record.createdAt : "", updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "" };
}
function normalizeGoal(value: unknown): ProjectGoalSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.title === "string" ? { id: record.id, title: record.title } : null;
}
function normalizeTimeline(value: unknown): ProjectTimelineItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.projectId !== "string" || typeof record.clientKey !== "string" || typeof record.title !== "string" || typeof record.body !== "string") return null;
  if (record.kind !== "meeting" && record.kind !== "decision" && record.kind !== "action_item" && record.kind !== "milestone") return null;
  if (record.status !== "open" && record.status !== "done" && record.status !== "archived") return null;
  return { id: record.id, projectId: record.projectId, clientKey: record.clientKey, kind: record.kind, title: record.title, body: record.body, status: record.status, startsAt: typeof record.startsAt === "string" ? record.startsAt : null, dueAt: typeof record.dueAt === "string" ? record.dueAt : null, createdAt: typeof record.createdAt === "string" ? record.createdAt : "", updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "" };
}
