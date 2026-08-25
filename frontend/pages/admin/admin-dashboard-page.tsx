import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function AdminDashboardPage({ metrics, locale }: { metrics: { pending: number; assets: number; members: number }; locale?: LocaleRuntime }) {
  return <section className="space-y-6"><div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p><h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_DESCRIPTION")}</p></div><div className="grid gap-4 md:grid-cols-3">{[[frontendText(locale, "ADMIN_REVIEW_QUEUE"), metrics.pending], [frontendText(locale, "ADMIN_ASSET_QUEUE"), metrics.assets], [frontendText(locale, "ADMIN_MEMBERS"), metrics.members]].map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{value}</p></CardContent></Card>)}</div></section>;
}
