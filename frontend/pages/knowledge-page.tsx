import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { KnowledgeCard, type KnowledgeCardItem } from "../components/knowledge/knowledge-card";

export type KnowledgeState = { kind: "loading" } | { kind: "ready"; items: readonly KnowledgeCardItem[]; nextCursor: string | null } | { kind: "error"; message: string };

export function KnowledgePage({ state, onLoadMore }: { state: KnowledgeState; onLoadMore?: () => void }) {
  if (state.kind === "loading") return <div aria-busy="true" className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  if (state.kind === "error") return <Card><CardContent className="p-6 text-sm text-destructive">{state.message || "Unable to load knowledge."}</CardContent></Card>;
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">Published knowledge</h1><p className="mt-1 text-sm text-muted-foreground">The latest visible revision for each trusted knowledge entry.</p></div>{state.items.length ? <div className="grid gap-4 md:grid-cols-2">{state.items.map((item) => <KnowledgeCard key={item.id} item={item} />)}</div> : <Card><CardContent className="p-6 text-sm text-muted-foreground">No published knowledge.</CardContent></Card>}{state.nextCursor && <Button variant="outline" onClick={onLoadMore}>Load more</Button>}</section>;
}
