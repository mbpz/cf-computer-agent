import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export function MySubmissionsPage({ state }: { state: { kind: "loading" } | { kind: "ready"; items: readonly { id: string; title?: string; status?: string }[]; nextCursor: string | null } | { kind: "error"; message: string } }) {
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind === "error") return <Card><CardContent className="p-6 text-sm text-destructive">{state.message || "Unable to load submissions."}</CardContent></Card>;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">My submissions</h1><p className="mt-1 text-sm text-muted-foreground">Track review and resubmission status.</p></div>{state.items.length ? <div className="space-y-3">{state.items.map((item) => { const status = item.status === "needs_revision" ? "Needs revision" : item.status || "Status unavailable"; return <Card key={item.id}><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{item.title?.trim() || "Untitled submission"}</p><p className="mt-1 text-xs text-muted-foreground">{item.id}</p></div><div className="flex items-center gap-3"><Badge variant={item.status === "needs_revision" ? "warning" : "outline"}>{status}</Badge>{item.status === "needs_revision" && <button type="button" className="text-sm font-medium text-primary hover:underline">Resubmit</button>}</div></CardContent></Card>; })}</div> : <p className="text-sm text-muted-foreground">No submissions yet.</p>}</section>;
}
