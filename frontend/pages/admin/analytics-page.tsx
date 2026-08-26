import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageState } from "../../components/ui/page-state";
import { Skeleton } from "../../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminAnalyticsOverview } from "../../lib/admin-analytics-data";

export function AdminAnalyticsPage({ state, locale, days = 7, onDaysChange, onRefresh }: { state: { kind: "loading" } | { kind: "ready"; data: AdminAnalyticsOverview } | { kind: "error" }; locale?: LocaleRuntime; days?: number; onDaysChange?: (days: number) => void; onRefresh?: () => void }) {
  if (state.kind === "loading") return <div aria-busy="true" className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-56" /></div>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "ADMIN_ANALYTICS_UNAVAILABLE")} />;
  const { data } = state;
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p><h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_ANALYTICS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_DESCRIPTION")}</p></div><div className="flex items-center gap-2"><label htmlFor="admin-analytics-range" className="sr-only">{frontendText(locale, "ADMIN_ANALYTICS_RANGE")}</label><select id="admin-analytics-range" className="h-9 rounded-md border bg-background px-3 text-sm" value={days} onChange={(event) => onDaysChange?.(Number(event.target.value))}><option value={7}>{frontendText(locale, "ADMIN_ANALYTICS_RANGE_7")}</option><option value={14}>{frontendText(locale, "ADMIN_ANALYTICS_RANGE_14")}</option><option value={30}>{frontendText(locale, "ADMIN_ANALYTICS_RANGE_30")}</option></select><Button type="button" variant="outline" size="sm" onClick={onRefresh}>{frontendText(locale, "ADMIN_ANALYTICS_REFRESH")}</Button></div></div>
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label={frontendText(locale, "ADMIN_ANALYTICS_PAGE_VIEWS")} value={data.totals.pageViews} />
      <Metric label={frontendText(locale, "ADMIN_ANALYTICS_UNIQUE_VISITORS")} value={data.totals.uniqueVisitors} />
      <Metric label={frontendText(locale, "ADMIN_ANALYTICS_LOGIN_USERS")} value={data.totals.loginUsers} />
    </div>
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_ANALYTICS_DAILY_TITLE")}</CardTitle></CardHeader><CardContent><div className="divide-y">{data.daily.length ? data.daily.map((row) => <div key={row.day} className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_repeat(3,auto)]"><time className="text-muted-foreground">{row.day}</time><span>{frontendText(locale, "ADMIN_ANALYTICS_PAGE_VIEWS")}：{row.pageViews}</span><span>{frontendText(locale, "ADMIN_ANALYTICS_UNIQUE_VISITORS")}：{row.uniqueVisitors}</span><span>{frontendText(locale, "ADMIN_ANALYTICS_LOGIN_USERS")}：{row.loginUsers}</span></div>) : <p className="py-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ANALYTICS_EMPTY")}</p>}</div></CardContent></Card>
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{value}</p></CardContent></Card>;
}
