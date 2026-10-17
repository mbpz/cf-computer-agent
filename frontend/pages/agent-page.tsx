import { AgentFeedback, type AgentFeedbackAdmission } from "../components/agent/agent-feedback";
import { useEffect, useState } from "react";
import type { useCreateDraft } from "../lib/use-create-draft";
import { AnswerPanel } from "../components/agent/answer-panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageHeader } from "../components/ui/page-header";
import { PageState } from "../components/ui/page-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/motion/select";
import { SummaryRow, type SummaryRowItem } from "../components/ui/summary-row";
import { agentLocationFromSearch, type AgentScope, type AgentTurnState, type ChatStage } from "../lib/agent-data";
import { AgentActivity } from "../components/agents/agent-activity";
import { ReasoningText } from "../components/agents/loading-states/reasoning-text";
import { StreamingResponse } from "../components/agents/streaming-response";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function agentSourceFields(scope: AgentScope): {kind: AgentScope["kind"]; ids: string} {
  return {kind: scope.kind, ids: scope.kind === "items" ? scope.knowledgeItemIds.join(", ") : scope.kind === "space" ? scope.spaceId : scope.kind === "collection" ? scope.collectionId : ""};
}
type SourceDraft = ReturnType<typeof useCreateDraft<ReturnType<typeof agentSourceFields>>>;

const AGENT_STAGE_KEYS: Record<ChatStage, string> = { retrieving: "AGENT_STAGE_RETRIEVING", evidence: "AGENT_STAGE_EVIDENCE", generating: "AGENT_STAGE_GENERATING", validating: "AGENT_STAGE_VALIDATING" };
// The server reports the stage it is in, never the whole pipeline; the order is
// fixed by `ChatStage`, so all four steps are drawn from the start and only
// their status changes. The cap fits those four rows (28px row + 2px gap +
// 16px list padding) so a running run never hides a completed stage behind the
// activity viewport's top mask.
const AGENT_STAGE_ROWS_HEIGHT = 140;
const AGENT_STAGE_ORDER: ChatStage[] = ["retrieving", "evidence", "generating", "validating"];

/** The staged progress the server reports, drawn as beUI activity steps: the
 * stages already reported keep a check, the running one pulses and carries the
 * elapsed readout, and the stages still to come stay dim. Before the first
 * stage arrives the wait is indeterminate, so it is beUI's reasoning indicator
 * rather than an invented first step. */
function AgentStageProgress({ stage, locale }: { stage: ChatStage | null; locale?: LocaleRuntime }) {
  const elapsed = useElapsedSeconds();
  if (!stage) return <ReasoningText variant="swap" phrases={[frontendText(locale, "AGENT_PREPARING")]} />;
  const active = frontendText(locale, AGENT_STAGE_KEYS[stage]);
  const reached = AGENT_STAGE_ORDER.indexOf(stage);
  return <AgentActivity activeLabel={active} contentType="step" maxHeight={AGENT_STAGE_ROWS_HEIGHT} status="working" items={AGENT_STAGE_ORDER.map((value, index) => ({
    id: value,
    type: "step" as const,
    label: frontendText(locale, AGENT_STAGE_KEYS[value]),
    status: index < reached ? "complete" as const : index === reached ? "active" as const : "pending" as const,
    ...(index === reached ? { meta: `${elapsed}s` } : {}),
  }))} />;
}

/** The turn has no server clock, so the elapsed readout is measured from the
 * render that mounted it. Kept here rather than in the activity components, so
 * their steps stay a pure projection of what the server reported. */
function useElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return seconds;
}

