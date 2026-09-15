import { AppError } from "../http";
import { buildPageMetadata, pageOffset, type NumberedPage, type NumberedPageRequest } from "../pagination";

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
  recentVisitors: NumberedPage<RecentVisitor>;
}

export interface RecentVisitor {
  occurredAt: string;
  path: string;
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  colo: string | null;
  userAgent: string | null;
  member: { id: string; email: string } | null;
}

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
  constructor(
    private readonly db: D1Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

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

  async overview(days: number, pagination: NumberedPageRequest): Promise<AnalyticsOverview> {
    if (!Number.isSafeInteger(days) || days < 1 || days > 31) throw new AppError("ANALYTICS_RANGE_INVALID", "Analytics range must be between 1 and 31 days", 400);
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("Analytics clock is invalid");
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const start = new Date(end.getTime() - days * 86_400_000);
    const fromDay = start.toISOString().slice(0, 10);
    const toDay = end.toISOString().slice(0, 10);
    // All panels and the visitor page share one D1 transaction. Separate calls
    // (even Promise.all) can observe different committed visits.
    const results = await this.db.batch<Record<string, unknown>>([
      this.db.prepare(
      `SELECT day,
              COUNT(*) AS page_views,
              COUNT(DISTINCT visitor_hash) AS unique_visitors,
              COUNT(DISTINCT member_id) AS login_users
       FROM site_visit_events
       WHERE day >= ? AND day < ?
       GROUP BY day
       ORDER BY day ASC`,
      ).bind(fromDay, toDay),
      this.db.prepare(
      `SELECT COUNT(*) AS page_views,
              COUNT(DISTINCT visitor_hash) AS unique_visitors,
              COUNT(DISTINCT member_id) AS login_users
       FROM site_visit_events
       WHERE day >= ? AND day < ?`,
      ).bind(fromDay, toDay),
      this.db.prepare(
        `SELECT path AS key, COUNT(*) AS page_views
         FROM site_visit_events WHERE day >= ? AND day < ?
         GROUP BY path ORDER BY page_views DESC, path ASC LIMIT 8`,
      ).bind(fromDay, toDay),
      this.db.prepare(
        `SELECT COALESCE(region, 'unknown') AS key, COUNT(*) AS page_views
         FROM site_visit_events WHERE day >= ? AND day < ?
         GROUP BY region ORDER BY page_views DESC, key ASC LIMIT 8`,
      ).bind(fromDay, toDay),
      this.db.prepare(
        `SELECT COALESCE(country, 'unknown') AS key, COUNT(*) AS page_views
         FROM site_visit_events WHERE day >= ? AND day < ?
         GROUP BY country ORDER BY page_views DESC, key ASC LIMIT 8`,
      ).bind(fromDay, toDay),
      this.db.prepare(
        `SELECT e.created_at, e.path, e.ip_display, e.country, e.region, e.city, e.colo, e.user_agent,
                e.member_id, m.email AS member_email
         FROM site_visit_events AS e
         LEFT JOIN members AS m ON m.id = e.member_id
         WHERE e.day >= ? AND e.day < ?
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT ? OFFSET ?`,
      ).bind(fromDay, toDay, pagination.pageSize, pageOffset(pagination)),
    ]);
    if (results.length !== 6) throw invalidResult();
    const [rows, totals, pathRows, regionRows, countryRows, visitorRows] = results.map(resultRows);
    if (totals.length !== 1) throw invalidResult();
    const total = counts(totals[0]);
    if (visitorRows.length !== Math.min(pagination.pageSize, Math.max(0, total.pageViews - pageOffset(pagination)))) throw invalidResult();
    const daily = rows.map((row) => {
      if (typeof row.day !== "string") throw invalidResult();
      return { day: row.day, ...counts(row) };
    });
    return {
      range: { from: start.toISOString().slice(0, 10), to: new Date(end.getTime() - 1).toISOString().slice(0, 10), days },
      totals: total,
      daily,
      breakdowns: {
        paths: breakdown(pathRows),
        regions: breakdown(regionRows),
        countries: breakdown(countryRows),
      },
      recentVisitors: { items: visitorRows.map(mapVisitor), pagination: buildPageMetadata(pagination, total.pageViews) },
    };
  }
}

function mapVisitor(value: Record<string, unknown>): RecentVisitor {
  const row = value as VisitorRow;
  return {
    occurredAt: row.created_at,
    path: row.path,
    ip: row.ip_display || "unknown",
    country: row.country,
    region: row.region,
    city: row.city,
    colo: row.colo,
    userAgent: row.user_agent,
    member: row.member_id && row.member_email ? { id: row.member_id, email: row.member_email } : null,
  };
}

function breakdown(rows: Record<string, unknown>[]): Array<{ key: string; pageViews: number }> {
  return rows.map((row) => {
    if (typeof row.key !== "string") throw invalidResult();
    return { key: row.key, pageViews: count(row.page_views) };
  });
}

function resultRows(result: D1Result<Record<string, unknown>>): Record<string, unknown>[] {
  if (result?.success !== true || !Array.isArray(result.results) ||
      !result.results.every((row) => row !== null && typeof row === "object" && !Array.isArray(row))) throw invalidResult();
  return result.results;
}

function counts(row: Record<string, unknown>): AnalyticsOverview["totals"] {
  return { pageViews: count(row.page_views), uniqueVisitors: count(row.unique_visitors), loginUsers: count(row.login_users) };
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalidResult();
  return value;
}

function invalidResult(): AppError {
  return new AppError("ANALYTICS_RESULT_INVALID", "Analytics query returned an invalid result", 500);
}
