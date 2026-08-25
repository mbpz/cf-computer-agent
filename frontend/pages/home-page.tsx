import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export type HomeState = { kind: "loading" } | { kind: "ready"; total: number; pending: number; published: number } | { kind: "error"; message: string };

export function HomePage({ state, locale }: { state: HomeState; locale?: LocaleRuntime }) {
  if (state.kind === "loading") return <div aria-busy="true" className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (state.kind === "error") return <Card><CardContent className="p-6 text-sm text-destructive">{state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}</CardContent></Card>;
  return <section className="space-y-8"><div><p className="text-sm font-medium text-primary">MEMORY GARDEN</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{frontendText(locale, "HOME_TITLE")}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{frontendText(locale, "HOME_DESCRIPTION")}</p></div><div className="grid gap-4 md:grid-cols-3">{[[frontendText(locale, "HOME_TOTAL_SUBMISSIONS"), state.total], [frontendText(locale, "HOME_PENDING_REVIEW"), state.pending], [frontendText(locale, "HOME_PUBLISHED_KNOWLEDGE"), state.published]].map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{value}</p></CardContent></Card>)}</div></section>;
}
