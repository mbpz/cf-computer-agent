import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function AuditPage({ state, onLoadMore, locale }: { state: { kind: "loading" } | { kind: "ready"; events: readonly { id: string; action?: string; actor?: string; createdAt?: string }[]; nextCursor: string | null } | { kind: "error"; message: string }; onLoadMore?: () => void; locale?: LocaleRuntime }) {
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE")} />;
  if (!state.events.length) return <PageState kind="empty" title={frontendText(locale, "ADMIN_AUDIT_EMPTY")} description={frontendText(locale, "ADMIN_AUDIT_DESCRIPTION")} />;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_AUDIT_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_AUDIT_DESCRIPTION")}</p></div><div className="space-y-3">{state.events.map((event) => <Card key={event.id}><CardContent className="grid gap-1 p-4 text-sm md:grid-cols-[1fr_1fr_auto]"><span className="font-medium">{event.action || frontendText(locale, "ADMIN_AUDIT_ACTION_UNAVAILABLE")}</span><span className="text-muted-foreground">{event.actor || frontendText(locale, "ADMIN_AUDIT_ACTOR_UNAVAILABLE")}</span><time className="text-muted-foreground">{event.createdAt || frontendText(locale, "ADMIN_AUDIT_DATE_UNAVAILABLE")}</time></CardContent></Card>)}</div>{state.nextCursor && <Button variant="outline" onClick={onLoadMore}>{frontendText(locale, "ADMIN_LOAD_MORE")}</Button>}</section>;
}
