import { apiFetch, type Fetcher } from "./api";

export interface AdminAnalyticsOverview {
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

export async function loadAdminAnalytics(days = 7, requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminAnalyticsOverview> {
  const data = await apiFetch<unknown>(`/api/admin/analytics/overview?days=${days}`, { requester, signal });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("ANALYTICS_INVALID");
  const value = data as Record<string, unknown>;
  const totals = value.totals;
  const range = value.range;
  const daily = value.daily;
  const breakdowns = value.breakdowns;
  const recentVisitors = value.recentVisitors;
  if (!isRecord(totals) || !isRecord(range) || !Array.isArray(daily) || !isRecord(breakdowns) || !Array.isArray(recentVisitors)) throw new Error("ANALYTICS_INVALID");
  const parseBreakdown = (input: unknown): Array<{ key: string; pageViews: number }> => Array.isArray(input)
    ? input.flatMap((item) => isRecord(item) && typeof item.key === "string" ? [{ key: item.key, pageViews: numberValue(item.pageViews) }] : [])
    : [];
  return {
    range: { from: stringValue(range.from), to: stringValue(range.to), days: numberValue(range.days) },
    totals: { pageViews: numberValue(totals.pageViews), uniqueVisitors: numberValue(totals.uniqueVisitors), loginUsers: numberValue(totals.loginUsers) },
    daily: daily.flatMap((item) => {
      if (!isRecord(item) || typeof item.day !== "string") return [];
      return [{ day: item.day, pageViews: numberValue(item.pageViews), uniqueVisitors: numberValue(item.uniqueVisitors), loginUsers: numberValue(item.loginUsers) }];
    }),
    breakdowns: {
      paths: parseBreakdown(breakdowns.paths),
      regions: parseBreakdown(breakdowns.regions),
      countries: parseBreakdown(breakdowns.countries),
    },
    recentVisitors: recentVisitors.flatMap((item) => {
      if (!isRecord(item) || typeof item.occurredAt !== "string" || typeof item.path !== "string" || typeof item.ip !== "string") return [];
      const member = isRecord(item.member) && typeof item.member.id === "string" && typeof item.member.email === "string"
        ? { id: item.member.id, email: item.member.email }
        : null;
      return [{
        occurredAt: item.occurredAt,
        path: item.path,
        ip: item.ip,
        country: nullableString(item.country),
        region: nullableString(item.region),
        city: nullableString(item.city),
        colo: nullableString(item.colo),
        userAgent: nullableString(item.userAgent),
        member,
      }];
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function nullableString(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
