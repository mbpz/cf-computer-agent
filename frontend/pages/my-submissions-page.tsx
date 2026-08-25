import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function MySubmissionsPage({ state, locale }: { state: { kind: "loading" } | { kind: "ready"; items: readonly { id: string; title?: string; status?: string }[]; nextCursor: string | null } | { kind: "error"; message: string }; locale?: LocaleRuntime }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")} />;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "SUBMISSIONS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "SUBMISSIONS_DESCRIPTION")}</p></div>{state.items.length ? <div className="space-y-3">{state.items.map((item) => { const status = item.status === "needs_revision" ? frontendText(locale, "SUBMISSIONS_NEEDS_REVISION") : item.status || frontendText(locale, "SUBMISSIONS_STATUS_UNAVAILABLE"); return <Card key={item.id}><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{item.title?.trim() || frontendText(locale, "SUBMISSIONS_UNTITLED")}</p><p className="mt-1 text-xs text-muted-foreground">{item.id}</p></div><div className="flex items-center gap-3"><Badge variant={item.status === "needs_revision" ? "warning" : "outline"}>{status}</Badge>{item.status === "needs_revision" && <button type="button" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "SUBMISSIONS_RESUBMIT")}</button>}</div></CardContent></Card>; })}</div> : <PageState kind="empty" title={frontendText(locale, "SUBMISSIONS_EMPTY")} />}</section>;
}
