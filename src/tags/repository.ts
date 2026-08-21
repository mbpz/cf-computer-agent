import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import type { Tag, TagPage, TagsRepositoryPort } from "./types";

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

  async listActivePage(spaceId: string, request: PageRequest): Promise<TagPage> {
    const cursor = request.cursor === undefined
      ? undefined
      : decodePageCursor(request.cursor, timestampCursorBounds);
    const cursorSql = cursor
      ? "AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))"
      : "";
    const cursorBindings = cursor
      ? [timestamp(cursor.sort), timestamp(cursor.sort), cursor.id]
      : [];
    const rows = await this.db.prepare(
      `SELECT t.id, t.space_id, t.slug, t.name, t.status, t.created_at, t.updated_at
       FROM tags t JOIN spaces s ON s.id = t.space_id
       WHERE t.space_id = ? AND t.status = 'active'
         AND s.status = 'active' AND s.kind != 'legacy'
         ${cursorSql}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
    ).bind(spaceId, ...cursorBindings, request.limit + 1).all<TagRow>();
    const items = rows.results.slice(0, request.limit).map(mapTag);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodePageCursor({ sort: Date.parse(last.createdAt), id: last.id }),
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
