import { AnswerPanel, type AgentCitation } from "../components/agent/answer-panel";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export function AgentPage({ scope, state }: { scope: string; state: { kind: "loading" } | { kind: "ready"; answer: string; confidence: "high" | "medium" | "low"; citations: readonly AgentCitation[] } | { kind: "error"; message: string } }) {
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">Ask the agent</h1><p className="mt-1 text-sm text-muted-foreground">Scope: <code>{scope || "all"}</code></p></div>{state.kind === "loading" ? <Card><CardHeader><CardTitle>Preparing answer</CardTitle></CardHeader><CardContent><Skeleton className="h-24" /></CardContent></Card> : <AnswerPanel state={state} />}</section>;
}
