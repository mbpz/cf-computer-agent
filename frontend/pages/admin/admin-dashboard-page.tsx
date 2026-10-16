import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { ButtonLink } from "../../components/motion/button/base";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { NumberTicker } from "../../components/motion/number-ticker";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export type DashboardMetric = "pending" | "assets" | "members";
export type DashboardMetricState = { kind: "loading" | "error" | "forbidden" } | { kind: "ready"; total: number };
const cards = [
  { key: "pending", label: "ADMIN_REVIEW_QUEUE", description: "ADMIN_METRIC_PENDING_SCOPE", href: "/admin/submissions" },
  { key: "assets", label: "ADMIN_ASSET_QUEUE", description: "ADMIN_METRIC_ASSET_SCOPE", href: "/admin/assets" },
  { key: "members", label: "ADMIN_MEMBERS", description: "ADMIN_METRIC_MEMBER_SCOPE", href: "/admin/members" },
] as const;

export function AdminDashboardPage({ metrics, locale, links, onRetry, onRefresh }: {
  metrics: Record<DashboardMetric, DashboardMetricState>;
  locale?: LocaleRuntime;
  links: ReadonlyArray<{ href: string; labelKey: string }>;
  onRetry: (key: DashboardMetric) => void;
  onRefresh: () => void;
}) {
  const pending = Object.values(metrics).some((metric) => metric.kind === "loading");
  return <section className="space-y-4" data-admin-dashboard>
    <PageHeader title={frontendText(locale, "ADMIN_TITLE")} description={frontendText(locale, "ADMIN_DESCRIPTION")}
      actions={<Button variant="outline" size="sm" data-dashboard-refresh disabled={pending} onClick={onRefresh}>{frontendText(locale, "ADMIN_METRIC_REFRESH")}</Button>} />
    <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_METRIC_SCOPE")}</p>
    <div className="grid gap-3 md:grid-cols-3">{cards.map(({ key, label, description, href }) => {
      const metric = metrics[key];
      return <Card key={key} data-dashboard-metric={key} aria-busy={metric.kind === "loading"}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{frontendText(locale, label)}</CardTitle>
          <p className="text-xs text-muted-foreground">{frontendText(locale, description)}</p></CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite">
            {metric.kind === "loading" && <p data-page-state="loading" role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_METRIC_LOADING")}</p>}
            {metric.kind === "ready" && <div data-page-state={metric.total === 0 ? "empty" : "ready"}>
              <p data-metric-value className="text-3xl font-semibold tabular-nums"><NumberTicker value={metric.total} startOnView={false} /></p>
              {metric.total === 0 && <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_METRIC_EMPTY")}</p>}
            </div>}
            {metric.kind === "error" && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{frontendText(locale, "ADMIN_METRIC_ERROR")}</p>
              <Button variant="outline" size="sm" onClick={() => onRetry(key)}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}
            {metric.kind === "forbidden" && <p data-page-state="forbidden" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_METRIC_FORBIDDEN")}</p>}
          </div>
          {metric.kind !== "forbidden" && <ButtonLink variant="ghost" size="sm" href={href}>{frontendText(locale, "ADMIN_METRIC_OPEN")}</ButtonLink>}
        </CardContent>
      </Card>;
    })}</div>
    {links.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-base">{frontendText(locale, "ADMIN_QUICK_LINKS")}</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">{links.map(({ href, labelKey }) => <ButtonLink key={href} variant="outline" size="sm" href={href}>{frontendText(locale, labelKey)}</ButtonLink>)}</CardContent>
    </Card>}
  </section>;
}
