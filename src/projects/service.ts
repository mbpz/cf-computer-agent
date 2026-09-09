import { AppError } from "../http";
import type { GoalsRepositoryPort } from "../goals/repository";
import type { TasksRepositoryPort } from "../tasks/repository";
import type { ProjectsRepositoryPort } from "./repository";
import { PROJECT_STATUSES, type Project, type ProjectListFilters, type ProjectPage, type ProjectStatus, type ProjectSummary } from "./types";

export interface ProjectCreateInput { id?: unknown; clientKey?: unknown; title?: unknown; description?: unknown; progress?: unknown; targetAt?: unknown; }
export interface ProjectUpdateInput { title?: unknown; description?: unknown; progress?: unknown; targetAt?: unknown; }
export interface ProjectsServiceOptions { id?: () => string; now?: () => Date; goals?: Pick<GoalsRepositoryPort, "findOwned">; tasks?: Pick<TasksRepositoryPort, "findOwned">; }

export class ProjectsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: ProjectsRepositoryPort, private readonly options: ProjectsServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(memberId: string, input: ProjectCreateInput): Promise<{ project: Project; created: boolean }> {
    const normalized = normalizeCreate(input, this.id());
    const replay = await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (replay) return { project: replay, created: false };
    const now = this.now().getTime();
    const created = await this.repository.insert({ ...normalized, memberId, createdAt: now, updatedAt: now });
    const project = await this.repository.findOwned(memberId, normalized.id) || await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (!project) throw new AppError("PROJECT_NOT_FOUND", "Project not found after create", 404, true);
    return { project, created };
  }

  async get(memberId: string, id: string): Promise<Project> {
    const project = await this.repository.findOwned(memberId, requireId(id));
    if (!project) throw notFound();
    return project;
  }

  async list(memberId: string, filters: ProjectListFilters = {}, pagination: { limit?: number; cursor?: string } = {}): Promise<ProjectPage> {
    const status = filters.status;
    if (status !== undefined && !PROJECT_STATUSES.includes(status)) throw invalid("PROJECT_PAGE_INVALID");
    const limit = pagination.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (pagination.cursor !== undefined && typeof pagination.cursor !== "string")) throw invalid("PROJECT_PAGE_INVALID");
    return this.repository.listOwned(memberId, { limit, ...(pagination.cursor ? { cursor: pagination.cursor } : {}), ...(status ? { status } : {}) });
  }

  async update(memberId: string, id: string, input: ProjectUpdateInput): Promise<Project> {
    const current = await this.get(memberId, id);
    const normalized = normalizeUpdate(input, current);
    if (current.title === normalized.title && current.description === normalized.description && current.progress === normalized.progress && current.targetAt === normalized.targetAt) return current;
    const updated = await this.repository.update(memberId, current.id, { ...normalized, updatedAt: this.now().getTime() });
    if (!updated) throw notFound();
    return updated;
  }

  async setStatus(memberId: string, id: string, status: unknown): Promise<Project> {
    if (typeof status !== "string" || !PROJECT_STATUSES.includes(status as ProjectStatus)) throw invalid("PROJECT_INVALID");
    const current = await this.get(memberId, id);
    if (current.status === status) return current;
    const updated = await this.repository.updateStatus(memberId, current.id, status as ProjectStatus, this.now().getTime());
    if (!updated) throw notFound();
    return updated;
  }

  async linkGoal(memberId: string, projectId: string, goalId: unknown): Promise<{ linked: boolean; project: ProjectSummary }> {
    const project = await this.get(memberId, projectId);
    if (typeof goalId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(goalId)) throw invalid("PROJECT_INVALID");
    if (!this.options.goals || !await this.options.goals.findOwned(memberId, goalId)) throw new AppError("PROJECT_GOAL_NOT_FOUND", "Goal is not visible", 404);
    const linked = await this.repository.linkGoal(memberId, project.id, goalId, this.now().getTime());
    return { linked, project: await this.repository.summary(memberId, project.id) };
  }

  async unlinkGoal(memberId: string, projectId: string, goalId: string): Promise<ProjectSummary> {
    const project = await this.get(memberId, projectId);
    await this.repository.unlinkGoal(memberId, project.id, requireId(goalId));
    return this.repository.summary(memberId, project.id);
  }

  async linkTask(memberId: string, projectId: string, taskId: unknown): Promise<{ linked: boolean; project: ProjectSummary }> {
    const project = await this.get(memberId, projectId);
    if (typeof taskId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(taskId)) throw invalid("PROJECT_INVALID");
    if (!this.options.tasks || !await this.options.tasks.findOwned(memberId, taskId)) throw new AppError("PROJECT_TASK_NOT_FOUND", "Task is not visible", 404);
    const linked = await this.repository.linkTask(memberId, project.id, taskId, this.now().getTime());
    return { linked, project: await this.repository.summary(memberId, project.id) };
  }

  async unlinkTask(memberId: string, projectId: string, taskId: string): Promise<ProjectSummary> {
    const project = await this.get(memberId, projectId);
    await this.repository.unlinkTask(memberId, project.id, requireId(taskId));
    return this.repository.summary(memberId, project.id);
  }

  async summary(memberId: string, projectId: string): Promise<ProjectSummary> {
    const project = await this.get(memberId, projectId);
    return this.repository.summary(memberId, project.id);
  }
}

function normalizeCreate(input: ProjectCreateInput, generatedId: string): { id: string; clientKey: string; title: string; description: string | null; progress: number; targetAt: number | null } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const id = record.id === undefined ? generatedId : requireId(record.id);
  const clientKey = typeof record.clientKey === "string" ? record.clientKey.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = normalizeDescription(record.description);
  const progress = normalizeProgress(record.progress === undefined ? 0 : record.progress);
  const targetAt = normalizeTargetAt(record.targetAt);
  if (!clientKey || clientKey.length > 160 || !title || [...title].length > 200) throw invalid("PROJECT_INVALID");
  return { id, clientKey, title, description, progress, targetAt };
}

function normalizeUpdate(input: ProjectUpdateInput, current: Project): { title: string; description: string | null; progress: number; targetAt: number | null } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const title = record.title === undefined ? current.title : typeof record.title === "string" ? record.title.trim() : "";
  const description = record.description === undefined ? current.description : normalizeDescription(record.description);
  const progress = record.progress === undefined ? current.progress : normalizeProgress(record.progress);
  const targetAt = record.targetAt === undefined ? (current.targetAt ? Date.parse(current.targetAt) : null) : normalizeTargetAt(record.targetAt);
  if (!title || [...title].length > 200) throw invalid("PROJECT_INVALID");
  return { title, description, progress, targetAt };
}

function normalizeDescription(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || [...value].length > 200000) throw invalid("PROJECT_INVALID");
  return value;
}
function normalizeProgress(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 100) throw invalid("PROJECT_INVALID");
  return value as number;
}
function normalizeTargetAt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid("PROJECT_INVALID");
  return value as number;
}
function requireId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value)) throw invalid("PROJECT_INVALID");
  return value;
}
function invalid(code: "PROJECT_INVALID" | "PROJECT_PAGE_INVALID"): AppError { return new AppError(code, "Project request is invalid", 400); }
function notFound(): AppError { return new AppError("PROJECT_NOT_FOUND", "Project not found", 404); }
