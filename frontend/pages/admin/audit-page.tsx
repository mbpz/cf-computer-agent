import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";

export function AuditPage({ state, onLoadMore }: { state: { kind: "loading" } | { kind: "ready"; events: readonly { id: string; action?: string; actor?: string; createdAt?: string }[]; nextCursor: string | null } | { kind: "error"; message: string }; onLoadMore?: () => void }) {
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind === "error") return <p className="text-sm text-destructive">{state.message || "Audit unavailable."}</p>;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">Audit log</h1><p className="mt-1 text-sm text-muted-foreground">Immutable governance events for this workspace.</p></div><div className="space-y-3">{state.events.map((event) => <Card key={event.id}><CardContent className="grid gap-1 p-4 text-sm md:grid-cols-[1fr_1fr_auto]"><span className="font-medium">{event.action || "Action unavailable"}</span><span className="text-muted-foreground">{event.actor || "Actor unavailable"}</span><time className="text-muted-foreground">{event.createdAt || "Date unavailable"}</time></CardContent></Card>)}</div>{state.nextCursor && <Button variant="outline" onClick={onLoadMore}>Load more</Button>}</section>;
}
