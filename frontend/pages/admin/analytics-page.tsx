import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageState } from "../../components/ui/page-state";
import { Skeleton } from "../../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminAnalyticsOverview } from "../../lib/admin-analytics-data";
import { DataPagination } from "../../components/data-pagination";
import type { SupportedPageSize } from "../../lib/numbered-page";

export function AdminAnalyticsPage({ state, locale, days = 7, pending = false, localError = false, onDaysChange, onPageChange, onPageSizeChange, onRefresh }: { state: { kind: "loading" } | { kind: "ready"; data: AdminAnalyticsOverview } | { kind: "error" }; locale?: LocaleRuntime; days?: number; pending?: boolean; localError?: boolean; onDaysChange?: (days: number) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void; onRefresh?: () => void }) {
  if (state.kind === "loading") return <div aria-busy="true" className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-56" /></div>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "ADMIN_ANALYTICS_UNAVAILABLE")} />;
  const { data } = state;
  const recentVisitors = Array.isArray(data.recentVisitors)
    ? { items: data.recentVisitors as AdminAnalyticsOverview["recentVisitors"]["items"], pagination: { page: 1, pageSize: 20 as const, total: data.recentVisitors.length, totalPages: data.recentVisitors.length === 0 ? 0 : 1 } }
    : data.recentVisitors;
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p><h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_ANALYTICS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_DESCRIPTION")}</p></div><div className="flex items-center gap-2"><label htmlFor="admin-analytics-range" className="sr-only">{frontendText(locale, "ADMIN_ANALYTICS_RANGE")}</label><select id="admin-analytics-range" className="h-9 rounded-md border bg-background px-3 text-sm" value={days} onChange={(event) => onDaysChange?.(Number(event.target.value))}><option value={7}>{frontendText(locale, "ADMIN_ANALYTICS_RANGE_7")}</option><option value={14}>{frontendText(locale, "ADMIN_ANALYTICS_RANGE_14")}</option><option value={30}>{frontendText(locale, "ADMIN_ANALYTICS_RANGE_30")}</option></select><Button type="button" variant="outline" size="sm" onClick={onRefresh}>{frontendText(locale, "ADMIN_ANALYTICS_REFRESH")}</Button></div></div>
    <div className="grid gap-4 md:grid-cols-3"><Metric label={frontendText(locale, "ADMIN_ANALYTICS_PAGE_VIEWS")} value={data.totals.pageViews} /><Metric label={frontendText(locale, "ADMIN_ANALYTICS_UNIQUE_VISITORS")} value={data.totals.uniqueVisitors} /><Metric label={frontendText(locale, "ADMIN_ANALYTICS_LOGIN_USERS")} value={data.totals.loginUsers} /></div>
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_ANALYTICS_TRENDS")}</CardTitle></CardHeader><CardContent><DailyChart rows={data.daily} locale={locale} /></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-3"><BreakdownCard title={frontendText(locale, "ADMIN_ANALYTICS_PATHS")} rows={data.breakdowns.paths} empty={frontendText(locale, "ADMIN_ANALYTICS_NO_DATA")} /><BreakdownCard title={frontendText(locale, "ADMIN_ANALYTICS_REGIONS")} rows={data.breakdowns.regions} empty={frontendText(locale, "ADMIN_ANALYTICS_NO_DATA")} /><BreakdownCard title={frontendText(locale, "ADMIN_ANALYTICS_COUNTRIES")} rows={data.breakdowns.countries} empty={frontendText(locale, "ADMIN_ANALYTICS_NO_DATA")} /></div>
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_ANALYTICS_VISITORS")}</CardTitle></CardHeader><CardContent className="space-y-3">{localError ? <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_ANALYTICS_UNAVAILABLE")}</p> : null}<VisitorsTable rows={recentVisitors.items} locale={locale} /><DataPagination {...recentVisitors.pagination} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(pageSize) => onPageSizeChange?.(pageSize)} /></CardContent></Card>
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{value}</p></CardContent></Card>;
}

function DailyChart({ rows, locale }: { rows: AdminAnalyticsOverview["daily"]; locale?: LocaleRuntime }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_EMPTY")}</p>;
  const max = Math.max(...rows.map((row) => row.pageViews), 1);
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(2.5rem,1fr))] items-end gap-2" role="img" aria-label={frontendText(locale, "ADMIN_ANALYTICS_TRENDS")}>
    {rows.map((row) => <div key={row.day} className="group flex min-w-0 flex-col items-center gap-2"><span className="text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{row.pageViews}</span><div className="flex h-32 w-full items-end"><div className="w-full rounded-t-sm bg-primary/80 transition-[height]" style={{ height: `${Math.max((row.pageViews / max) * 100, row.pageViews > 0 ? 4 : 0)}%` }} title={`${row.day}: ${row.pageViews}`} /></div><time className="truncate text-[10px] text-muted-foreground" dateTime={row.day}>{row.day.slice(5)}</time></div>)}
  </div>;
}

function BreakdownCard({ title, rows, empty }: { title: string; rows: Array<{ key: string; pageViews: number }>; empty: string }) {
  const max = Math.max(...rows.map((row) => row.pageViews), 1);
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <div className="space-y-3">{rows.map((row) => <div key={row.key} className="space-y-1"><div className="flex items-center justify-between gap-2 text-sm"><span className="truncate" title={row.key}>{row.key}</span><span className="tabular-nums text-muted-foreground">{row.pageViews}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max((row.pageViews / max) * 100, 4)}%` }} /></div></div>)}</div>}</CardContent></Card>;
}

function VisitorsTable({ rows, locale }: { rows: AdminAnalyticsOverview["recentVisitors"]["items"]; locale?: LocaleRuntime }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_EMPTY")}</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="px-2 py-2 font-medium">{frontendText(locale, "ADMIN_ANALYTICS_TIME")}</th><th className="px-2 py-2 font-medium">{frontendText(locale, "ADMIN_ANALYTICS_PAGE")}</th><th className="px-2 py-2 font-medium">{frontendText(locale, "ADMIN_ANALYTICS_MEMBER")}</th><th className="px-2 py-2 font-medium">IP</th><th className="px-2 py-2 font-medium">{frontendText(locale, "ADMIN_ANALYTICS_LOCATION")}</th><th className="px-2 py-2 font-medium">{frontendText(locale, "ADMIN_ANALYTICS_NETWORK")}</th></tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={`${row.occurredAt}-${row.path}-${index}`}><td className="whitespace-nowrap px-2 py-2 text-muted-foreground"><time dateTime={row.occurredAt}>{formatTime(row.occurredAt, locale)}</time></td><td className="max-w-40 truncate px-2 py-2" title={row.path}>{row.path}</td><td className="max-w-48 truncate px-2 py-2" title={row.member?.email || undefined}>{row.member?.email || frontendText(locale, "ADMIN_ANALYTICS_ANONYMOUS")}</td><td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{row.ip || "unknown"}</td><td className="max-w-48 truncate px-2 py-2">{formatLocation(row)}</td><td className="px-2 py-2">{row.colo || "—"}</td></tr>)}</tbody></table></div>;
}

function formatLocation(row: AdminAnalyticsOverview["recentVisitors"]["items"][number]): string {
  return [row.city, row.region, row.country].filter((value): value is string => Boolean(value)).join(", ") || "—";
}

function formatTime(value: string, locale?: LocaleRuntime): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat(locale?.locale === "zh-CN" ? "zh-CN" : "en", { dateStyle: "short", timeStyle: "short" }).format(date); } catch { return value; }
}
