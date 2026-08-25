import { AnswerPanel, type AgentCitation } from "../components/agent/answer-panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageState } from "../components/ui/page-state";
import type { AgentScope } from "../lib/agent-data";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function AgentPage({ scope, state, locale, question = "", onQuestionChange, onSubmit, onRetry }: { scope: string | AgentScope; state: { kind: "loading" } | { kind: "ready"; answer: string; confidence: "high" | "medium" | "low"; citations: readonly AgentCitation[] } | { kind: "error"; message: string }; locale?: LocaleRuntime; question?: string; onQuestionChange?: (question: string) => void; onSubmit?: () => void; onRetry?: () => void }) {
  const scopeLabel = typeof scope === "string" ? scope || "all" : scope.kind;
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "AGENT_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "AGENT_SCOPE")}: <code>{scopeLabel}</code></p></div>
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <Label htmlFor="agent-question">{frontendText(locale, "AGENT_QUESTION_LABEL")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input id="agent-question" name="question" value={question} onChange={(event) => onQuestionChange?.(event.currentTarget.value)} placeholder={frontendText(locale, "AGENT_QUESTION_PLACEHOLDER")} autoComplete="off" /><Button type="submit" disabled={!onSubmit}>{frontendText(locale, "AGENT_SUBMIT")}</Button></div>
    </form>
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "AGENT_PREPARING")} /> : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_ANSWER_UNAVAILABLE")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "AGENT_RETRY")}</Button></PageState> : <AnswerPanel locale={locale} state={state} />}
  </section>;
}
