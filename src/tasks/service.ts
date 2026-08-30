import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import { normalizeNumberedPageRequest, type NumberedPageRequest } from "../pagination";
import type { AuditRepository } from "../audit/repository";
import type { AuditAction, CreateAuditEvent } from "../audit/types";
import type { NotificationEventInput } from "../notifications/types";
import type { TasksRepositoryPort } from "./repository";
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskLink, type TaskListFilters, type TaskPage, type TaskStatus, type TaskSummary } from "./types";

export interface TaskCreateInput { id?: unknown; title?: unknown; notes?: unknown; priority?: unknown; dueAt?: unknown; knowledgeItemId?: unknown; }
export interface TaskUpdateInput { title?: unknown; notes?: unknown; priority?: unknown; dueAt?: unknown; }

export interface TaskDetail { task: Task; tags: string[]; links: TaskLink[]; }

export interface TasksServiceOptions {
  id?: () => string;
  now?: () => Date;
  audit?: Pick<AuditRepository, "writeAudit">;
  notifications?: { emit(event: NotificationEventInput): Promise<unknown> };
}

/** 合法状态迁移表;done/canceled 为终态,仅可重开回 todo。 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["doing", "done", "canceled"],
  doing: ["todo", "blocked", "done", "canceled"],
  blocked: ["todo", "doing", "done", "canceled"],
  done: ["todo"],
  canceled: ["todo"],
};

export class TasksService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: TasksRepositoryPort, private readonly options: TasksServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(memberId: string, input: TaskCreateInput): Promise<{ task: Task; created: boolean; link?: TaskLink }> {
    const normalized = normalizeCreate(input);
    const existing = await this.repository.findOwned(memberId, normalized.id);
    if (existing) return { task: existing, created: false };
    if (await this.repository.countByMember(memberId) >= APP_CONFIG.maxTasksPerMember) {
      throw new AppError("TASK_LIMIT_REACHED", "Task limit reached", 409);
    }
    const now = this.now().getTime();
    const inserted = await this.repository.insert({
      id: normalized.id, memberId, title: normalized.title, notes: normalized.notes,
      priority: normalized.priority, dueAt: normalized.dueAt, createdAt: now, updatedAt: now,
    });
    const task = await this.repository.findOwned(memberId, normalized.id);
    if (!task) throw new AppError("TASK_NOT_FOUND", "Task not found", 404, true);
    if (inserted) await this.emitAudit("task.created", memberId, task.id, { status: "todo", priority: normalized.priority });
    let link: TaskLink | undefined;
    if (normalized.knowledgeItemId) {
      link = (await this.linkKnowledge(memberId, task, normalized.knowledgeItemId)).link;
    }
    return { task, created: inserted, ...(link ? { link } : {}) };
  }

  async get(memberId: string, id: string): Promise<TaskDetail> {
    const task = await this.requireOwned(memberId, id);
    return { task, tags: await this.repository.listTags(memberId, task.id), links: await this.repository.listLinks(memberId, task.id) };
  }

  async list(memberId: string, filters: TaskListFilters = {}, pagination: Partial<NumberedPageRequest> = {}): Promise<TaskPage> {
    return this.repository.list(memberId, {
      ...normalizeNumberedPageRequest(pagination, "TASK_PAGE_INVALID"),
      filters: normalizeFilters(filters),
    });
  }

  async summary(memberId: string): Promise<TaskSummary> {
    return this.repository.summary(memberId, this.now());
  }

  async update(memberId: string, id: string, input: TaskUpdateInput): Promise<Task> {
    await this.requireOwned(memberId, id);
    const normalized = normalizeUpdate(input);
    const updated = await this.repository.update(memberId, id, { ...normalized, updatedAt: this.now().getTime() });
    if (!updated) throw notFound();
    await this.emitAudit("task.updated", memberId, updated.id, { priority: normalized.priority });
    return updated;
  }

  async delete(memberId: string, id: string): Promise<void> {
    const task = await this.requireOwned(memberId, id);
    if (!await this.repository.delete(memberId, id)) throw notFound();
    await this.emitAudit("task.deleted", memberId, task.id, { status: task.status });
    return void task;
  }

  async setStatus(memberId: string, id: string, status: unknown): Promise<Task> {
    const task = await this.requireOwned(memberId, id);
    const next = normalizeStatus(status);
    if (task.status === next) return task; // 绝对值语义:重复提交即成功
    if (!TRANSITIONS[task.status].includes(next)) {
      throw new AppError("TASK_TRANSITION_INVALID", "Task status transition is invalid", 422);
    }
    const previousStatus = task.status;
    const now = this.now().getTime();
    const completedAt = next === "done" ? now : null;
    const progress = next === "done" && task.progress < 100 ? 100 : task.progress;
    const updated = await this.repository.updateStatus(memberId, id, next, next === "done" ? completedAt : null, progress, now);
    if (!updated) throw notFound();
    await this.emitAudit("task.status_changed", memberId, updated.id, { previousStatus, status: next });
    if (this.options.notifications) {
      const occurrenceId = this.id();
      await this.options.notifications.emit({
        recipientMemberId: memberId,
        eventType: "task.status_changed",
        actorMemberId: memberId,
        targetKind: "task",
        targetId: updated.id,
        payload: { previousStatus, status: next },
        deduplicationKey: `task:${updated.id}:status:${previousStatus}:${next}:${occurrenceId}`,
      });
    }
    return updated;
  }

  async setProgress(memberId: string, id: string, progress: unknown): Promise<Task> {
    const task = await this.requireOwned(memberId, id);
    if (task.status === "done" || task.status === "canceled") {
      throw new AppError("TASK_PROGRESS_INVALID", "Task progress is not editable in a terminal status", 400);
    }
    if (typeof progress !== "number" || !Number.isSafeInteger(progress) || progress < 0 || progress > 100) {
      throw new AppError("TASK_PROGRESS_INVALID", "Task progress must be an integer from 0 to 100", 400);
    }
    if (task.progress === progress) return task; // 幂等
    const updated = await this.repository.updateProgress(memberId, id, progress, this.now().getTime());
    if (!updated) throw notFound();
    await this.emitAudit("task.progress_changed", memberId, updated.id, { progress });
    return updated;
  }

  async replaceTags(memberId: string, id: string, tags: unknown): Promise<string[]> {
    const task = await this.requireOwned(memberId, id);
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
      throw invalid("TASK_INVALID", "Task fields are invalid");
    }
    const normalized = [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))].sort();
    if (normalized.length > APP_CONFIG.maxTaskTags) {
      throw new AppError("TASK_TAG_LIMIT", "Task tag limit reached", 409);
    }
    if (normalized.some((tag) => [...tag].length > APP_CONFIG.maxTaskTagChars || /[\u0000-\u001f\u007f-\u009f]/u.test(tag))) {
      throw invalid("TASK_INVALID", "Task fields are invalid");
    }
    const current = await this.repository.listTags(memberId, task.id);
    if (current.length === normalized.length && current.every((tag, index) => tag === normalized[index])) return current;
    await this.repository.replaceTags(memberId, task.id, normalized);
    await this.emitAudit("task.tags_replaced", memberId, task.id, { count: normalized.length });
    return normalized;
  }

  async addLink(memberId: string, taskId: string, knowledgeItemId: unknown): Promise<TaskLink> {
    const task = await this.requireOwned(memberId, taskId);
    if (typeof knowledgeItemId !== "string" || !validId(knowledgeItemId)) {
      throw invalid("TASK_INVALID", "Task fields are invalid");
    }
    return (await this.linkKnowledge(memberId, task, knowledgeItemId)).link;
  }

  async removeLink(memberId: string, taskId: string, linkId: string): Promise<void> {
    await this.requireOwned(memberId, taskId);
    const links = await this.repository.listLinks(memberId, taskId);
    const target = links.find((item) => item.id === linkId);
    if (!target) throw notFound();
    if (!await this.repository.deleteLink(memberId, taskId, linkId)) throw notFound();
    await this.emitAudit("task.unlinked", memberId, taskId, { knowledgeItemId: target.knowledgeItemId });
  }

  private async linkKnowledge(memberId: string, task: Task, knowledgeItemId: string): Promise<{ link: TaskLink; created: boolean }> {
    const existing = await this.repository.findLink(memberId, task.id, knowledgeItemId);
    if (existing) return { link: existing, created: false };
    if (!await this.repository.isKnowledgeVisible(memberId, knowledgeItemId)) {
      throw new AppError("TASK_KNOWLEDGE_NOT_FOUND", "Knowledge item is not visible", 404);
    }
    if (await this.repository.countLinks(memberId, task.id) >= APP_CONFIG.maxTaskLinksPerTask) {
      throw new AppError("TASK_LINK_LIMIT", "Task link limit reached", 409);
    }
    const inserted = await this.repository.insertLink({
      id: this.id(), taskId: task.id, memberId, knowledgeItemId, createdAt: this.now().getTime(),
    });
    const link = await this.repository.findLink(memberId, task.id, knowledgeItemId);
    if (!link) throw new AppError("TASK_NOT_FOUND", "Task not found", 404, true);
    if (inserted) await this.emitAudit("task.linked", memberId, task.id, { knowledgeItemId });
    return { link, created: inserted };
  }

  private async emitAudit(action: AuditAction, memberId: string, taskId: string, metadata: CreateAuditEvent["metadata"]): Promise<void> {
    if (!this.options.audit) return;
    await this.options.audit.writeAudit({
      id: this.id(), actorKind: "member", actorId: memberId, action,
      resourceType: "task", resourceId: taskId, metadata, createdAt: this.now().toISOString(),
    } as CreateAuditEvent);
  }

  private async requireOwned(memberId: string, id: string): Promise<Task> {
    if (!validId(id)) throw notFound();
    const task = await this.repository.findOwned(memberId, id);
    if (!task) throw notFound();
    return task;
  }
}

function normalizeCreate(input: TaskCreateInput): {
  id: string; title: string; notes: string; priority: Task["priority"]; dueAt: number | null; knowledgeItemId: string | null;
} {
  if (!input || typeof input !== "object") throw invalid("TASK_INVALID", "Task fields are invalid");
  const record = input as Record<string, unknown>;
  const id = record.id === undefined ? "" : record.id;
  if (typeof id !== "string" || !validId(id)) throw invalid("TASK_INVALID", "Task fields are invalid");
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || [...title].length > APP_CONFIG.maxTaskTitleChars || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const notes = record.notes === undefined || record.notes === null ? "" : record.notes;
  if (typeof notes !== "string" || [...notes].length > APP_CONFIG.maxTaskNotesChars || /[\u0000-\u001f\u007f-\u009f]/u.test(notes)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const priority = record.priority === undefined ? "medium" : record.priority;
  if (typeof priority !== "string" || !TASK_PRIORITIES.includes(priority as Task["priority"])) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const dueAtMs = parseOptionalDue(record.dueAt);
  const knowledgeItemId = record.knowledgeItemId === undefined || record.knowledgeItemId === null ? null : record.knowledgeItemId;
  if (knowledgeItemId !== null && (typeof knowledgeItemId !== "string" || !validId(knowledgeItemId))) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  return {
    id, title, notes, priority: priority as Task["priority"], dueAt: dueAtMs,
    knowledgeItemId: knowledgeItemId as string | null,
  };
}

function normalizeUpdate(input: TaskUpdateInput): { title: string; notes: string; priority: Task["priority"]; dueAt: number | null } {
  if (!input || typeof input !== "object") throw invalid("TASK_INVALID", "Task fields are invalid");
  const record = input as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || [...title].length > APP_CONFIG.maxTaskTitleChars || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const notes = record.notes === undefined || record.notes === null ? "" : record.notes;
  if (typeof notes !== "string" || [...notes].length > APP_CONFIG.maxTaskNotesChars || /[\u0000-\u001f\u007f-\u009f]/u.test(notes)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const priority = record.priority === undefined ? "medium" : record.priority;
  if (typeof priority !== "string" || !TASK_PRIORITIES.includes(priority as Task["priority"])) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  return { title, notes, priority: priority as Task["priority"], dueAt: parseOptionalDue(record.dueAt) };
}

function normalizeFilters(value?: TaskListFilters): TaskListFilters {
  if (!value) return {};
  const filters: TaskListFilters = {};
  if (value.status !== undefined) {
    if (typeof value.status !== "string" || !TASK_STATUSES.includes(value.status)) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.status = value.status;
  }
  if (value.priority !== undefined) {
    if (typeof value.priority !== "string" || !TASK_PRIORITIES.includes(value.priority)) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.priority = value.priority;
  }
  if (value.tag !== undefined) {
    if (typeof value.tag !== "string" || !value.tag || [...value.tag].length > APP_CONFIG.maxTaskTagChars) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.tag = value.tag;
  }
  if (value.due !== undefined) {
    if (value.due !== "today" && value.due !== "overdue" && value.due !== "none") throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.due = value.due;
  }
  if (value.q !== undefined) {
    if (typeof value.q !== "string" || [...value.q].length > APP_CONFIG.maxTaskTitleChars) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.q = value.q.trim();
  }
  return filters;
}

function normalizeStatus(status: unknown): TaskStatus {
  if (typeof status !== "string" || !TASK_STATUSES.includes(status as TaskStatus)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  return status as TaskStatus;
}

/** 接受 ISO 字符串或 epoch 毫秒;null/undefined 清空截止日。 */
function parseOptionalDue(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return ms;
  }
  throw invalid("TASK_INVALID", "Task fields are invalid");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value);
}

function invalid(code: "TASK_INVALID" | "TASK_PAGE_INVALID", message: string): AppError {
  return new AppError(code, message, 400);
}

function notFound(): AppError {
  return new AppError("TASK_NOT_FOUND", "Task not found", 404);
}
