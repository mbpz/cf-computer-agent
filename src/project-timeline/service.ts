import { AppError } from "../http";
import type { ProjectsRepositoryPort } from "../projects/repository";
import type { ProjectTimelineRepositoryPort } from "./repository";
import type { ProjectTimelineCreate, ProjectTimelineItem, ProjectTimelineKind, ProjectTimelinePage, ProjectTimelineStatus } from "./types";

export interface ProjectTimelineCreateInput { id?: unknown; clientKey?: unknown; kind?: unknown; title?: unknown; body?: unknown; startsAt?: unknown; dueAt?: unknown; }

export class ProjectTimelineService {
  constructor(
    private readonly repository: ProjectTimelineRepositoryPort,
    private readonly projects: Pick<ProjectsRepositoryPort, "findOwned">,
    private readonly options: { id?: () => string; now?: () => Date } = {},
  ) {}

  async create(memberId: string, projectId: string, input: ProjectTimelineCreateInput): Promise<{ item: ProjectTimelineItem; created: boolean }> {
    await this.requireProject(memberId, projectId);
    const normalized = normalizeCreate(input, projectId, this.options.id?.() ?? crypto.randomUUID());
    const replay = await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (replay) {
      if (replay.projectId !== projectId) throw new AppError("PROJECT_TIMELINE_CLIENT_KEY_CONFLICT", "Timeline client key belongs to another project", 409);
      return { item: replay, created: false };
    }
    const now = (this.options.now?.() ?? new Date()).getTime();
    const created = await this.repository.insert({ ...normalized, memberId, createdAt: now, updatedAt: now });
    const item = await this.repository.findOwned(memberId, projectId, normalized.id) || await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (!item) throw new AppError("PROJECT_TIMELINE_NOT_FOUND", "Timeline item not found after create", 404, true);
    return { item, created };
  }

  async get(memberId: string, projectId: string, id: string): Promise<ProjectTimelineItem> {
    await this.requireProject(memberId, projectId);
    const item = await this.repository.findOwned(memberId, projectId, requireId(id));
    if (!item) throw notFound();
    return item;
  }

  async list(memberId: string, projectId: string, pagination: { limit?: number; cursor?: string } = {}): Promise<ProjectTimelinePage> {
    await this.requireProject(memberId, projectId);
    const limit = pagination.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (pagination.cursor !== undefined && typeof pagination.cursor !== "string")) throw new AppError("PROJECT_TIMELINE_PAGE_INVALID", "Timeline pagination is invalid", 400);
    return this.repository.listOwned(memberId, { projectId, limit, ...(pagination.cursor ? { cursor: pagination.cursor } : {}) });
  }

  async setStatus(memberId: string, projectId: string, id: string, status: unknown): Promise<ProjectTimelineItem> {
    if (typeof status !== "string" || !["open", "done", "archived"].includes(status)) throw new AppError("PROJECT_TIMELINE_INVALID", "Timeline status is invalid", 400);
    const current = await this.get(memberId, projectId, id);
    if (current.status === status) return current;
    const updated = await this.repository.updateStatus(memberId, projectId, current.id, status as ProjectTimelineStatus, (this.options.now?.() ?? new Date()).getTime());
    if (!updated) throw notFound();
    return updated;
  }

  private async requireProject(memberId: string, projectId: string): Promise<void> {
    if (!await this.projects.findOwned(memberId, requireId(projectId))) throw new AppError("PROJECT_NOT_FOUND", "Project not found", 404);
  }
}

function normalizeCreate(input: ProjectTimelineCreateInput, projectId: string, fallbackId: string): Omit<ProjectTimelineCreate, "memberId" | "createdAt" | "updatedAt"> {
  const id = typeof input.id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.id) ? input.id : fallbackId;
  const clientKey = typeof input.clientKey === "string" && input.clientKey.length >= 1 && input.clientKey.length <= 160 ? input.clientKey : id;
  const kind = input.kind;
  if (typeof kind !== "string" || !["meeting", "decision", "action_item", "milestone"].includes(kind)) throw new AppError("PROJECT_TIMELINE_INVALID", "Timeline kind is invalid", 400);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 200) throw new AppError("PROJECT_TIMELINE_INVALID", "Timeline title is invalid", 400);
  const body = input.body === undefined || input.body === null ? "" : typeof input.body === "string" ? input.body : "__invalid__";
  if (body === "__invalid__" || body.length > 200000) throw new AppError("PROJECT_TIMELINE_INVALID", "Timeline body is invalid", 400);
  const startsAt = optionalTime(input.startsAt);
  const dueAt = optionalTime(input.dueAt);
  if (startsAt !== null && dueAt !== null && dueAt < startsAt) throw new AppError("PROJECT_TIMELINE_INVALID", "Timeline due time must not precede start time", 400);
  return { id, projectId, clientKey, kind: kind as ProjectTimelineKind, title, body, startsAt, dueAt };
}

function optionalTime(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string") { const parsed = Date.parse(value); if (Number.isSafeInteger(parsed)) return parsed; }
  throw new AppError("PROJECT_TIMELINE_INVALID", "Timeline time is invalid", 400);
}
function requireId(value: string): string { if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw new AppError("PROJECT_TIMELINE_INVALID", "Timeline id is invalid", 400); return value; }
function notFound(): AppError { return new AppError("PROJECT_TIMELINE_NOT_FOUND", "Timeline item not found", 404); }
