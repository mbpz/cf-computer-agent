import { Alert, AlertDescription } from "../ui/alert";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AgentCitation } from "../../lib/agent-data";

export type { AgentCitation } from "../../lib/agent-data";

export function AnswerPanel({ state, locale }: { state: { kind: "ready"; answer: string; confidence: "high" | "medium" | "low"; citations: readonly AgentCitation[] } | { kind: "error"; message: string }; locale?: LocaleRuntime }) {
  if (state.kind === "error") return <Alert variant="destructive"><AlertDescription>{state.message || frontendText(locale, "COMMON_ANSWER_UNAVAILABLE")}</AlertDescription></Alert>;
  const confidence = state.confidence === "high" ? frontendText(locale, "AGENT_CONFIDENCE_HIGH") : state.confidence === "medium" ? frontendText(locale, "AGENT_CONFIDENCE_MEDIUM") : frontendText(locale, "AGENT_CONFIDENCE_LOW");
  return <div className="space-y-5"><div className="rounded-lg border bg-card p-5"><div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{confidence}</div><p className="whitespace-pre-wrap text-sm leading-7">{state.answer || frontendText(locale, "AGENT_NO_ANSWER")}</p></div><div className="space-y-2"><h3 className="text-sm font-semibold">{frontendText(locale, "AGENT_SOURCES")}</h3>{state.citations.map((citation) => <a key={citation.id} href={citation.href} className="block rounded-md border p-3 text-sm hover:bg-accent"><span className="font-medium">{citation.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</span><span className="mt-1 block text-xs text-muted-foreground">{frontendText(locale, "AGENT_SOURCE_CONTEXT")} {citation.spaceId || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}{citation.collectionId ? ` · ${citation.collectionId}` : ""}{citation.startLine !== undefined ? ` · ${frontendText(locale, "AGENT_SOURCE_LINES")} ${citation.startLine}–${citation.endLine ?? citation.startLine}` : ""}</span></a>)}</div></div>;
}
