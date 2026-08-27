import { AppError } from "../http";

export interface RecordPageViewInput {
  id: string;
  path: string;
  visitorHash: string;
  memberId: string | null;
  occurredAt: Date;
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  colo: string | null;
  userAgent: string | null;
}

export interface AnalyticsOverview {
  range: { from: string; to: string; days: number };
  totals: { pageViews: number; uniqueVisitors: number; loginUsers: number };
  daily: Array<{ day: string; pageViews: number; uniqueVisitors: number; loginUsers: number }>;
  breakdowns: {
    paths: Array<{ key: string; pageViews: number }>;
    regions: Array<{ key: string; pageViews: number }>;
    countries: Array<{ key: string; pageViews: number }>;
  };
  recentVisitors: Array<{
    occurredAt: string;
    path: string;
    ip: string;
    country: string | null;
    region: string | null;
    city: string | null;
    colo: string | null;
    userAgent: string | null;
    member: { id: string; email: string } | null;
  }>;
}

type DailyRow = { day: string; page_views: number; unique_visitors: number; login_users: number };
type TotalRow = { page_views: number; unique_visitors: number; login_users: number };
type BreakdownRow = { key: string | null; page_views: number };
type VisitorRow = {
  created_at: string;
  path: string;
  ip_display: string;
  country: string | null;
  region: string | null;
  city: string | null;
  colo: string | null;
  user_agent: string | null;
  member_id: string | null;
  member_email: string | null;
};

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
       (id, day, visit_bucket, path, visitor_hash, member_id, created_at, ip_display, country, region, city, colo, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(input.id, day, bucket, input.path, input.visitorHash, input.memberId, createdAt, input.ip, input.country, input.region, input.city, input.colo, input.userAgent).run();
  }

  async overview(days: number, now = new Date()): Promise<AnalyticsOverview> {
    if (!Number.isSafeInteger(days) || days < 1 || days > 31) throw new AppError("ANALYTICS_RANGE_INVALID", "Analytics range must be between 1 and 31 days", 400);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("Analytics clock is invalid");
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const start = new Date(end.getTime() - days * 86_400_000);
    const [rows, total, pathRows, regionRows, countryRows, visitorRows] = await Promise.all([
      this.db.prepare(
      `SELECT day,
              COUNT(*) AS page_views,
              COUNT(DISTINCT visitor_hash) AS unique_visitors,
              COUNT(DISTINCT member_id) AS login_users
       FROM site_visit_events
       WHERE day >= ? AND day < ?
       GROUP BY day
       ORDER BY day ASC`,
      ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).all<DailyRow>(),
      this.db.prepare(
      `SELECT COUNT(*) AS page_views,
              COUNT(DISTINCT visitor_hash) AS unique_visitors,
              COUNT(DISTINCT member_id) AS login_users
       FROM site_visit_events
       WHERE day >= ? AND day < ?`,
      ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).first<TotalRow>(),
      this.db.prepare(
        `SELECT path AS key, COUNT(*) AS page_views
         FROM site_visit_events WHERE day >= ? AND day < ?
         GROUP BY path ORDER BY page_views DESC, path ASC LIMIT 8`,
      ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).all<BreakdownRow>(),
      this.db.prepare(
        `SELECT COALESCE(region, 'unknown') AS key, COUNT(*) AS page_views
         FROM site_visit_events WHERE day >= ? AND day < ?
         GROUP BY region ORDER BY page_views DESC, key ASC LIMIT 8`,
      ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).all<BreakdownRow>(),
      this.db.prepare(
        `SELECT COALESCE(country, 'unknown') AS key, COUNT(*) AS page_views
         FROM site_visit_events WHERE day >= ? AND day < ?
         GROUP BY country ORDER BY page_views DESC, key ASC LIMIT 8`,
      ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).all<BreakdownRow>(),
      this.db.prepare(
        `SELECT e.created_at, e.path, e.ip_display, e.country, e.region, e.city, e.colo, e.user_agent,
                e.member_id, m.email AS member_email
         FROM site_visit_events AS e
         LEFT JOIN members AS m ON m.id = e.member_id
         WHERE e.day >= ? AND e.day < ?
         ORDER BY e.created_at DESC, e.id DESC LIMIT 100`,
      ).bind(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).all<VisitorRow>(),
    ]);
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
      breakdowns: {
        paths: breakdown(pathRows.results),
        regions: breakdown(regionRows.results),
        countries: breakdown(countryRows.results),
      },
      recentVisitors: visitorRows.results.map((row) => ({
        occurredAt: row.created_at,
        path: row.path,
        ip: row.ip_display || "unknown",
        country: row.country,
        region: row.region,
        city: row.city,
        colo: row.colo,
        userAgent: row.user_agent,
        member: row.member_id && row.member_email ? { id: row.member_id, email: row.member_email } : null,
      })),
    };
  }
}

function breakdown(rows: BreakdownRow[]): Array<{ key: string; pageViews: number }> {
  return rows.flatMap((row) => typeof row.key === "string" ? [{ key: row.key, pageViews: Number(row.page_views) || 0 }] : []);
}
