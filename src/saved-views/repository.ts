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
  findByClientKey(memberId: string, clientKey: string): Promise<SavedView | null>;
  update(memberId: string, id: string, input: SavedViewUpdate): Promise<SavedView | null>;
  /** Convergent per (member, view): a repeat delete of a recorded deletion succeeds. */
  delete(memberId: string, id: string, deletedAt: string): Promise<boolean>;
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
        `INSERT INTO saved_views (id, member_id, client_key, name, schema_version, filters_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        input.id,
        input.memberId,
        input.clientKey,
        input.name,
        input.schemaVersion,
        JSON.stringify(input.filters),
        input.createdAt,
        input.updatedAt,
      ).run();
    } catch (error) {
      if (isNameConflict(error)) throw new SavedViewsRepositoryConflictError("name");
      // A concurrent replay of the same key wins the unique index; the caller
      // re-reads that recorded row instead of reporting a conflict.
      if (isClientKeyConflict(error)) {
        const existing = await this.findByClientKey(input.memberId, input.clientKey);
        if (existing) return existing;
      }
      throw error;
    }
    return { id: input.id, memberId: input.memberId, name: input.name, schemaVersion: 1, filters: input.filters, createdAt: input.createdAt, updatedAt: input.updatedAt };
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

  async findByClientKey(memberId: string, clientKey: string): Promise<SavedView | null> {
    if (clientKey === "") return null;
    return mapSavedView(await this.db.prepare(
      `SELECT id, member_id, name, schema_version, filters_json, created_at, updated_at
       FROM saved_views WHERE member_id = ? AND client_key = ? LIMIT 1`,
    ).bind(memberId, clientKey).first<SavedViewRow>());
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

  async delete(memberId: string, id: string, deletedAt: string): Promise<boolean> {
    // An owner-scoped receipt records the deletion, so a replay of the same
    // delete converges on success instead of reporting the view as missing.
    const receipt = await this.db.prepare(
      "SELECT 1 AS recorded FROM saved_view_delete_receipts WHERE member_id = ? AND view_id = ? LIMIT 1",
    ).bind(memberId, id).first<{ recorded: number }>();
    if (receipt) return true;
    // The delete and its receipt commit together, and the receipt is only
    // written when the guarded delete actually removed this owner's row.
    const results = await this.db.batch([
      this.db.prepare("DELETE FROM saved_views WHERE member_id = ? AND id = ?").bind(memberId, id),
      this.db.prepare(
        `INSERT OR IGNORE INTO saved_view_delete_receipts (member_id, view_id, deleted_at)
         SELECT ?, ?, ? WHERE changes() = 1`,
      ).bind(memberId, id, deletedAt),
    ]);
    return results[0]!.meta.changes === 1;
  }
}

function mapSavedView(row: SavedViewRow | null): SavedView | null {
  return row ? mapSavedViewRow(row) : null;
}

function mapSavedViewRow(row: SavedViewRow): SavedView {
  let stored: unknown;
  try { stored = JSON.parse(row.filters_json) as unknown; } catch { throw new AppError("SAVED_VIEW_CORRUPT", "Saved view data is corrupt", 500, true); }
  const filters = parseSavedViewFilters(stored);
  if (!filters || row.schema_version !== 1) {
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

// Rows written before the search filters existed store only the six original keys; a
// missing search condition reads as unset rather than corrupting the whole row.
const SAVED_VIEW_FILTER_KEYS = ["v", "q", "spaceId", "collectionId", "tagIds", "tagMode", "kind", "authorId", "publishedFrom", "publishedTo"] as const;

function parseSavedViewFilters(value: unknown): SavedView["filters"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !(SAVED_VIEW_FILTER_KEYS as readonly string[]).includes(key))) return null;
  const spaceId = record.spaceId ?? null;
  const collectionId = record.collectionId ?? null;
  const kind = record.kind ?? null;
  const authorId = record.authorId ?? null;
  const publishedFrom = record.publishedFrom ?? null;
  const publishedTo = record.publishedTo ?? null;
  const tagIds = record.tagIds;
  if (record.v !== 1 || typeof record.q !== "string") return null;
  if (spaceId !== null && typeof spaceId !== "string") return null;
  if (collectionId !== null && typeof collectionId !== "string") return null;
  if (authorId !== null && typeof authorId !== "string") return null;
  if (kind !== null && kind !== "text" && kind !== "markdown" && kind !== "code") return null;
  if (publishedFrom !== null && typeof publishedFrom !== "string") return null;
  if (publishedTo !== null && typeof publishedTo !== "string") return null;
  if (!Array.isArray(tagIds) || !tagIds.every((tag) => typeof tag === "string")) return null;
  if (record.tagMode !== "and" && record.tagMode !== "or") return null;
  return {
    v: 1,
    q: record.q,
    spaceId,
    collectionId,
    tagIds: [...tagIds] as string[],
    tagMode: record.tagMode,
    kind,
    authorId,
    publishedFrom,
    publishedTo,
  };
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

function isClientKeyConflict(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed:\s*saved_views\.member_id,\s*saved_views\.client_key/iu.test(error.message);
}

