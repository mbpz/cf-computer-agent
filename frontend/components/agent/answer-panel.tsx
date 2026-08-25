import { Alert, AlertDescription } from "../ui/alert";

export interface AgentCitation { id: string; title?: string; href: string; }

export function AnswerPanel({ state }: { state: { kind: "ready"; answer: string; confidence: "high" | "medium" | "low"; citations: readonly AgentCitation[] } | { kind: "error"; message: string } }) {
  if (state.kind === "error") return <Alert variant="destructive"><AlertDescription>{state.message || "The answer is unavailable."}</AlertDescription></Alert>;
  const confidence = state.confidence === "high" ? "High confidence" : state.confidence === "medium" ? "Medium confidence" : "Low confidence";
  return <div className="space-y-5"><div className="rounded-lg border bg-card p-5"><div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{confidence}</div><p className="whitespace-pre-wrap text-sm leading-7">{state.answer || "No answer returned."}</p></div><div className="space-y-2"><h3 className="text-sm font-semibold">Sources</h3>{state.citations.map((citation) => <a key={citation.id} href={citation.href} className="block rounded-md border p-3 text-sm hover:bg-accent">{citation.title?.trim() || "Untitled source"}</a>)}</div></div>;
}
