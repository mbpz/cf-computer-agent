import { apiFetch, type Fetcher } from "./api";

export type ProjectStatus = "planned" | "active" | "paused" | "completed" | "archived";
export interface Project { id: string; clientKey: string; title: string; description: string | null; status: ProjectStatus; progress: number; targetAt: string | null; createdAt: string; updatedAt: string; }
export interface ProjectGoalSummary { id: string; title: string; }
export interface ProjectSummary { goalCount: number; taskCount: number; completedTaskCount: number; goals: ProjectGoalSummary[]; }
export interface ProjectPage { items: Project[]; nextCursor?: string; }
export type ProjectTimelineKind = "meeting" | "decision" | "action_item" | "milestone";
export type ProjectTimelineStatus = "open" | "done" | "archived";
export interface ProjectTimelineItem { id: string; projectId: string; clientKey: string; kind: ProjectTimelineKind; title: string; body: string; status: ProjectTimelineStatus; startsAt: string | null; dueAt: string | null; createdAt: string; updatedAt: string; }
export interface ProjectTimelinePage { items: ProjectTimelineItem[]; nextCursor?: string; }

export async function loadProjects(input: { limit?: number; cursor?: string; status?: ProjectStatus } = {}, requester: Fetcher = fetch): Promise<ProjectPage> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.status) params.set("status", input.status);
  const value = await apiFetch<unknown>(`/api/projects?${params.toString()}`, { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.map(normalizeProject).filter((item): item is Project => item !== null) : [];
  if (!Array.isArray(record.items) || items.length !== record.items.length) throw new Error("PROJECT_RESPONSE_INVALID");
  return { items, ...(typeof record.nextCursor === "string" ? { nextCursor: record.nextCursor } : {}) };
}

export async function loadProjectSummary(id: string, requester: Fetcher = fetch): Promise<ProjectSummary> {
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}/summary`, { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_SUMMARY_INVALID");
  const record = value as Record<string, unknown>;
  const goals = Array.isArray(record.goals) ? record.goals.map(normalizeGoal).filter((item): item is ProjectGoalSummary => item !== null) : [];
  if (!Number.isInteger(record.goalCount) || !Number.isInteger(record.taskCount) || !Number.isInteger(record.completedTaskCount) || !Array.isArray(record.goals) || goals.length !== record.goals.length) throw new Error("PROJECT_SUMMARY_INVALID");
  return { goalCount: record.goalCount as number, taskCount: record.taskCount as number, completedTaskCount: record.completedTaskCount as number, goals };
}

export async function loadProject(id: string, requester: Fetcher = fetch): Promise<Project> {
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}`, { requester });
  const project = normalizeProject(value);
  if (!project) throw new Error("PROJECT_RESPONSE_INVALID");
  return project;
}

export async function loadProjectTimeline(id: string, input: { limit?: number; cursor?: string } = {}, requester: Fetcher = fetch): Promise<ProjectTimelinePage> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(id)}/timeline?${params.toString()}`, { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROJECT_TIMELINE_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.map(normalizeTimeline).filter((item): item is ProjectTimelineItem => item !== null) : [];
  if (!Array.isArray(record.items) || items.length !== record.items.length) throw new Error("PROJECT_TIMELINE_RESPONSE_INVALID");
  return { items, ...(typeof record.nextCursor === "string" ? { nextCursor: record.nextCursor } : {}) };
}

export async function createProjectTimeline(id: string, input: { kind: ProjectTimelineKind; title: string; body?: string; startsAt?: string | null; dueAt?: string | null }, requester: Fetcher = fetch): Promise<{ item: ProjectTimelineItem; created: boolean }> {
  return apiFetch<{ item: ProjectTimelineItem; created: boolean }>(`/api/projects/${encodeURIComponent(id)}/timeline`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), ...input }) });
}

export async function setProjectTimelineStatus(projectId: string, id: string, status: ProjectTimelineStatus, requester: Fetcher = fetch): Promise<ProjectTimelineItem> {
  return apiFetch<ProjectTimelineItem>(`/api/projects/${encodeURIComponent(projectId)}/timeline/${encodeURIComponent(id)}/status`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
}

export async function createProject(input: { title: string; description?: string | null }, requester: Fetcher = fetch): Promise<{ project: Project; created: boolean }> {
  return apiFetch<{ project: Project; created: boolean }>("/api/projects", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), ...input }) });
}

export async function setProjectStatus(id: string, status: ProjectStatus, requester: Fetcher = fetch): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${encodeURIComponent(id)}/status`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
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
