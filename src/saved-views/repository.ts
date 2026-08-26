import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, type PageRequest } from "../pagination";
import type { SavedView, SavedViewCreate, SavedViewPage, SavedViewUpdate } from "./types";

export type SavedViewsRepositoryConflictKind = "name";

export class SavedViewsRepositoryConflictError extends Error {
  constructor(readonly kind: SavedViewsRepositoryConflictKind) {
    super(`Saved view conflict: ${kind}`);
  }
}

export interface SavedViewsRepositoryPort {
  create(input: SavedViewCreate): Promise<SavedView>;
  list(memberId: string, request: PageRequest): Promise<SavedViewPage>;
  findOwned(memberId: string, id: string): Promise<SavedView | null>;
  update(memberId: string, id: string, input: SavedViewUpdate): Promise<SavedView | null>;
  delete(memberId: string, id: string): Promise<boolean>;
}

type SavedViewRow = {
  id: string;
  member_id: string;
  name: string;
  schema_version: number;
  filters_json: string;
  created_at: string;
  updated_at: string;
};

type SavedViewCursor = { v: 1; updatedAt: string; id: string };

export class SavedViewsRepository implements SavedViewsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async create(input: SavedViewCreate): Promise<SavedView> {
    try {
      await this.db.prepare(
        `INSERT INTO saved_views (id, member_id, name, schema_version, filters_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        input.id,
        input.memberId,
        input.name,
        input.schemaVersion,
        JSON.stringify(input.filters),
        input.createdAt,
        input.updatedAt,
      ).run();
    } catch (error) {
      if (isNameConflict(error)) throw new SavedViewsRepositoryConflictError("name");
      throw error;
    }
    return input;
  }

  async list(memberId: string, request: PageRequest): Promise<SavedViewPage> {
    const cursor = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    const cursorSql = cursor ? "AND (updated_at < ? OR (updated_at = ? AND id < ?))" : "";
    const rows = await this.db.prepare(
      `SELECT id, member_id, name, schema_version, filters_json, created_at, updated_at
       FROM saved_views
       WHERE member_id = ? ${cursorSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    ).bind(
      memberId,
      ...(cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : []),
      request.limit + 1,
    ).all<SavedViewRow>();
    const items = rows.results.slice(0, request.limit).map(mapSavedViewRow);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, updatedAt: last.updatedAt, id: last.id }),
      } : {}),
    };
  }

  async findOwned(memberId: string, id: string): Promise<SavedView | null> {
    return mapSavedView(await this.db.prepare(
      `SELECT id, member_id, name, schema_version, filters_json, created_at, updated_at
       FROM saved_views WHERE member_id = ? AND id = ? LIMIT 1`,
    ).bind(memberId, id).first<SavedViewRow>());
  }

  async update(memberId: string, id: string, input: SavedViewUpdate): Promise<SavedView | null> {
    try {
      const result = await this.db.prepare(
        `UPDATE saved_views
         SET name = ?, filters_json = ?, updated_at = ?
         WHERE member_id = ? AND id = ? AND schema_version = 1`,
      ).bind(input.name, JSON.stringify(input.filters), input.updatedAt, memberId, id).run();
      if (result.meta.changes !== 1) return null;
    } catch (error) {
      if (isNameConflict(error)) throw new SavedViewsRepositoryConflictError("name");
      throw error;
    }
    const updated = await this.findOwned(memberId, id);
    if (!updated) throw new Error("Saved view disappeared after update");
    return updated;
  }

  async delete(memberId: string, id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM saved_views WHERE member_id = ? AND id = ?").bind(memberId, id).run();
    return result.meta.changes === 1;
  }
}

function mapSavedView(row: SavedViewRow | null): SavedView | null {
  return row ? mapSavedViewRow(row) : null;
}

function mapSavedViewRow(row: SavedViewRow): SavedView {
  let filters: unknown;
  try { filters = JSON.parse(row.filters_json) as unknown; } catch { throw new AppError("SAVED_VIEW_CORRUPT", "Saved view data is corrupt", 500, true); }
  if (!isSavedViewFilters(filters) || row.schema_version !== 1) {
    throw new AppError("SAVED_VIEW_CORRUPT", "Saved view data is corrupt", 500, true);
  }
  return {
    id: row.id,
    memberId: row.member_id,
    name: row.name,
    schemaVersion: 1,
    filters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isSavedViewFilters(value: unknown): value is SavedView["filters"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 6
    && record.v === 1
    && typeof record.q === "string"
    && (record.spaceId === null || typeof record.spaceId === "string")
    && (record.collectionId === null || typeof record.collectionId === "string")
    && Array.isArray(record.tagIds) && record.tagIds.every((tag) => typeof tag === "string")
    && (record.tagMode === "and" || record.tagMode === "or");
}

function decodeCursor(value: string): SavedViewCursor {
  try {
    const decoded = decodeOpaqueCursor(value);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.v !== 1
      || typeof record.updatedAt !== "string" || !isIsoTimestamp(record.updatedAt)
      || typeof record.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.id)) throw new Error();
    return { v: 1, updatedAt: record.updatedAt, id: record.id };
  } catch {
    throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  }
}

function isIsoTimestamp(value: string): boolean {
  return value.length === 24 && !Number.isNaN(Date.parse(value)) && value.endsWith("Z");
}

function isNameConflict(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed:\s*saved_views\.member_id,\s*saved_views\.name/iu.test(error.message);
}

