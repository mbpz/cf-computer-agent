import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest, type PageRequest } from "../pagination";
import type { InboxCreate, InboxItem, InboxKind, InboxPage, InboxStatus } from "./types";

export interface InboxPageRepositoryRequest extends PageRequest { status?: InboxStatus; }

export interface InboxRepositoryPort {
  insert(input: InboxCreate): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<InboxItem | null>;
  findByClientKey(memberId: string, clientKey: string): Promise<InboxItem | null>;
  listOwned(memberId: string, request: InboxPageRepositoryRequest): Promise<InboxPage>;
  updateStatus(memberId: string, id: string, status: Exclude<InboxStatus, "promoted">, updatedAt: number): Promise<InboxItem | null>;
  promote(memberId: string, id: string, promotion: { taskId?: string; submissionId?: string; updatedAt: number }): Promise<InboxItem | null>;
}

type InboxRow = {
  id: string; member_id: string; client_key: string; kind: InboxKind; content: string; source_url: string | null;
  status: InboxStatus; promoted_task_id: string | null; promoted_submission_id: string | null;
  created_at: number; updated_at: number;
};

const columns = "id, member_id, client_key, kind, content, source_url, status, promoted_task_id, promoted_submission_id, created_at, updated_at";

export class InboxRepository implements InboxRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: InboxCreate): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO inbox_items
       (id, member_id, client_key, kind, content, source_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'inbox', ?, ?)`,
    ).bind(input.id, input.memberId, input.clientKey, input.kind, input.content, input.sourceUrl, input.createdAt, input.updatedAt).run();
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, id: string): Promise<InboxItem | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM inbox_items WHERE member_id = ? AND id = ? LIMIT 1`).bind(memberId, id).first<InboxRow>());
  }

  async findByClientKey(memberId: string, clientKey: string): Promise<InboxItem | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM inbox_items WHERE member_id = ? AND client_key = ? LIMIT 1`).bind(memberId, clientKey).first<InboxRow>());
  }

  async listOwned(memberId: string, request: InboxPageRepositoryRequest): Promise<InboxPage> {
    const parsed = parsePageRequest(request.limit, request.cursor);
    const cursor = parsed.cursor ? decodeCursor(parsed.cursor, memberId, request.status) : undefined;
    const filters = ["member_id = ?"];
    const values: unknown[] = [memberId];
    if (request.status) { filters.push("status = ?"); values.push(request.status); }
    if (cursor) { filters.push("(created_at < ? OR (created_at = ? AND id < ?))"); values.push(cursor.sort, cursor.sort, cursor.id); }
    const rows = await this.db.prepare(
      `SELECT ${columns} FROM inbox_items WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(...values, parsed.limit + 1).all<InboxRow>();
    const items = rows.results.slice(0, parsed.limit).map(mapRow).filter((item): item is InboxItem => item !== null);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > parsed.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, memberId, status: request.status ?? null, sort: Date.parse(last.createdAt), id: last.id }),
      } : {}),
    };
  }

  async updateStatus(memberId: string, id: string, status: Exclude<InboxStatus, "promoted">, updatedAt: number): Promise<InboxItem | null> {
    await this.db.prepare("UPDATE inbox_items SET status = ?, updated_at = ? WHERE member_id = ? AND id = ? AND status IN ('inbox', 'archived')")
      .bind(status, updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }

  async promote(memberId: string, id: string, promotion: { taskId?: string; submissionId?: string; updatedAt: number }): Promise<InboxItem | null> {
    const result = await this.db.prepare(
      `UPDATE inbox_items SET status = 'promoted', promoted_task_id = COALESCE(?, promoted_task_id),
       promoted_submission_id = COALESCE(?, promoted_submission_id), updated_at = ?
       WHERE member_id = ? AND id = ? AND status IN ('inbox', 'archived')`,
    ).bind(promotion.taskId ?? null, promotion.submissionId ?? null, promotion.updatedAt, memberId, id).run();
    if (result.meta.changes !== 1) return this.findOwned(memberId, id);
    return this.findOwned(memberId, id);
  }
}

function decodeCursor(cursor: string, memberId: string, status?: InboxStatus): { sort: number; id: string } {
  const value = decodeOpaqueCursor(cursor);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidCursor();
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || record.memberId !== memberId || (record.status ?? null) !== (status ?? null)
    || typeof record.sort !== "number" || !Number.isSafeInteger(record.sort) || record.sort < 0
    || typeof record.id !== "string" || !record.id) throw invalidCursor();
  return { sort: record.sort, id: record.id };
}

function invalidCursor(): AppError { return new AppError("INBOX_PAGE_INVALID", "Inbox page cursor is invalid", 400); }

function mapRow(row: InboxRow | null): InboxItem | null {
  if (!row) return null;
  return {
    id: row.id, memberId: row.member_id, clientKey: row.client_key, kind: row.kind,
    content: row.content, sourceUrl: row.source_url, status: row.status,
    promotedTaskId: row.promoted_task_id, promotedSubmissionId: row.promoted_submission_id,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
