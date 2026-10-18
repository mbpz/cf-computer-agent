import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { StatusBar, StatusBarLegend, StatusBarPlot, StatusBarTooltip, type StatusBarDatum, type StatusBarStatus } from "../../components/charts/status-bar";
import { DonutChart, DonutChartCenter, DonutChartLegend, DonutChartPlot } from "../../components/charts/donut-chart";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminAnalyticsOverview } from "../../lib/admin-analytics-data";
import { NumberTicker } from "../../components/motion/number-ticker";
import { DataTable } from "../../components/data-table";
import type { SupportedPageSize } from "../../lib/numbered-page";

export type AdminAnalyticsState = { kind: "loading" } | { kind: "ready"; data: AdminAnalyticsOverview } | { kind: "error" } | { kind: "forbidden" };

export function AdminAnalyticsPage({ state, locale, days = 7, pending = false, localError = false, onDaysChange, onPageChange, onPageSizeChange, onLoadMore, onRefresh }: { state: AdminAnalyticsState; locale: LocaleRuntime; days?: number; pending?: boolean; localError?: boolean; onDaysChange?: (days: number) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void; onLoadMore?: () => void; onRefresh?: () => void }) {
  const retry = <Button data-analytics-retry type="button" variant="outline" size="sm" disabled={pending} onClick={onRefresh}>{frontendText(locale, "COMMON_RETRY")}</Button>;
  // The page shell is constant (research §4.3): the header and its range control render
  // for every state; only the panel below switches between loading, failure and the report.
  return <section className="space-y-4" aria-busy={pending || state.kind === "loading" || undefined}>
    <PageHeader title={frontendText(locale, "ADMIN_ANALYTICS_TITLE")} description={frontendText(locale, "ADMIN_ANALYTICS_DESCRIPTION")}
      actions={<><label htmlFor="admin-analytics-range" className="sr-only">{frontendText(locale, "ADMIN_ANALYTICS_RANGE")}</label><Select className="w-auto" value={String(days)} onValueChange={(value) => onDaysChange?.(Number(value))}><SelectTrigger id="admin-analytics-range" className="w-auto min-w-44"><SelectValue /></SelectTrigger><SelectContent>{![7, 14, 30].includes(days) && <SelectItem value={String(days)}>{frontendText(locale, "ADMIN_ANALYTICS_RANGE_CUSTOM").replace("{days}", String(days))}</SelectItem>}<SelectItem value="7">{frontendText(locale, "ADMIN_ANALYTICS_RANGE_7")}</SelectItem><SelectItem value="14">{frontendText(locale, "ADMIN_ANALYTICS_RANGE_14")}</SelectItem><SelectItem value="30">{frontendText(locale, "ADMIN_ANALYTICS_RANGE_30")}</SelectItem></SelectContent></Select><Button data-analytics-refresh type="button" variant="outline" size="sm" disabled={pending} onClick={onRefresh}>{frontendText(locale, "ADMIN_ANALYTICS_REFRESH")}</Button></>} />
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind === "error" || state.kind === "forbidden" ? <PageState kind={state.kind} title={frontendText(locale, state.kind === "forbidden" ? "ADMIN_ANALYTICS_FORBIDDEN" : "ADMIN_ANALYTICS_UNAVAILABLE")}>{retry}</PageState>
      : <>
    <p data-analytics-range className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_RANGE_UTC").replace("{from}", state.data.range.from).replace("{to}", state.data.range.to)}</p>
    {(pending || localError) && <p data-analytics-stale role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_STALE")}</p>}
    <div className="grid gap-4 md:grid-cols-3"><Metric label={frontendText(locale, "ADMIN_ANALYTICS_PAGE_VIEWS")} value={state.data.totals.pageViews} /><Metric label={frontendText(locale, "ADMIN_ANALYTICS_UNIQUE_VISITORS")} value={state.data.totals.uniqueVisitors} /><Metric label={frontendText(locale, "ADMIN_ANALYTICS_LOGIN_USERS")} value={state.data.totals.loginUsers} /></div>
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_ANALYTICS_DAILY_TITLE")}</CardTitle></CardHeader><CardContent><DailyStatus rows={state.data.daily} locale={locale} /></CardContent></Card>
    <BreakdownPanel breakdowns={state.data.breakdowns} locale={locale} />
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_ANALYTICS_VISITORS")}</CardTitle></CardHeader><CardContent className="space-y-3">{localError ? <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{frontendText(locale, "ADMIN_ANALYTICS_UNAVAILABLE")}</p>{retry}</div> : null}<DataTable
      locale={locale}
      rows={state.data.recentVisitors.items}
      rowId={(row, index) => `${row.occurredAt}-${row.path}-${index}`}
      ariaLabel={frontendText(locale, "ADMIN_ANALYTICS_VISITORS")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_ANALYTICS_EMPTY")} />}
      loading={pending}
      pagination={state.data.recentVisitors.pagination}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      hasMore={!localError && state.data.recentVisitors.pagination.page < state.data.recentVisitors.pagination.totalPages}
      onLoadMore={onLoadMore}
      rowHeight={48}
      columns={[
        { key: "time", header: frontendText(locale, "ADMIN_ANALYTICS_TIME"), width: "180px", cell: (row) => <time dateTime={row.occurredAt}>{formatTime(row.occurredAt, locale)}</time> },
        { key: "path", header: frontendText(locale, "ADMIN_ANALYTICS_PAGE"), width: "28%", cellClassName: "whitespace-normal", cell: (row) => <span className="line-clamp-1" title={row.path}>{row.path}</span> },
        { key: "member", header: frontendText(locale, "ADMIN_ANALYTICS_MEMBER"), width: "22%", cellClassName: "whitespace-normal", cell: (row) => <span className="line-clamp-1" title={row.member?.email || undefined}>{row.member?.email || frontendText(locale, "ADMIN_ANALYTICS_ANONYMOUS")}</span> },
        { key: "ip", header: frontendText(locale, "ADMIN_ANALYTICS_IP"), width: "150px", cellClassName: "whitespace-normal", cell: (row) => <span className="font-mono text-xs">{row.ip || frontendText(locale, "ADMIN_ANALYTICS_IP_UNKNOWN")}</span> },
        { key: "location", header: frontendText(locale, "ADMIN_ANALYTICS_LOCATION"), width: "16%", cellClassName: "whitespace-normal", cell: (row) => <span className="line-clamp-1" title={formatLocation(row)}>{formatLocation(row)}</span> },
        { key: "network", header: frontendText(locale, "ADMIN_ANALYTICS_NETWORK"), width: "110px", cell: (row) => row.colo || "—" },
      ]}
    /></CardContent></Card>
      </>}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  // startOnView={false}: these cards are always above the fold, so arming on
  // mount rolls the digits without depending on an intersection observer.
  return <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums"><NumberTicker value={value} startOnView={false} /></p></CardContent></Card>;
}

const BREAKDOWN_TABS = [
  { id: "paths", labelKey: "ADMIN_ANALYTICS_PATHS" },
  { id: "regions", labelKey: "ADMIN_ANALYTICS_REGIONS" },
  { id: "countries", labelKey: "ADMIN_ANALYTICS_COUNTRIES" },
] as const;
type BreakdownId = (typeof BREAKDOWN_TABS)[number]["id"];
const SEGMENT_COLORS = ["#2563eb", "#0ea5e9", "#059669", "#d97706", "#e11d48", "#7c3aed"];

/** Volume tiers keep one hue; the exact counts live in the tooltip and the screen-reader table. */
function volumeStatus(pageViews: number, max: number): string {
  if (pageViews <= 0) return "none";
  if (pageViews >= max * 0.66) return "high";
  if (pageViews >= max * 0.33) return "medium";
  return "low";
}

function DailyStatus({ rows, locale }: { rows: AdminAnalyticsOverview["daily"]; locale: LocaleRuntime }) {
  const statuses = useMemo<StatusBarStatus[]>(() => [
    { id: "none", label: frontendText(locale, "ADMIN_ANALYTICS_VOLUME_NONE"), color: "color-mix(in oklch, var(--muted-foreground) 28%, transparent)" },
    { id: "low", label: frontendText(locale, "ADMIN_ANALYTICS_VOLUME_LOW"), color: "color-mix(in oklch, var(--primary) 40%, transparent)" },
    { id: "medium", label: frontendText(locale, "ADMIN_ANALYTICS_VOLUME_MEDIUM"), color: "color-mix(in oklch, var(--primary) 65%, transparent)" },
    { id: "high", label: frontendText(locale, "ADMIN_ANALYTICS_VOLUME_HIGH"), color: "var(--primary)" },
  ], [locale]);
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_EMPTY")}</p>;
  const max = Math.max(...rows.map((row) => row.pageViews), 1);
  const data: StatusBarDatum[] = rows.map((row) => ({
    id: row.day,
    label: row.day.slice(5),
    status: volumeStatus(row.pageViews, max),
    description: `${row.pageViews} ${frontendText(locale, "ADMIN_ANALYTICS_PAGE_VIEWS")} · ${row.uniqueVisitors} ${frontendText(locale, "ADMIN_ANALYTICS_UNIQUE_VISITORS")} · ${row.loginUsers} ${frontendText(locale, "ADMIN_ANALYTICS_LOGIN_USERS")}`,
  }));
  return <StatusBar data={data} statuses={statuses} label={frontendText(locale, "ADMIN_ANALYTICS_TRENDS")}>
    <StatusBarPlot barClassName="h-10" />
    <StatusBarTooltip />
    <StatusBarLegend />
  </StatusBar>;
}

function BreakdownPanel({ breakdowns, locale }: { breakdowns: AdminAnalyticsOverview["breakdowns"]; locale: LocaleRuntime }) {
  const [dimension, setDimension] = useState<BreakdownId>("paths");
  const rows = breakdowns[dimension];
  const activeTab = BREAKDOWN_TABS.find((tab) => tab.id === dimension) ?? BREAKDOWN_TABS[0];
  const segments = rows.map((row, index) => ({ id: row.key, name: row.key, value: row.pageViews, color: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }));
  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
      <CardTitle>{frontendText(locale, "ADMIN_ANALYTICS_BREAKDOWN")}</CardTitle>
      <Tabs value={dimension} onValueChange={(value) => setDimension(value as BreakdownId)} variant="segment">
        <TabsList>{BREAKDOWN_TABS.map((tab) => <TabsTrigger key={tab.id} value={tab.id}>{frontendText(locale, tab.labelKey)}</TabsTrigger>)}</TabsList>
      </Tabs>
    </CardHeader>
    <CardContent>
      {segments.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_NO_DATA")}</p> : <DonutChart segments={segments} label={frontendText(locale, activeTab.labelKey)} formatValue={(value) => value.toLocaleString(locale.locale === "zh-CN" ? "zh-CN" : "en")}>
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,16rem)_1fr]">
          <DonutChartPlot><DonutChartCenter totalLabel={frontendText(locale, "ADMIN_ANALYTICS_PAGE_VIEWS")} /></DonutChartPlot>
          <DonutChartLegend />
        </div>
      </DonutChart>}
    </CardContent>
  </Card>;
}

function formatLocation(row: AdminAnalyticsOverview["recentVisitors"]["items"][number]): string {
  return [row.city, row.region, row.country].filter((value): value is string => Boolean(value)).join(", ") || "—";
}

function formatTime(value: string, locale: LocaleRuntime): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat(locale?.locale === "zh-CN" ? "zh-CN" : "en", { dateStyle: "short", timeStyle: "short" }).format(date); } catch { return value; }
}
