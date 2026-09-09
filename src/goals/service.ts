import { AppError } from "../http";
import type { GoalsRepositoryPort } from "./repository";
import { GOAL_STATUSES, type Goal, type GoalListFilters, type GoalPage, type GoalStatus } from "./types";

export interface GoalCreateInput { id?: unknown; clientKey?: unknown; title?: unknown; description?: unknown; targetAt?: unknown; }
export interface GoalUpdateInput { title?: unknown; description?: unknown; targetAt?: unknown; }

export interface GoalsServiceOptions { id?: () => string; now?: () => Date; }

export class GoalsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: GoalsRepositoryPort, options: GoalsServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(memberId: string, input: GoalCreateInput): Promise<{ goal: Goal; created: boolean }> {
    const normalized = normalizeCreate(input, this.id());
    const replay = await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (replay) return { goal: replay, created: false };
    const now = this.now().getTime();
    const created = await this.repository.insert({ ...normalized, memberId, createdAt: now, updatedAt: now });
    const goal = await this.repository.findOwned(memberId, normalized.id)
      || await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (!goal) throw new AppError("GOAL_NOT_FOUND", "Goal not found after create", 404, true);
    return { goal, created };
  }

  async get(memberId: string, id: string): Promise<Goal> {
    const goal = await this.repository.findOwned(memberId, requireId(id));
    if (!goal) throw notFound();
    return goal;
  }

  async list(memberId: string, filters: GoalListFilters = {}, pagination: { limit?: number; cursor?: string } = {}): Promise<GoalPage> {
    const status = filters.status;
    if (status !== undefined && !GOAL_STATUSES.includes(status)) throw invalid("GOAL_PAGE_INVALID");
    const limit = pagination.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (pagination.cursor !== undefined && typeof pagination.cursor !== "string")) {
      throw invalid("GOAL_PAGE_INVALID");
    }
    return this.repository.listOwned(memberId, { limit, ...(pagination.cursor ? { cursor: pagination.cursor } : {}), ...(status ? { status } : {}) });
  }

  async update(memberId: string, id: string, input: GoalUpdateInput): Promise<Goal> {
    const current = await this.get(memberId, id);
    const normalized = normalizeUpdate(input, current);
    if (current.title === normalized.title && current.description === normalized.description && current.targetAt === normalized.targetAt) return current;
    const updated = await this.repository.update(memberId, current.id, { ...normalized, updatedAt: this.now().getTime() });
    if (!updated) throw notFound();
    return updated;
  }

  async setStatus(memberId: string, id: string, status: unknown): Promise<Goal> {
    if (typeof status !== "string" || !GOAL_STATUSES.includes(status as GoalStatus)) throw invalid("GOAL_INVALID");
    const current = await this.get(memberId, id);
    if (current.status === status) return current;
    const updated = await this.repository.updateStatus(memberId, current.id, status as GoalStatus, this.now().getTime());
    if (!updated) throw notFound();
    return updated;
  }

  async setProgress(memberId: string, id: string, progress: unknown): Promise<Goal> {
    if (!Number.isSafeInteger(progress) || (progress as number) < 0 || (progress as number) > 100) throw invalid("GOAL_INVALID");
    const current = await this.get(memberId, id);
    if (current.progress === progress) return current;
    const updated = await this.repository.updateProgress(memberId, current.id, progress as number, this.now().getTime());
    if (!updated) throw notFound();
    return updated;
  }
}

function normalizeCreate(input: GoalCreateInput, generatedId: string): { id: string; clientKey: string; title: string; description: string | null; targetAt: number | null } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const id = record.id === undefined ? generatedId : requireId(record.id);
  const clientKey = typeof record.clientKey === "string" ? record.clientKey.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = normalizeDescription(record.description);
  const targetAt = normalizeTargetAt(record.targetAt);
  if (!clientKey || clientKey.length > 160 || !title || [...title].length > 200) throw invalid("GOAL_INVALID");
  return { id, clientKey, title, description, targetAt };
}

function normalizeUpdate(input: GoalUpdateInput, current: Goal): { title: string; description: string | null; targetAt: number | null } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const title = record.title === undefined ? current.title : typeof record.title === "string" ? record.title.trim() : "";
  const description = record.description === undefined ? current.description : normalizeDescription(record.description);
  const targetAt = record.targetAt === undefined ? (current.targetAt ? Date.parse(current.targetAt) : null) : normalizeTargetAt(record.targetAt);
  if (!title || [...title].length > 200) throw invalid("GOAL_INVALID");
  return { title, description, targetAt };
}

function normalizeDescription(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || [...value].length > 200000) throw invalid("GOAL_INVALID");
  return value;
}

function normalizeTargetAt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid("GOAL_INVALID");
  return value as number;
}

function requireId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value)) throw invalid("GOAL_INVALID");
  return value;
}
function invalid(code: "GOAL_INVALID" | "GOAL_PAGE_INVALID"): AppError { return new AppError(code, "Goal request is invalid", 400); }
function notFound(): AppError { return new AppError("GOAL_NOT_FOUND", "Goal not found", 404); }
