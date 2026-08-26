import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, type PageRequest } from "../pagination";
import type { RecentVisit, RecentVisitPage, RecentVisitScope, RecentVisitsRepositoryPort } from "./types";

type RecentVisitRow = {
  knowledge_item_id: string;
  space_id: string;
  collection_id: string | null;
  revision_id: string;
  title: string;
  visibility: "shared" | "admin_only";
  published_at: string;
  last_visited_at: string;
  visit_count: number;
};

type RecentVisitCursor = { v: 1; lastVisitedAt: string; knowledgeItemId: string };
const MAX_RETAINED_VISITS = 200;
const visibilitySql = "(r.visibility = 'shared' OR ? = 'admin')";

export class RecentVisitsRepository implements RecentVisitsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async record(scope: RecentVisitScope, knowledgeItemId: string, visitedAt: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO knowledge_visits (member_id, knowledge_item_id, last_visited_at, visit_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(member_id, knowledge_item_id) DO UPDATE SET
         last_visited_at = excluded.last_visited_at,
         visit_count = MIN(knowledge_visits.visit_count + 1, 2147483647)`,
    ).bind(scope.memberId, knowledgeItemId, visitedAt).run();
    await this.db.prepare(
      `DELETE FROM knowledge_visits
       WHERE member_id = ?
         AND knowledge_item_id NOT IN (
           SELECT knowledge_item_id FROM knowledge_visits
           WHERE member_id = ? ORDER BY last_visited_at DESC, knowledge_item_id DESC LIMIT ?
         )`,
    ).bind(scope.memberId, scope.memberId, MAX_RETAINED_VISITS).run();
  }

  async list(scope: RecentVisitScope, request: PageRequest): Promise<RecentVisitPage> {
    const cursor = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    const cursorSql = cursor ? "AND (v.last_visited_at < ? OR (v.last_visited_at = ? AND v.knowledge_item_id < ?))" : "";
    const rows = await this.db.prepare(
      `${selectSql}
       WHERE v.member_id = ? AND k.status = 'active'
         AND (k.collection_id IS NULL OR c.id IS NOT NULL)
         AND ${visibilitySql} ${cursorSql}
       ORDER BY v.last_visited_at DESC, v.knowledge_item_id DESC LIMIT ?`,
    ).bind(
      scope.memberId,
      scope.role,
      ...(cursor ? [cursor.lastVisitedAt, cursor.lastVisitedAt, cursor.knowledgeItemId] : []),
      request.limit + 1,
    ).all<RecentVisitRow>();
    const items = rows.results.slice(0, request.limit).map(mapRow);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, lastVisitedAt: last.lastVisitedAt, knowledgeItemId: last.knowledgeItemId }),
      } : {}),
    };
  }
}

const selectSql = `
  SELECT v.knowledge_item_id, k.space_id, k.collection_id, r.id AS revision_id,
         r.title, r.visibility, r.published_at, v.last_visited_at, v.visit_count
  FROM knowledge_visits v
  JOIN knowledge_items k ON k.id = v.knowledge_item_id
  JOIN revisions r ON r.id = k.current_revision_id AND r.knowledge_item_id = k.id
  JOIN spaces s ON s.id = k.space_id AND s.status = 'active'
  LEFT JOIN collections c ON c.id = k.collection_id
    AND c.space_id = k.space_id AND c.status = 'active'`;

function mapRow(row: RecentVisitRow): RecentVisit {
  return {
    knowledgeItemId: row.knowledge_item_id,
    spaceId: row.space_id,
    collectionId: row.collection_id,
    revisionId: row.revision_id,
    title: row.title,
    visibility: row.visibility,
    publishedAt: row.published_at,
    lastVisitedAt: row.last_visited_at,
    visitCount: row.visit_count,
  };
}

function decodeCursor(value: string): RecentVisitCursor {
  try {
    const decoded = decodeOpaqueCursor(value);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.v !== 1 || typeof record.lastVisitedAt !== "string"
      || !isIsoTimestamp(record.lastVisitedAt) || typeof record.knowledgeItemId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.knowledgeItemId)) throw new Error();
    return { v: 1, lastVisitedAt: record.lastVisitedAt, knowledgeItemId: record.knowledgeItemId };
  } catch { throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400); }
}

function isIsoTimestamp(value: string): boolean { return value.length === 24 && !Number.isNaN(Date.parse(value)) && value.endsWith("Z"); }

