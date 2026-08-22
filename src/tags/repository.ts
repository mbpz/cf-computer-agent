import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor } from "../pagination";
import type { Tag, TagPage, TagPageRepositoryRequest, TagsRepositoryPort, TagStatus } from "./types";

export type TagsRepositoryConflictKind = "target_invalid" | "slug_conflict";

export class TagsRepositoryConflictError extends Error {
  constructor(readonly kind: TagsRepositoryConflictKind) {
    super(`Tag conflict: ${kind}`);
  }
}

type TagRow = {
  id: string;
  space_id: string;
  slug: string;
  name: string;
  status: Tag["status"];
  created_at: string;
  updated_at: string;
};

const timestampCursorBounds = { minSort: 0, maxSort: 8_640_000_000_000_000 } as const;

export class TagsRepository implements TagsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async create(tag: Tag): Promise<Tag> {
    try {
      const result = await this.db.prepare(
        `INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM spaces
           WHERE id = ? AND status = 'active' AND kind != 'legacy' AND read_only = 0
         )`,
      ).bind(
        tag.id, tag.spaceId, tag.slug, tag.name, tag.status, tag.createdAt, tag.updatedAt, tag.spaceId,
      ).run();
      if (result.meta.changes !== 1) throw new TagsRepositoryConflictError("target_invalid");
      return tag;
    } catch (error) {
      if (error instanceof TagsRepositoryConflictError) throw error;
      if (isSlugConflict(error)) throw new TagsRepositoryConflictError("slug_conflict");
      throw error;
    }
  }

  async updateStatus(id: string, status: TagStatus, updatedAt: string): Promise<Tag | null> {
    const current = await this.db.prepare(
      `SELECT id, space_id, slug, name, status, created_at, updated_at
       FROM tags WHERE id = ? LIMIT 1`,
    ).bind(id).first<TagRow>();
    if (!current) return null;
    if (current.status === status) return mapTag(current);
    const affectedRevisions = `SELECT r.id FROM revision_tags rt
      JOIN revisions r ON r.id = rt.revision_id
      JOIN knowledge_items k ON k.current_revision_id = r.id AND k.status = 'active'
      WHERE rt.tag_id = ?`;
    const affectedRowids = `SELECT c.rowid FROM revision_tags rt
      JOIN revisions r ON r.id = rt.revision_id
      JOIN knowledge_items k ON k.current_revision_id = r.id AND k.status = 'active'
      JOIN chunks c ON c.revision_id = r.id
      WHERE rt.tag_id = ?`;
    const results = await this.db.batch([
      this.db.prepare(`DELETE FROM chunks_fts WHERE rowid IN (${affectedRowids})`).bind(id),
      this.db.prepare(`DELETE FROM chunks_fts_shared WHERE rowid IN (${affectedRowids})`).bind(id),
      this.db.prepare(
        `UPDATE knowledge_items SET search_status = 'pending'
         WHERE status = 'active' AND current_revision_id IN (${affectedRevisions})`,
      ).bind(id),
      this.db.prepare(
        `UPDATE jobs SET state = 'pending', attempts = 0, available_at = ?, last_error_code = NULL,
           lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE kind = 'index_revision' AND resource_id IN (${affectedRevisions})`,
      ).bind(updatedAt, updatedAt, id),
      this.db.prepare(
        "UPDATE tags SET status = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
      ).bind(status, updatedAt, id, current.updated_at),
      this.db.prepare(
        "SELECT CASE WHEN changes() = 1 THEN 1 ELSE json_extract('tag-change-guard', '$') END AS ok",
      ),
    ]);
    if (results.at(-2)?.meta.changes !== 1) throw new TagsRepositoryConflictError("target_invalid");
    return mapTag({ ...current, status, updated_at: updatedAt });
  }

  async listActive(spaceId: string): Promise<Tag[]> {
    const rows = await this.db.prepare(
      `SELECT t.id, t.space_id, t.slug, t.name, t.status, t.created_at, t.updated_at
       FROM tags t JOIN spaces s ON s.id = t.space_id
       WHERE t.space_id = ? AND t.status = 'active'
         AND s.status = 'active' AND s.kind != 'legacy'
       ORDER BY t.name COLLATE NOCASE ASC, t.id ASC`,
    ).bind(spaceId).all<TagRow>();
    return rows.results.map(mapTag);
  }

  async listActivePage(spaceId: string, request: TagPageRepositoryRequest): Promise<TagPage> {
    assertCursorKey(request.cursorKey);
    const cursor = request.cursor === undefined
      ? undefined
      : decodeTagPageCursor(request.cursor, request.cursorKey);
    const cursorSql = cursor
      ? "AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))"
      : "";
    const cursorBindings = cursor
      ? [timestamp(cursor.sort), timestamp(cursor.sort), cursor.id]
      : [];
    const rows = await this.db.prepare(
      `SELECT t.id, t.space_id, t.slug, t.name, t.status, t.created_at, t.updated_at
       FROM tags t
       WHERE t.space_id = ? AND t.status = 'active'
         AND EXISTS (
           SELECT 1 FROM spaces s
           WHERE s.id = t.space_id AND s.status = 'active' AND s.kind != 'legacy'
         )
         ${cursorSql}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
    ).bind(spaceId, ...cursorBindings, request.limit + 1).all<TagRow>();
    const items = rows.results.slice(0, request.limit).map(mapTag);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodeOpaqueCursor({
          v: 2,
          sort: Date.parse(last.createdAt),
          id: last.id,
          key: request.cursorKey,
        }),
      } : {}),
    };
  }

  async findActiveByIds(spaceId: string, ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await this.db.prepare(
      `SELECT id, space_id, slug, name, status, created_at, updated_at
       FROM tags WHERE space_id = ? AND status = 'active' AND id IN (${placeholders})
       ORDER BY id ASC`,
    ).bind(spaceId, ...ids).all<TagRow>();
    return rows.results.map(mapTag);
  }
}

function decodeTagPageCursor(cursor: string, cursorKey: string): { sort: number; id: string } {
  let record: Record<string, unknown>;
  try {
    const decoded = decodeOpaqueCursor(cursor);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 4 || record.v !== 2
      || typeof record.sort !== "number" || !Number.isSafeInteger(record.sort)
      || record.sort < timestampCursorBounds.minSort || record.sort > timestampCursorBounds.maxSort
      || typeof record.id !== "string" || record.id.length === 0
      || typeof record.key !== "string" || !/^[a-f0-9]{64}$/u.test(record.key)) throw new Error();
  } catch {
    throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  }
  if (record.key !== cursorKey) {
    throw new AppError("PAGE_INVALID", "Page cursor does not match the requested scope", 400);
  }
  return { sort: record.sort as number, id: record.id as string };
}

function assertCursorKey(cursorKey: string): void {
  if (!/^[a-f0-9]{64}$/u.test(cursorKey)) {
    throw new AppError("PAGE_INVALID", "Page request is invalid", 400);
  }
}

function timestamp(value: number): string {
  return new Date(value).toISOString();
}

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    spaceId: row.space_id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isSlugConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed: tags.space_id, tags.slug");
}
