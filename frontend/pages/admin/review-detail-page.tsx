import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { CodeBlock } from "../../components/agents/code-block";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { ButtonLink } from "../../components/motion/button/base";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { ReviewDetailModel } from "../../components/review/review-detail-model";
import type { ReactNode } from "react";
import type { ReviewDecision, ReviewNoteInput, ReviewPublishInput } from "../../components/review/review-detail-data";
import { ReviewDecisionControls, ReviewDecisionFeedback, reviewDecisionLocked, type ReviewDecisionState } from "../../components/review/review-decision-controls";

export type { ReviewDecisionState } from "../../components/review/review-decision-controls";
export type ReviewDetailState = { kind: "loading" } | { kind: "ready"; detail: ReviewDetailModel } | { kind: "error" | "forbidden" | "not-found"; message: string };

export function ReviewDetailPage({ state, onDecision, onRetry, onRetryDecision, onBack, decisionState = { kind: "idle" }, locale, comments, unresolvedDecision = false, retainedDraft = false, decisionRecordBlocked = false, decisionRecordNotice, onDiscardDecisionRecord, sourceMaintenance, metadata, publishPayload, publishBlocked }: {
  state: ReviewDetailState; onDecision?: (action: ReviewDecision, details?: ReviewNoteInput, publishOverrides?: ReviewPublishInput) => void;
  onRetry?: () => void; onRetryDecision?: () => void; onBack?: () => void;
  decisionState?: ReviewDecisionState; locale?: LocaleRuntime; comments?: ReactNode; unresolvedDecision?: boolean; retainedDraft?: boolean;
  decisionRecordBlocked?: boolean; decisionRecordNotice?: string; onDiscardDecisionRecord?: () => void; sourceMaintenance?: ReactNode;
  /** The editable publication-metadata form; mounted only while a decision is possible. */
  metadata?: ReactNode; publishPayload?: ReviewPublishInput; publishBlocked?: boolean;
}) {
  // The page shell is constant (research §4.3): the titled header renders for every state
  // and only the panel below switches between loading, failure and the submission.
  const detail = state.kind === "ready" ? state.detail : null;
  // Real, visible state as text, not colour alone (§4.2): a submission past review,
  // and a viewer without the decision capability, both say so next to the status.
  const terminal = detail ? detail.status !== "review_pending" : false;
  const stateNote = !detail ? undefined : terminal ? frontendText(locale, "ADMIN_REVIEW_DECISION_CLOSED")
    : !onDecision && !decisionRecordBlocked ? frontendText(locale, "ADMIN_REVIEW_DECISION_READ_ONLY") : undefined;
  return <section className="space-y-5" aria-busy={state.kind === "loading" || undefined}>
    <PageHeader title={detail ? detail.title : frontendText(locale, "ADMIN_REVIEW_DETAIL_LABEL")}
      description={detail ? <>{frontendText(locale, "ADMIN_REVIEW_SUBMITTER")}: {detail.submitter}</> : undefined}
      status={detail ? <span className="inline-flex flex-wrap items-center gap-2"><Badge variant="outline">{detail.status}</Badge>{stateNote ? <span data-review-state={terminal ? "closed" : "read-only"}>{stateNote}</span> : null}</span> : undefined} />
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind !== "ready" ? <section className="space-y-4" data-page-state={state.kind}>
    <Alert variant={state.kind === "not-found" ? "default" : "destructive"}><AlertDescription>{state.message}
      <div className="flex flex-wrap gap-2">
        {(state.kind !== "not-found" || unresolvedDecision || retainedDraft) && onRetry && <Button variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}
        <ButtonLink variant="outline" size="md" href="/admin/submissions" onClick={(event) => {
          if (!onBack || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); onBack();
        }}>{frontendText(locale, "ADMIN_REVIEW_BACK")}</ButtonLink>
      </div>
    </AlertDescription></Alert>
  </section>
      : <>
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_CONTENT")}</CardTitle></CardHeader><CardContent>
      <CodeBlock code={state.detail.content || frontendText(locale, "ADMIN_REVIEW_NO_CONTENT")} language="text" wrap showLineNumbers={false} maxHeight={512} />
    </CardContent></Card>
    {state.detail.warnings.length ? <Alert><AlertDescription><strong>{frontendText(locale, "ADMIN_REVIEW_WARNINGS")}:</strong> {state.detail.warnings.join(" · ")}</AlertDescription></Alert> : null}
    {comments}
    {!terminal && metadata}
    {decisionRecordBlocked && <div role="alert" data-review-decision-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardDecisionRecord}>{frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD")}</Button></div>}
    {decisionRecordNotice && <p role="alert" className="text-sm text-destructive">{decisionRecordNotice}</p>}
    <ReviewDecisionFeedback allowUnknownReload state={decisionState} locale={locale} onRetry={onRetryDecision} onReload={onRetry} />
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_DECISION")}</CardTitle></CardHeader><CardContent>
      <ReviewDecisionControls decisionUnresolved={reviewDecisionLocked(decisionState)} key={state.detail.id} targetId={state.detail.id} targetLabel={state.detail.title || state.detail.id} snapshot={state.detail} disabled={reviewDecisionLocked(decisionState)} terminal={terminal}
        pendingAction={decisionState.kind === "pending" ? decisionState.action : undefined} onDecision={onDecision} publishPayload={publishPayload} publishBlocked={publishBlocked} locale={locale} />
    </CardContent></Card>
    {sourceMaintenance}
      </>}
  </section>;
}
