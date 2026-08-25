import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export type HomeState = { kind: "loading" } | { kind: "ready"; total: number; pending: number; published: number } | { kind: "error"; message: string };

export function HomePage({ state }: { state: HomeState }) {
  if (state.kind === "loading") return <div aria-busy="true" className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (state.kind === "error") return <Card><CardContent className="p-6 text-sm text-destructive">{state.message || "Unable to load the page."}</CardContent></Card>;
  return <section className="space-y-8"><div><p className="text-sm font-medium text-primary">MEMORY GARDEN</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Knowledge workspace</h1><p className="mt-2 max-w-2xl text-muted-foreground">Submit, review, find, and cite the knowledge your team trusts.</p></div><div className="grid gap-4 md:grid-cols-3">{[["Total submissions", state.total], ["Pending review", state.pending], ["Published knowledge", state.published]].map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{value}</p></CardContent></Card>)}</div></section>;
}
