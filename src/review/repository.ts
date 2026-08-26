import type { ReviewPeriod, ReviewRepositoryPort, ReviewResult, ReviewScope } from "./types";

type ReviewRow = {
  knowledge_item_id: string;
  revision_id: string;
  title: string;
  published_at: string;
  last_visited_at: string | null;
  favorite: number;
};

const MAX_REVIEW_ITEMS = 50;
const DAY_MS = 86_400_000;

export class ReviewRepository implements ReviewRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async list(scope: ReviewScope, period: ReviewPeriod, now: Date): Promise<ReviewResult> {
    const range = reviewRange(period, now);
    const rows = await this.db.prepare(
      `SELECT k.id AS knowledge_item_id, r.id AS revision_id, r.title, r.published_at,
              v.last_visited_at, CASE WHEN f.member_id IS NULL THEN 0 ELSE 1 END AS favorite
       FROM knowledge_items k
       JOIN revisions r ON r.id = k.current_revision_id AND r.knowledge_item_id = k.id
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active'
       LEFT JOIN collections c ON c.id = k.collection_id
         AND c.space_id = k.space_id AND c.status = 'active'
       LEFT JOIN knowledge_visits v ON v.member_id = ? AND v.knowledge_item_id = k.id
       LEFT JOIN knowledge_favorites f ON f.member_id = ? AND f.knowledge_item_id = k.id
       WHERE k.status = 'active'
         AND (k.collection_id IS NULL OR c.id IS NOT NULL)
         AND (r.visibility = 'shared' OR ? = 'admin')
         AND (r.published_at >= ? OR f.member_id IS NOT NULL)
         AND (v.last_visited_at IS NULL OR v.last_visited_at < ?)
       ORDER BY CASE WHEN f.member_id IS NOT NULL THEN 0 ELSE 1 END ASC,
                r.published_at DESC, k.id DESC
       LIMIT ?`,
    ).bind(scope.memberId, scope.memberId, scope.role, range.from, range.from, MAX_REVIEW_ITEMS).all<ReviewRow>();

    return {
      period,
      from: range.from,
      to: range.to,
      items: rows.results.map((row) => ({
        knowledgeItemId: row.knowledge_item_id,
        revisionId: row.revision_id,
        title: row.title,
        publishedAt: row.published_at,
        lastVisitedAt: row.last_visited_at,
        reason: row.favorite === 1 ? "to_read" : "new",
        favorite: row.favorite === 1,
      })),
    };
  }
}

function reviewRange(period: ReviewPeriod, now: Date): { from: string; to: string } {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("Review clock is invalid");
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const from = new Date(end.getTime() - (period === "daily" ? DAY_MS : 7 * DAY_MS));
  return { from: from.toISOString(), to: end.toISOString() };
}
