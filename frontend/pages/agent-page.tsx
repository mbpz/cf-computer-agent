import { AnswerPanel, type AgentCitation } from "../components/agent/answer-panel";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function AgentPage({ scope, state, locale }: { scope: string; state: { kind: "loading" } | { kind: "ready"; answer: string; confidence: "high" | "medium" | "low"; citations: readonly AgentCitation[] } | { kind: "error"; message: string }; locale?: LocaleRuntime }) {
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "AGENT_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "AGENT_SCOPE")}: <code>{scope || "all"}</code></p></div>{state.kind === "loading" ? <Card><CardHeader><CardTitle>{frontendText(locale, "AGENT_PREPARING")}</CardTitle></CardHeader><CardContent><Skeleton className="h-24" /></CardContent></Card> : <AnswerPanel locale={locale} state={state} />}</section>;
}
