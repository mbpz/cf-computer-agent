import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, type PageRequest } from "../pagination";
import type { FavoritePage, FavoriteScope, FavoritesRepositoryPort, KnowledgeFavorite } from "./types";

type FavoriteRow = {
  knowledge_item_id: string;
  space_id: string;
  collection_id: string | null;
  revision_id: string;
  title: string;
  visibility: "shared" | "admin_only";
  published_at: string;
  created_at: string;
};

type FavoriteCursor = { v: 1; createdAt: string; knowledgeItemId: string };

export class FavoritesRepository implements FavoritesRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async isReadable(scope: FavoriteScope, knowledgeItemId: string): Promise<boolean> {
    const row = await this.db.prepare(readableSql).bind(knowledgeItemId, scope.role).first<{ readable: number }>();
    return row?.readable === 1;
  }

  async get(scope: FavoriteScope, knowledgeItemId: string): Promise<KnowledgeFavorite | null> {
    return mapRow(await this.db.prepare(`${favoriteSelect} WHERE f.member_id = ? AND f.knowledge_item_id = ? AND k.status = 'active' AND (k.collection_id IS NULL OR c.id IS NOT NULL) AND ${visibilitySql} LIMIT 1`)
      .bind(scope.memberId, knowledgeItemId, scope.role).first<FavoriteRow>());
  }

  async list(scope: FavoriteScope, request: PageRequest): Promise<FavoritePage> {
    const cursor = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    const cursorSql = cursor ? "AND (f.created_at < ? OR (f.created_at = ? AND f.knowledge_item_id < ?))" : "";
    const rows = await this.db.prepare(
      `${favoriteSelect}
       WHERE f.member_id = ? AND k.status = 'active' AND ${visibilitySql} ${cursorSql}
       ORDER BY f.created_at DESC, f.knowledge_item_id DESC LIMIT ?`,
    ).bind(
      scope.memberId,
      scope.role,
      ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.knowledgeItemId] : []),
      request.limit + 1,
    ).all<FavoriteRow>();
    const items = rows.results.slice(0, request.limit).map(mapRowRequired);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, createdAt: last.createdAt, knowledgeItemId: last.knowledgeItemId }),
      } : {}),
    };
  }

  async add(scope: FavoriteScope, knowledgeItemId: string, createdAt: string): Promise<KnowledgeFavorite> {
    await this.db.prepare(
      `INSERT INTO knowledge_favorites (member_id, knowledge_item_id, created_at)
       VALUES (?, ?, ?) ON CONFLICT(member_id, knowledge_item_id) DO NOTHING`,
    ).bind(scope.memberId, knowledgeItemId, createdAt).run();
    const favorite = await this.get(scope, knowledgeItemId);
    if (!favorite) throw new AppError("FAVORITE_UNAVAILABLE", "Favorite is unavailable", 503, true);
    return favorite;
  }

  async remove(scope: FavoriteScope, knowledgeItemId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM knowledge_favorites WHERE member_id = ? AND knowledge_item_id = ?")
      .bind(scope.memberId, knowledgeItemId).run();
    return result.meta.changes === 1;
  }
}

const visibilitySql = "(r.visibility = 'shared' OR ? = 'admin')";
const readableSql = `
  SELECT 1 AS readable
  FROM knowledge_items k
  JOIN revisions r ON r.id = k.current_revision_id AND r.knowledge_item_id = k.id
  JOIN spaces s ON s.id = k.space_id AND s.status = 'active'
  LEFT JOIN collections c ON c.id = k.collection_id AND c.space_id = k.space_id AND c.status = 'active'
  WHERE k.id = ? AND k.status = 'active'
    AND (k.collection_id IS NULL OR c.id IS NOT NULL)
    AND ${visibilitySql}
  LIMIT 1`;
const favoriteSelect = `
  SELECT f.knowledge_item_id, k.space_id, k.collection_id, r.id AS revision_id,
         r.title, r.visibility, r.published_at, f.created_at
  FROM knowledge_favorites f
  JOIN knowledge_items k ON k.id = f.knowledge_item_id
  JOIN revisions r ON r.id = k.current_revision_id AND r.knowledge_item_id = k.id
  JOIN spaces s ON s.id = k.space_id AND s.status = 'active'
  LEFT JOIN collections c ON c.id = k.collection_id AND c.space_id = k.space_id AND c.status = 'active'
`;

function mapRow(row: FavoriteRow | null): KnowledgeFavorite | null { return row ? mapRowRequired(row) : null; }
function mapRowRequired(row: FavoriteRow): KnowledgeFavorite {
  return {
    knowledgeItemId: row.knowledge_item_id,
    spaceId: row.space_id,
    collectionId: row.collection_id,
    revisionId: row.revision_id,
    title: row.title,
    visibility: row.visibility,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function decodeCursor(value: string): FavoriteCursor {
  try {
    const decoded = decodeOpaqueCursor(value);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.v !== 1 || typeof record.createdAt !== "string"
      || !isIsoTimestamp(record.createdAt) || typeof record.knowledgeItemId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.knowledgeItemId)) throw new Error();
    return { v: 1, createdAt: record.createdAt, knowledgeItemId: record.knowledgeItemId };
  } catch { throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400); }
}

function isIsoTimestamp(value: string): boolean { return value.length === 24 && !Number.isNaN(Date.parse(value)) && value.endsWith("Z"); }
