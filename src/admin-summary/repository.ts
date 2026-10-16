import { mapAuditRow, type AuditRepository, type AuditRow } from "../audit/repository";
import type { AuditEvent } from "../audit/types";
import { AppError } from "../http";

/** One real, bounded UTC day of business activity. Zero is only ever a measured zero. */
export interface AdminDashboardTrendPoint {
  day: string;
  submissions: number;
  publications: number;
}

export interface AdminDashboardSummarySnapshot {
  trend: AdminDashboardTrendPoint[];
  activity: AuditEvent[];
}

export const ADMIN_SUMMARY_TREND_DAYS = 7;
export const ADMIN_SUMMARY_ACTIVITY_LIMIT = 5;

/**
 * The dashboard summary reads the business tables directly: submissions created
 * and revisions published per UTC day, plus the most recent audit events. It
 * never reads site visit events and never reuses the three list totals, so every
 * number shown here has exactly one source.
 */
export class AdminSummaryRepository {
  constructor(
    private readonly db: D1Database,
    private readonly audit: AuditRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async snapshot(): Promise<AdminDashboardSummarySnapshot> {
    const window = trendWindow(this.now(), ADMIN_SUMMARY_TREND_DAYS);
    // One D1 batch: the trend and the activity rows describe the same commit point.
    const results = await this.db.batch<Record<string, unknown>>([
      this.db.prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
         FROM submissions WHERE created_at >= ? AND created_at < ? GROUP BY day`,
      ).bind(window.from, window.to),
      this.db.prepare(
        `SELECT substr(published_at, 1, 10) AS day, COUNT(*) AS total
         FROM revisions WHERE published_at >= ? AND published_at < ? GROUP BY day`,
      ).bind(window.from, window.to),
      this.audit.prepareRecentActivity(ADMIN_SUMMARY_ACTIVITY_LIMIT),
    ]);
    if (results.length !== 3 || results.some((result) => result.success !== true)) throw invalidSnapshot();
    const submissionDays = results[0];
    const publicationDays = results[1];
    const activity = results[2];
    const submissions = dailyTotals(submissionDays, window.days);
    const publications = dailyTotals(publicationDays, window.days);
    if (!Array.isArray(activity.results)) throw invalidSnapshot();
    return {
      trend: window.days.map((day) => ({
        day,
        submissions: submissions.get(day) ?? 0,
        publications: publications.get(day) ?? 0,
      })),
      activity: activity.results.map((row) => mapAuditRow(row as unknown as AuditRow)),
    };
  }
}

interface TrendWindow { from: string; to: string; days: string[]; }

function trendWindow(now: Date, trendDays: number): TrendWindow {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("Admin summary clock is invalid");
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const start = end - trendDays * 86_400_000;
  const days: string[] = [];
  for (let index = 0; index < trendDays; index += 1) {
    days.push(new Date(start + index * 86_400_000).toISOString().slice(0, 10));
  }
  const from = new Date(start).toISOString().slice(0, 10);
  const to = new Date(end).toISOString().slice(0, 10);
  return { from: `${from}T00:00:00.000Z`, to: `${to}T00:00:00.000Z`, days };
}

function dailyTotals(result: D1Result<Record<string, unknown>>, days: readonly string[]): Map<string, number> {
  const window = new Set(days);
  const totals = new Map<string, number>();
  if (!Array.isArray(result.results)) throw invalidSnapshot();
  for (const row of result.results) {
    // A grouped row outside the requested window means the query and the window
    // disagree; ignoring it would silently under-count the series.
    if (typeof row.day !== "string" || !window.has(row.day) || totals.has(row.day)) throw invalidSnapshot();
    totals.set(row.day, countValue(row.total));
  }
  return totals;
}

function countValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalidSnapshot();
  return value;
}

function invalidSnapshot(): AppError {
  return new AppError("ADMIN_SUMMARY_RESULT_INVALID", "Admin summary query returned an invalid result", 500);
}
