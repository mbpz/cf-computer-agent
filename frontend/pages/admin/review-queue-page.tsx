import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";

export function ReviewQueuePage({ state, onReview }: { state: { kind: "loading" } | { kind: "ready"; items: readonly { id: string; title?: string; submitter?: string; status?: string }[]; nextCursor: string | null } | { kind: "error"; message: string }; onReview?: (id: string, action: "publish" | "reject" | "request_changes") => void }) {
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind === "error") return <p className="text-sm text-destructive">{state.message || "Review queue unavailable."}</p>;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">Review queue</h1><p className="mt-1 text-sm text-muted-foreground">Review submissions before publication.</p></div>{state.items.map((item) => <Card key={item.id}><CardContent className="space-y-4 p-4"><div className="flex items-start justify-between gap-4"><div><h2 className="font-medium"><a href={`/admin/submissions/${encodeURIComponent(item.id)}`} className="hover:underline">{item.title?.trim() || "Untitled submission"}</a></h2><p className="mt-1 text-xs text-muted-foreground">{item.submitter || "Submitter unavailable"}</p></div><Badge variant="outline">{item.status || "Status unavailable"}</Badge></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => onReview?.(item.id, "publish")}>Publish</Button><Button size="sm" variant="outline" onClick={() => onReview?.(item.id, "request_changes")}>Request changes</Button><Button size="sm" variant="destructive" onClick={() => onReview?.(item.id, "reject")}>Reject</Button></div></CardContent></Card>)}{state.nextCursor && <span className="text-xs text-muted-foreground">Next cursor: {state.nextCursor}</span>}</section>;
}
