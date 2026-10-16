import { FileText } from "@phosphor-icons/react";
import { Citations } from "../agents/citations";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AgentTurnState } from "../../lib/agent-data";

/** Rendered only for a real grounded answer; a refusal or an unavailable
 * server is a distinct page state and never reaches this panel. */
export function AnswerPanel({ state, locale }: { state: Extract<AgentTurnState, { kind: "ready" }>; locale?: LocaleRuntime }) {
  const confidence = state.confidence === "high" ? frontendText(locale, "AGENT_CONFIDENCE_HIGH") : state.confidence === "medium" ? frontendText(locale, "AGENT_CONFIDENCE_MEDIUM") : frontendText(locale, "AGENT_CONFIDENCE_LOW");
  const conflicts = state.conflicts ?? [];
  const sources = state.citations.map((citation) => {
    const location = [citation.spaceId || frontendText(locale, "COMMON_VALUE_UNAVAILABLE"), citation.collectionId ? ` · ${citation.collectionId}` : "", citation.startLine !== undefined ? ` · ${frontendText(locale, "AGENT_SOURCE_LINES")} ${citation.startLine}–${citation.endLine ?? citation.startLine}` : ""].join("");
    return { id: citation.id, title: citation.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED"), domain: `${frontendText(locale, "AGENT_SOURCE_CONTEXT")} ${location}`, url: citation.href, icon: <FileText size={14} className="size-3.5" /> };
  });
  return <div className="space-y-5"><div className="rounded-lg border bg-card p-5"><div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{confidence}</div><p className="whitespace-pre-wrap text-sm leading-7">{state.answer || frontendText(locale, "AGENT_NO_ANSWER")}</p></div>{conflicts.length > 0 ? <div className="rounded-lg border border-amber-500/40 bg-amber-50/50 p-5"><h3 className="mb-2 text-sm font-semibold">{frontendText(locale, "AGENT_CONFLICTS")}</h3><div className="space-y-2">{conflicts.map((conflict, index) => <p key={`${index}-${conflict.text}`} className="text-sm leading-6">{conflict.text}</p>)}</div></div> : null}<Citations title={frontendText(locale, "AGENT_SOURCES")} defaultOpen citations={sources} /></div>;
}
