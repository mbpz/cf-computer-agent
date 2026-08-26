import { AppError } from "../http";

export interface RecordPageViewInput {
  id: string;
  path: string;
  visitorHash: string;
  memberId: string | null;
  occurredAt: Date;
}

export interface AnalyticsOverview {
  range: { from: string; to: string; days: number };
  totals: { pageViews: number; uniqueVisitors: number; loginUsers: number };
  daily: Array<{ day: string; pageViews: number; uniqueVisitors: number; loginUsers: number }>;
}

type DailyRow = { day: string; page_views: number; unique_visitors: number; login_users: number };
type TotalRow = { page_views: number; unique_visitors: number; login_users: number };

export class AnalyticsRepository {
  constructor(private readonly db: D1Database) {}

  async recordPageView(input: RecordPageViewInput): Promise<void> {
    const occurredAt = input.occurredAt;
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) throw new TypeError("Analytics timestamp is invalid");
    const createdAt = occurredAt.toISOString();
    const day = createdAt.slice(0, 10);
    const bucket = new Date(Math.floor(occurredAt.getTime() / 300_000) * 300_000).toISOString();
    await this.db.prepare(
      `INSERT OR IGNORE INTO site_visit_events
       (id, day, visit_bucket, path, visitor_hash, member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(input.id, day, bucket, input.path, input.visitorHash, input.memberId, createdAt).run();
  }

  async overview(days: number, now = new Date()): Promise<AnalyticsOverview> {
    if (!Number.isSafeInteger(days) || days < 1 || days > 31) throw new AppError("ANALYTICS_RANGE_INVALID", "Analytics range must be between 1 and 31 days", 400);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("Analytics clock is invalid");
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const start = new Date(end.getTime() - days * 86_400_000);
    const rows = await this.db.prepare(
      `SELECT day,
              COUNT(*) AS page_views,
              COUNT(DISTINCT visitor_hash) AS unique_visitors,
              COUNT(DISTINCT member_id) AS login_users
       FROM site_visit_events
       WHERE day >= ? AND day < ?
       GROUP BY day
       ORDER BY day ASC`,
    ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).all<DailyRow>();
    const total = await this.db.prepare(
      `SELECT COUNT(*) AS page_views,
              COUNT(DISTINCT visitor_hash) AS unique_visitors,
              COUNT(DISTINCT member_id) AS login_users
       FROM site_visit_events
       WHERE day >= ? AND day < ?`,
    ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).first<TotalRow>();
    const daily = rows.results.map((row) => ({
      day: row.day,
      pageViews: Number(row.page_views) || 0,
      uniqueVisitors: Number(row.unique_visitors) || 0,
      loginUsers: Number(row.login_users) || 0,
    }));
    return {
      range: { from: start.toISOString().slice(0, 10), to: new Date(end.getTime() - 1).toISOString().slice(0, 10), days },
      totals: {
        pageViews: Number(total?.page_views) || 0,
        uniqueVisitors: Number(total?.unique_visitors) || 0,
        loginUsers: Number(total?.login_users) || 0,
      },
      daily,
    };
  }
}