export function AgentPage({ scope, state, locale, question = "", onQuestionChange, onSubmit, onCancel, onRetry, onStartScope, isWriteBlocked, sourceDraft, feedbackAdmission, feedbackBlocked = false, memberId, stage }: { scope: string | AgentScope; state: AgentTurnState; stage?: ChatStage | null; locale?: LocaleRuntime; question?: string; onQuestionChange?: (question: string) => void; onSubmit?: () => void; onCancel?: () => void; onRetry?: () => void; sourceDraft?: SourceDraft; feedbackAdmission?: AgentFeedbackAdmission; feedbackBlocked?: boolean; memberId?: string; isWriteBlocked?: () => boolean; onStartScope?: (scope: AgentScope, onCommit: () => void, onSettled: () => void) => void }) {
  const scopeLabel = typeof scope === "string" ? scope || "all" : scope.kind;
  // Question, scope and low confidence share one clampable line; the confidence
  // field only appears when the answer reports low confidence.
  const summaryItems: SummaryRowItem[] = [
    { label: frontendText(locale, "AGENT_QUESTION_LABEL"), value: question },
    { label: frontendText(locale, "AGENT_SCOPE"), value: scopeLabel },
    ...(state.kind === "ready" && state.confidence === "low" ? [{ label: frontendText(locale, "AGENT_CONFIDENCE"), value: frontendText(locale, "AGENT_CONFIDENCE_LOW") }] : []),
  ];
  return <section className="flex flex-col space-y-6 lg:h-full lg:min-h-0"><div><PageHeader title={frontendText(locale, "AGENT_TITLE")} /><SummaryRow className="mt-1" locale={locale} items={summaryItems} /></div>
    {/* Kept hand-rolled on purpose. beUI's `prompt-input` (slug
        `@beui/prompt-input`) carries the drafted question (`value`/`onValueChange`
        plus `id` through its textarea props) and honours `disabled`, so the
        write-blocked guard survives - but one icon-only button serves both send
        and stop and its accessible name is the hardcoded English literal pair
        `"Stop generating"` / `"Send prompt"` (payload
        `components/agents/prompt-input.tsx:300-307`, the label at `:304`), and no
        prop can override it: the props interface (`:47-67`) has no label or
        button-props entry and its only spread, `{...textareaProps}` (`:90`),
        lands on the textarea (`:190`), while a caller's `aria-label` is consumed
        by that textarea (`:88`, `:188`). The `+` action trigger is a second
        icon-only button with the same defect (`:200-207`, `"Add to prompt"` at
        `:205`). Adopting it would drop the localized AGENT_SUBMIT and AGENT_STOP
        affordances this composer owes both locales, so the two controls stay
        here; re-verified against the live payload on 2026-10-17. */}
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <Label htmlFor="agent-question">{frontendText(locale, "AGENT_QUESTION_LABEL")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input id="agent-question" name="question" disabled={state.kind === "loading" || feedbackBlocked} value={question} onChange={(event) => onQuestionChange?.(event.currentTarget.value)} placeholder={frontendText(locale, "AGENT_QUESTION_PLACEHOLDER")} autoComplete="off" /><Button type="submit" disabled={!onSubmit || state.kind === "loading" || feedbackBlocked}>{frontendText(locale, "AGENT_SUBMIT")}</Button></div>
    </form>
    {onStartScope && sourceDraft && <AgentSourceControls key={JSON.stringify(scope)} draft={sourceDraft} locale={locale} disabled={state.kind === "loading" || feedbackBlocked} isWriteBlocked={isWriteBlocked} onStartScope={onStartScope} />}
    {state.kind === "loading" ? <div><div data-page-state="loading" aria-busy="true"><StreamingResponse status="streaming" announce={false}><AgentStageProgress locale={locale} stage={stage ?? null} /></StreamingResponse></div><Button className="mt-4" variant="outline" onClick={onCancel}>{frontendText(locale, "AGENT_STOP")}</Button></div> : state.kind === "cancelled" ? <PageState kind="degraded" title={frontendText(locale, "AGENT_STOPPED_WAITING")} description={frontendText(locale, "AGENT_STOPPED_DETAIL")} /> : state.kind === "unavailable" ? <div data-agent-unavailable={state.reason}><PageState kind="degraded" title={frontendText(locale, state.reason === "quota" ? "AGENT_UNAVAILABLE_QUOTA" : "AGENT_UNAVAILABLE_DEGRADED")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "AGENT_RETRY")}</Button></PageState></div> : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_ANSWER_UNAVAILABLE")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "AGENT_RETRY")}</Button></PageState> : <>{state.kind === "refused" ? <AgentRefusal locale={locale} state={state} onRetry={onRetry} /> : <AnswerPanel locale={locale} state={state} />}{state.conversationId && <AgentFeedback admission={feedbackAdmission} memberId={memberId} key={state.conversationId} locale={locale} conversationId={state.conversationId} citationIds={state.citations.map((citation) => citation.id)} />}</>}
  </section>;
}

/** The server's explicit no-evidence answer. It carries no answer body, so the
 * page states the refusal instead of rendering an empty or placeholder answer. */
function AgentRefusal({ state, locale, onRetry }: { state: Extract<AgentTurnState, { kind: "refused" }>; locale?: LocaleRuntime; onRetry?: () => void }) {
  const suggestions = state.suggestions ?? [];
  return <div data-agent-refused role="status" className="space-y-2 rounded-md border p-4">
    <h3 className="font-medium">{frontendText(locale, "AGENT_INSUFFICIENT")}</h3>
    {suggestions.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground">{suggestions.map((suggestion) => <li key={suggestion}>{frontendText(locale, suggestion === "rewrite" ? "AGENT_SUGGEST_REWRITE" : "AGENT_SUGGEST_SOURCES")}</li>)}</ul>}
    {onRetry && <Button variant="outline" onClick={onRetry}>{frontendText(locale, "AGENT_RETRY")}</Button>}
  </div>;
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
    <Label id="agent-scope-kind" className="flex w-fit flex-col gap-2">{frontendText(locale, "AGENT_SCOPE_KIND")}
      <Select value={kind} disabled={disabled || draft.applicationPending} onValueChange={(value) => { draft.edit("kind", value as AgentScope["kind"]); draft.edit("ids", ""); setInvalid(false); }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{frontendText(locale, "AGENT_SCOPE_ALL")}</SelectItem>
          <SelectItem value="space">{frontendText(locale, "AGENT_SCOPE_SPACE")}</SelectItem>
          <SelectItem value="collection">{frontendText(locale, "AGENT_SCOPE_COLLECTION")}</SelectItem>
          <SelectItem value="items">{frontendText(locale, "AGENT_SCOPE_ITEMS")}</SelectItem>
        </SelectContent>
      </Select>
    </Label>
    {kind !== "all" && <><Label htmlFor="agent-scope-ids">{frontendText(locale, "AGENT_SCOPE_IDS")}</Label><Input id="agent-scope-ids" value={ids} onChange={(event) => draft.edit("ids", event.currentTarget.value)} aria-invalid={invalid} /></>}
    <p className="text-sm text-muted-foreground">{frontendText(locale, "AGENT_SCOPE_DETAIL")}</p>
    {invalid && <p role="alert">{frontendText(locale, "AGENT_SCOPE_INVALID")}</p>}
    <Button type="button" variant="outline" disabled={disabled} onClick={apply}>{frontendText(locale, "AGENT_SCOPE_APPLY")}</Button>
  </fieldset>;
}
