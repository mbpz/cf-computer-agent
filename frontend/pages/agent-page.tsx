import { AgentFeedback } from "../components/agent/agent-feedback";
import { useState } from "react";
import type { useCreateDraft } from "../lib/use-create-draft";
import { AnswerPanel, type AgentCitation } from "../components/agent/answer-panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageState } from "../components/ui/page-state";
import { agentLocationFromSearch, type AgentAnswer, type AgentScope } from "../lib/agent-data";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function agentSourceFields(scope: AgentScope): {kind: AgentScope["kind"]; ids: string} {
  return {kind: scope.kind, ids: scope.kind === "items" ? scope.knowledgeItemIds.join(", ") : scope.kind === "space" ? scope.spaceId : scope.kind === "collection" ? scope.collectionId : ""};
}
type SourceDraft = ReturnType<typeof useCreateDraft<ReturnType<typeof agentSourceFields>>>;

export function AgentPage({ scope, state, locale, question = "", onQuestionChange, onSubmit, onCancel, onRetry, onStartScope, isWriteBlocked, sourceDraft }: { scope: string | AgentScope; state: { kind: "loading" } | { kind: "cancelled" } | ({ kind: "ready"; citations: readonly AgentCitation[] } & Omit<AgentAnswer, "citations">) | { kind: "error"; message: string }; locale?: LocaleRuntime; question?: string; onQuestionChange?: (question: string) => void; onSubmit?: () => void; onCancel?: () => void; onRetry?: () => void; sourceDraft?: SourceDraft; isWriteBlocked?: () => boolean; onStartScope?: (scope: AgentScope, onCommit: () => void, onSettled: () => void) => void }) {
  const scopeLabel = typeof scope === "string" ? scope || "all" : scope.kind;
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "AGENT_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "AGENT_SCOPE")}: <code>{scopeLabel}</code></p></div>
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <Label htmlFor="agent-question">{frontendText(locale, "AGENT_QUESTION_LABEL")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input id="agent-question" name="question" disabled={state.kind === "loading"} value={question} onChange={(event) => onQuestionChange?.(event.currentTarget.value)} placeholder={frontendText(locale, "AGENT_QUESTION_PLACEHOLDER")} autoComplete="off" /><Button type="submit" disabled={!onSubmit || state.kind === "loading"}>{frontendText(locale, "AGENT_SUBMIT")}</Button></div>
    </form>
    {onStartScope && sourceDraft && <AgentSourceControls key={JSON.stringify(scope)} draft={sourceDraft} locale={locale} disabled={state.kind === "loading"} isWriteBlocked={isWriteBlocked} onStartScope={onStartScope} />}
    {state.kind === "loading" ? <div><PageState kind="loading" title={frontendText(locale, "AGENT_PREPARING")} /><Button className="mt-4" variant="outline" onClick={onCancel}>{frontendText(locale, "AGENT_STOP")}</Button></div> : state.kind === "cancelled" ? <PageState kind="degraded" title={frontendText(locale, "AGENT_STOPPED_WAITING")} description={frontendText(locale, "AGENT_STOPPED_DETAIL")} /> : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_ANSWER_UNAVAILABLE")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "AGENT_RETRY")}</Button></PageState> : <><AnswerPanel locale={locale} state={state} />{state.conversationId && <AgentFeedback key={state.conversationId} locale={locale} conversationId={state.conversationId} citationIds={state.citations.map((citation) => citation.id)} />}</>}
  </section>;
}

function AgentSourceControls({ draft, locale, disabled, onStartScope, isWriteBlocked }: { draft: SourceDraft; locale?: LocaleRuntime; disabled: boolean; isWriteBlocked?: () => boolean; onStartScope: (scope: AgentScope, onCommit: () => void, onSettled: () => void) => void }) {
  const {kind, ids} = draft.fields;
  const [invalid, setInvalid] = useState(false);
  const apply = () => {
    if (draft.isConfirming() || disabled || isWriteBlocked?.()) return;
    const {kind, ids} = draft.current.current;
    const params = new URLSearchParams({ scope: kind });
    const key = kind === "space" ? "spaceId" : kind === "collection" ? "collectionId" : "knowledgeItemId";
    if (kind !== "all") for (const id of ids.split(",").map((value) => value.trim())) params.append(key, id);
    try {
      const next = agentLocationFromSearch(`?${params}`).scope;
      if (!next) throw new Error("Invalid scope");
      setInvalid(false); draft.applyNavigation((commit, settled) => onStartScope(next, commit, settled));
    } catch { setInvalid(true); }
  };
  return <fieldset disabled={disabled || draft.applicationPending} className="space-y-2 rounded-md border p-4">
    <legend>{frontendText(locale, "AGENT_SCOPE")}</legend>
    <Label htmlFor="agent-scope-kind">{frontendText(locale, "AGENT_SCOPE_KIND")}</Label>
    <select id="agent-scope-kind" className="block rounded-md border bg-background p-2" value={kind} onChange={(event) => { draft.edit("kind", event.currentTarget.value as AgentScope["kind"]); draft.edit("ids", ""); setInvalid(false); }}>
      <option value="all">{frontendText(locale, "AGENT_SCOPE_ALL")}</option><option value="space">{frontendText(locale, "AGENT_SCOPE_SPACE")}</option><option value="collection">{frontendText(locale, "AGENT_SCOPE_COLLECTION")}</option><option value="items">{frontendText(locale, "AGENT_SCOPE_ITEMS")}</option>
    </select>
    {kind !== "all" && <><Label htmlFor="agent-scope-ids">{frontendText(locale, "AGENT_SCOPE_IDS")}</Label><Input id="agent-scope-ids" value={ids} onChange={(event) => draft.edit("ids", event.currentTarget.value)} aria-invalid={invalid} /></>}
    <p className="text-sm text-muted-foreground">{frontendText(locale, "AGENT_SCOPE_DETAIL")}</p>
    {invalid && <p role="alert">{frontendText(locale, "AGENT_SCOPE_INVALID")}</p>}
    <Button type="button" variant="outline" disabled={disabled} onClick={apply}>{frontendText(locale, "AGENT_SCOPE_APPLY")}</Button>
  </fieldset>;
}
