import { AppError } from "../http";
import type { InboxRepositoryPort } from "./repository";
import { INBOX_KINDS, INBOX_STATUSES, type InboxItem, type InboxKind, type InboxListFilters, type InboxPage, type InboxStatus } from "./types";

export interface InboxCreateInput { id?: unknown; clientKey?: unknown; kind?: unknown; content?: unknown; sourceUrl?: unknown; }

export interface InboxServiceOptions {
  id?: () => string;
  now?: () => Date;
  promoteTask?: (memberId: string, item: InboxItem) => Promise<{ taskId: string }>;
  promoteKnowledge?: (memberId: string, item: InboxItem) => Promise<{ submissionId: string }>;
}

export class InboxService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: InboxRepositoryPort, private readonly options: InboxServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(memberId: string, input: InboxCreateInput): Promise<{ item: InboxItem; created: boolean }> {
    const normalized = normalizeCreate(input, this.id());
    const replay = await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (replay) return { item: replay, created: false };
    const now = this.now().getTime();
    const inserted = await this.repository.insert({ ...normalized, memberId, createdAt: now, updatedAt: now });
    const item = await this.repository.findOwned(memberId, normalized.id)
      || await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (!item) throw new AppError("INBOX_NOT_FOUND", "Inbox item not found after create", 404, true);
    return { item, created: inserted };
  }

  async get(memberId: string, id: string): Promise<InboxItem> {
    const item = await this.repository.findOwned(memberId, requireId(id));
    if (!item) throw notFound();
    return item;
  }

  async list(memberId: string, filters: InboxListFilters = {}, pagination: { limit?: number; cursor?: string } = {}): Promise<InboxPage> {
    const status = filters.status;
    if (status !== undefined && !INBOX_STATUSES.includes(status)) throw invalid("INBOX_PAGE_INVALID");
    const request = normalizeCursorPage(pagination);
    return this.repository.listOwned(memberId, { ...request, ...(status ? { status } : {}) });
  }

  async updateStatus(memberId: string, id: string, status: unknown): Promise<InboxItem> {
    const item = await this.get(memberId, id);
    if (typeof status !== "string" || (status !== "inbox" && status !== "archived")) throw invalid("INBOX_INVALID");
    if (item.status === "promoted") throw transitionInvalid();
    if (item.status === status) return item;
    const updated = await this.repository.updateStatus(memberId, item.id, status, this.now().getTime());
    if (!updated) throw notFound();
    return updated;
  }

  async promoteTask(memberId: string, id: string): Promise<{ item: InboxItem; promoted: boolean; taskId: string }> {
    const item = await this.get(memberId, id);
    if (item.promotedTaskId) return { item, promoted: false, taskId: item.promotedTaskId };
    if (item.promotedSubmissionId || item.status === "promoted") throw transitionInvalid();
    if (!this.options.promoteTask) throw new AppError("INBOX_PROMOTION_UNAVAILABLE", "Task promotion is not configured", 503, true);
    const result = await this.options.promoteTask(memberId, item);
    const updated = await this.repository.promote(memberId, item.id, { taskId: result.taskId, updatedAt: this.now().getTime() });
    if (!updated) throw notFound();
    return { item: updated, promoted: true, taskId: result.taskId };
  }

  async promoteKnowledge(memberId: string, id: string): Promise<{ item: InboxItem; promoted: boolean; submissionId: string }> {
    const item = await this.get(memberId, id);
    if (item.promotedSubmissionId) return { item, promoted: false, submissionId: item.promotedSubmissionId };
    if (item.promotedTaskId || item.status === "promoted") throw transitionInvalid();
    if (!this.options.promoteKnowledge) throw new AppError("INBOX_PROMOTION_UNAVAILABLE", "Knowledge promotion is not configured", 503, true);
    const result = await this.options.promoteKnowledge(memberId, item);
    const updated = await this.repository.promote(memberId, item.id, { submissionId: result.submissionId, updatedAt: this.now().getTime() });
    if (!updated) throw notFound();
    return { item: updated, promoted: true, submissionId: result.submissionId };
  }
}

function normalizeCreate(input: InboxCreateInput, generatedId: string): { id: string; clientKey: string; kind: InboxKind; content: string; sourceUrl: string | null } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const id = record.id === undefined ? generatedId : requireId(record.id);
  const clientKey = typeof record.clientKey === "string" ? record.clientKey.trim() : "";
  const kind = record.kind;
  const content = typeof record.content === "string" ? record.content.trim() : "";
  const sourceUrl = record.sourceUrl === undefined || record.sourceUrl === null ? null : record.sourceUrl;
  if (!clientKey || clientKey.length > 160 || !/^[\x21-\x7e]+$/u.test(clientKey)
    || typeof kind !== "string" || !INBOX_KINDS.includes(kind as InboxKind)
    || !content || content.length > 200000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)
    || (sourceUrl !== null && (typeof sourceUrl !== "string" || sourceUrl.length > 2048 || !/^https?:\/\//u.test(sourceUrl)))) {
    throw invalid("INBOX_INVALID");
  }
  if (kind === "link" && sourceUrl === null) throw invalid("INBOX_INVALID");
  if (kind !== "link" && sourceUrl !== null) throw invalid("INBOX_INVALID");
  return { id, clientKey, kind: kind as InboxKind, content, sourceUrl: sourceUrl as string | null };
}

function normalizeCursorPage(pagination: { limit?: number; cursor?: string }): { limit: number; cursor?: string } {
  if (pagination.limit !== undefined && (!Number.isSafeInteger(pagination.limit) || pagination.limit < 1 || pagination.limit > 50)) throw invalid("INBOX_PAGE_INVALID");
  if (pagination.cursor !== undefined && typeof pagination.cursor !== "string") throw invalid("INBOX_PAGE_INVALID");
  return pagination.limit === undefined
    ? { limit: 20, ...(pagination.cursor ? { cursor: pagination.cursor } : {}) }
    : { limit: pagination.limit, ...(pagination.cursor ? { cursor: pagination.cursor } : {}) };
}

function requireId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value)) throw invalid("INBOX_INVALID");
  return value;
}
function invalid(code: "INBOX_INVALID" | "INBOX_PAGE_INVALID"): AppError { return new AppError(code, "Inbox request is invalid", 400); }
function transitionInvalid(): AppError { return new AppError("INBOX_TRANSITION_INVALID", "Inbox state transition is invalid", 422); }
function notFound(): AppError { return new AppError("INBOX_NOT_FOUND", "Inbox item not found", 404); }
