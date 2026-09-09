import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest, type PageRequest } from "../pagination";
import type { Goal, GoalCreate, GoalPage, GoalStatus, GoalUpdate } from "./types";

export interface GoalsPageRepositoryRequest extends PageRequest { status?: GoalStatus; }

export interface GoalsRepositoryPort {
  insert(input: GoalCreate): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<Goal | null>;
  findByClientKey(memberId: string, clientKey: string): Promise<Goal | null>;
  listOwned(memberId: string, request: GoalsPageRepositoryRequest): Promise<GoalPage>;
  update(memberId: string, id: string, input: GoalUpdate): Promise<Goal | null>;
  updateStatus(memberId: string, id: string, status: GoalStatus, updatedAt: number): Promise<Goal | null>;
  updateProgress(memberId: string, id: string, progress: number, updatedAt: number): Promise<Goal | null>;
}

type GoalRow = {
  id: string; member_id: string; client_key: string; title: string; description: string | null;
  status: GoalStatus; progress: number; target_at: number | null; created_at: number; updated_at: number;
};

const columns = "id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at";

export class GoalsRepository implements GoalsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: GoalCreate): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO goals
       (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?, ?)`,
    ).bind(input.id, input.memberId, input.clientKey, input.title, input.description, input.targetAt, input.createdAt, input.updatedAt).run();
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, id: string): Promise<Goal | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM goals WHERE member_id = ? AND id = ? LIMIT 1`).bind(memberId, id).first<GoalRow>());
  }

  async findByClientKey(memberId: string, clientKey: string): Promise<Goal | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM goals WHERE member_id = ? AND client_key = ? LIMIT 1`).bind(memberId, clientKey).first<GoalRow>());
  }

  async listOwned(memberId: string, request: GoalsPageRepositoryRequest): Promise<GoalPage> {
    const parsed = parsePageRequest(request.limit, request.cursor);
    const cursor = parsed.cursor ? decodeCursor(parsed.cursor, memberId, request.status) : undefined;
    const filters = ["member_id = ?"];
    const values: unknown[] = [memberId];
    if (request.status) { filters.push("status = ?"); values.push(request.status); }
    if (cursor) { filters.push("(updated_at < ? OR (updated_at = ? AND id < ?))"); values.push(cursor.sort, cursor.sort, cursor.id); }
    const rows = await this.db.prepare(
      `SELECT ${columns} FROM goals WHERE ${filters.join(" AND ")}
       ORDER BY updated_at DESC, id DESC LIMIT ?`,
    ).bind(...values, parsed.limit + 1).all<GoalRow>();
    const items = rows.results.slice(0, parsed.limit).map(mapRow).filter((item): item is Goal => item !== null);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > parsed.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, memberId, status: request.status ?? null, sort: Date.parse(last.updatedAt), id: last.id }),
      } : {}),
    };
  }

  async update(memberId: string, id: string, input: GoalUpdate): Promise<Goal | null> {
    await this.db.prepare(
      "UPDATE goals SET title = ?, description = ?, target_at = ?, updated_at = ? WHERE member_id = ? AND id = ?",
    ).bind(input.title, input.description, input.targetAt, input.updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }

  async updateStatus(memberId: string, id: string, status: GoalStatus, updatedAt: number): Promise<Goal | null> {
    await this.db.prepare("UPDATE goals SET status = ?, updated_at = ? WHERE member_id = ? AND id = ?")
      .bind(status, updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }

  async updateProgress(memberId: string, id: string, progress: number, updatedAt: number): Promise<Goal | null> {
    await this.db.prepare("UPDATE goals SET progress = ?, updated_at = ? WHERE member_id = ? AND id = ?")
      .bind(progress, updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }
}

function decodeCursor(cursor: string, memberId: string, status?: GoalStatus): { sort: number; id: string } {
  const value = decodeOpaqueCursor(cursor);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidCursor();
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || record.memberId !== memberId || (record.status ?? null) !== (status ?? null)
    || typeof record.sort !== "number" || !Number.isSafeInteger(record.sort) || record.sort < 0
    || typeof record.id !== "string" || !record.id) throw invalidCursor();
  return { sort: record.sort, id: record.id };
}

function invalidCursor(): AppError { return new AppError("GOAL_PAGE_INVALID", "Goal page cursor is invalid", 400); }

function mapRow(row: GoalRow | null): Goal | null {
  if (!row) return null;
  return {
    id: row.id, memberId: row.member_id, clientKey: row.client_key, title: row.title,
    description: row.description, status: row.status, progress: row.progress,
    targetAt: row.target_at === null ? null : new Date(row.target_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
