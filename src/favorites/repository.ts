import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, type PageRequest } from "../pagination";
import type {
  FavoritePage,
  FavoriteScope,
  FavoritesRepositoryPort,
  KnowledgeFavorite,
  KnowledgeFavoriteOperation,
  KnowledgeFavoriteOperationResult,
  KnowledgeFavoriteWriteResult,
} from "./types";

type ReceiptRow = { request_hash: string; response_json: string; claim_id: string };

type FavoriteRow = {
  knowledge_item_id: string;
  space_id: string;
  collection_id: string | null;
  revision_id: string;
  title: string;
  visibility: "shared" | "admin_only";
  published_at: string;
  created_at: string;
  last_visited_at: string | null;
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

  async add(scope: FavoriteScope, knowledgeItemId: string, operationId: string, requestHash: string, createdAt: string): Promise<KnowledgeFavoriteWriteResult> {
    const claimId = crypto.randomUUID();
    const receipt: KnowledgeFavoriteOperation = { operationId, kind: "knowledge.favorite.add", knowledgeItemId, favorited: true, createdAt };
    // One batch claims the operation, applies its effect only for the claim owner,
    // and reads the winning receipt: a retry never repeats or rewrites the effect.
    const results = await this.db.batch<ReceiptRow>([
      this.db.prepare(`INSERT INTO knowledge_favorite_operation_receipts
        (member_id, operation_id, kind, request_hash, knowledge_item_id, claim_id, response_json, created_at)
        VALUES (?, ?, 'knowledge.favorite.add', ?, ?, ?, ?, ?)
        ON CONFLICT(member_id, operation_id) DO NOTHING`).bind(
        scope.memberId, operationId, requestHash, knowledgeItemId, claimId, JSON.stringify(receipt), createdAt,
      ),
      this.db.prepare(`INSERT INTO knowledge_favorites (member_id, knowledge_item_id, created_at)
        SELECT ?, ?, ? WHERE EXISTS
          (SELECT 1 FROM knowledge_favorite_operation_receipts WHERE member_id = ? AND operation_id = ? AND claim_id = ?)
        ON CONFLICT(member_id, knowledge_item_id) DO NOTHING`).bind(
        scope.memberId, knowledgeItemId, createdAt, scope.memberId, operationId, claimId,
      ),
      this.db.prepare("SELECT request_hash, response_json, claim_id FROM knowledge_favorite_operation_receipts WHERE member_id = ? AND operation_id = ?").bind(scope.memberId, operationId),
    ]);
    const { operation, claimed } = readRecordedOperation(results[2]?.results[0], requestHash, claimId);
    const favorite = await this.get(scope, knowledgeItemId);
    // Only the attempt that actually claimed the number needs a live edge to have
    // been created; a replay returns the recorded receipt even when a later
    // operation already removed it (never 503, never an invented live value).
    if (!favorite) {
      if (claimed) throw new AppError("FAVORITE_UNAVAILABLE", "Favorite is unavailable", 503, true);
      return { operation };
    }
    return { favorite, operation };
  }

  async remove(scope: FavoriteScope, knowledgeItemId: string, operationId: string, requestHash: string, createdAt: string): Promise<KnowledgeFavoriteOperationResult> {
    const claimId = crypto.randomUUID();
    const receipt: KnowledgeFavoriteOperation = { operationId, kind: "knowledge.favorite.remove", knowledgeItemId, favorited: false, createdAt };
    const results = await this.db.batch<ReceiptRow>([
      this.db.prepare(`INSERT INTO knowledge_favorite_operation_receipts
        (member_id, operation_id, kind, request_hash, knowledge_item_id, claim_id, response_json, created_at)
        VALUES (?, ?, 'knowledge.favorite.remove', ?, ?, ?, ?, ?)
        ON CONFLICT(member_id, operation_id) DO NOTHING`).bind(
        scope.memberId, operationId, requestHash, knowledgeItemId, claimId, JSON.stringify(receipt), createdAt,
      ),
      this.db.prepare(`DELETE FROM knowledge_favorites WHERE member_id = ? AND knowledge_item_id = ? AND EXISTS
        (SELECT 1 FROM knowledge_favorite_operation_receipts WHERE member_id = ? AND operation_id = ? AND claim_id = ?)`).bind(
        scope.memberId, knowledgeItemId, scope.memberId, operationId, claimId,
      ),
      this.db.prepare("SELECT request_hash, response_json, claim_id FROM knowledge_favorite_operation_receipts WHERE member_id = ? AND operation_id = ?").bind(scope.memberId, operationId),
    ]);
    // No live-state read at all: a repeated removal number always replays its
    // recorded receipt, including after a later re-add.
    return { operation: readRecordedOperation(results[2]?.results[0], requestHash, claimId).operation };
  }

  async operationResult(memberId: string, operationId: string): Promise<KnowledgeFavoriteOperation> {
    // Deliberately independent of the live favorite edge: a removed favorite must
    // still resolve the receipt of the write that removed it. Membership comes
    // only from the authenticated caller, never from the request.
    const row = await this.db.prepare(`SELECT response_json FROM knowledge_favorite_operation_receipts
      WHERE member_id = ? AND operation_id = ? AND kind IN ('knowledge.favorite.add', 'knowledge.favorite.remove')`)
      .bind(memberId, operationId).first<{ response_json: string }>();
    if (!row) throw new AppError("FAVORITE_OPERATION_NOT_FOUND", "Operation result not found", 404);
    return JSON.parse(row.response_json) as KnowledgeFavoriteOperation;
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
         r.title, r.visibility, r.published_at, f.created_at, v.last_visited_at
  FROM knowledge_favorites f
  JOIN knowledge_items k ON k.id = f.knowledge_item_id
  JOIN revisions r ON r.id = k.current_revision_id AND r.knowledge_item_id = k.id
  JOIN spaces s ON s.id = k.space_id AND s.status = 'active'
  LEFT JOIN collections c ON c.id = k.collection_id AND c.space_id = k.space_id AND c.status = 'active'
  LEFT JOIN knowledge_visits v ON v.member_id = f.member_id AND v.knowledge_item_id = f.knowledge_item_id
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
    completed: typeof row.last_visited_at === "string" && row.last_visited_at >= row.created_at,
  };
}

/**
 * Reads the receipt inside the same batch as the effect, so a retried operation
 * number replays the frozen result and a reused number with a different intent is
 * refused instead of silently changing meaning. `claimed` distinguishes the
 * attempt that recorded the receipt from every later replay.
 */
function readRecordedOperation(row: ReceiptRow | undefined, requestHash: string, claimId: string): { operation: KnowledgeFavoriteOperation; claimed: boolean } {
  if (!row) throw new AppError("FAVORITE_UNAVAILABLE", "Favorite is unavailable", 503, true);
  if (row.request_hash !== requestHash) throw new AppError("FAVORITE_OPERATION_CONFLICT", "Operation ID was already used for a different request", 409);
  return { operation: JSON.parse(row.response_json) as KnowledgeFavoriteOperation, claimed: row.claim_id === claimId };
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
