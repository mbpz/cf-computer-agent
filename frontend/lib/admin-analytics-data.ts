import { apiFetch, type Fetcher } from "./api";

export interface AdminAnalyticsOverview {
  range: { from: string; to: string; days: number };
  totals: { pageViews: number; uniqueVisitors: number; loginUsers: number };
  daily: Array<{ day: string; pageViews: number; uniqueVisitors: number; loginUsers: number }>;
}

export async function loadAdminAnalytics(days = 7, requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminAnalyticsOverview> {
  const data = await apiFetch<unknown>(`/api/admin/analytics/overview?days=${days}`, { requester, signal });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("ANALYTICS_INVALID");
  const value = data as Record<string, unknown>;
  const totals = value.totals;
  const range = value.range;
  const daily = value.daily;
  if (!isRecord(totals) || !isRecord(range) || !Array.isArray(daily)) throw new Error("ANALYTICS_INVALID");
  return {
    range: { from: stringValue(range.from), to: stringValue(range.to), days: numberValue(range.days) },
    totals: { pageViews: numberValue(totals.pageViews), uniqueVisitors: numberValue(totals.uniqueVisitors), loginUsers: numberValue(totals.loginUsers) },
    daily: daily.flatMap((item) => {
      if (!isRecord(item) || typeof item.day !== "string") return [];
      return [{ day: item.day, pageViews: numberValue(item.pageViews), uniqueVisitors: numberValue(item.uniqueVisitors), loginUsers: numberValue(item.loginUsers) }];
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
