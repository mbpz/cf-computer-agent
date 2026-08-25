import { AnswerPanel, type AgentCitation } from "../components/agent/answer-panel";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function AgentPage({ scope, state, locale }: { scope: string; state: { kind: "loading" } | { kind: "ready"; answer: string; confidence: "high" | "medium" | "low"; citations: readonly AgentCitation[] } | { kind: "error"; message: string }; locale?: LocaleRuntime }) {
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "AGENT_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "AGENT_SCOPE")}: <code>{scope || "all"}</code></p></div>{state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "AGENT_PREPARING")} /> : <AnswerPanel locale={locale} state={state} />}</section>;
}
