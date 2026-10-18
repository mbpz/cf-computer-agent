import { useState } from "react";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, StatefulButton } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ConfirmAction } from "../components/ui/confirm-action";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import type { SubmissionDraft } from "../components/submissions/submission-form-model";
import { SubmissionTargetPicker, type SubmissionTargetsActions, type SubmissionTargetsView } from "../components/submissions/submission-target-picker";
import { SubmissionCommentsPanel, type SubmissionCommentsState } from "../components/submissions/submission-comments-panel";
import { AssetAvailabilityPanel } from "../components/assets/asset-availability-panel";
import { PageHeader } from "../components/ui/page-header";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { SimilarSubmissionCandidate } from "../lib/submission-data";
import type { SubmissionDraftSaveState } from "../lib/submission-draft-data";
import type { ResubmitStatus } from "../lib/submission-resubmit-data";

type SubmissionState = { kind: "idle" | "pending" } | { kind: "validation" | "error"; message: string } | { kind: "success"; message: string; similarCandidates?: readonly SimilarSubmissionCandidate[] };
type Recovery = { title?: string; storageUnavailable: boolean; invalid: boolean; onRetry: () => void };

/** The returned item the editor is resubmitting, and the outcome once it landed. */
export interface SubmitResubmitView {
  priorId: string;
  title: string;
  reviewNote?: string;
  state: "editing" | "submitted";
  /** Set once the server confirmed the resubmission. */
  submissionId?: string;
  status?: ResubmitStatus;
  /** How the authoritative status was read back after the resubmission. */
  statusRead: "none" | "found" | "missing" | "failed";
}

const draftReasonKeys: Readonly<Record<NonNullable<SubmissionDraftSaveState["reason"]>, string>> = {
  no_target: "SUBMIT_DRAFT_NO_TARGET",
  storage: "SUBMIT_DRAFT_STORAGE",
  error: "SUBMIT_DRAFT_FAILED",
  unknown: "SUBMIT_DRAFT_UNKNOWN",
  unsaved: "SUBMIT_DRAFT_UNSAVED",
  resubmit: "SUBMIT_RESUBMIT_KEEP",
  discard_error: "SUBMIT_DRAFT_DISCARD_FAILED",
  discard_unknown: "SUBMIT_DRAFT_DISCARD_UNKNOWN",
};

/** An unknown discard outcome is settled by re-reading it, never by re-saving it. */
const recheckReasons: Readonly<Record<string, true>> = { unknown: true, discard_unknown: true };

export function SubmitPage({ draft, state, locale, onSubmit, onDraftChange, recovery, memberId, targets, draftSave, onDraftRetry, onDraftDiscard, resubmit, onResubmitRestart, onResubmitLeave, onResubmitStatusRetry, comments }: {
  memberId?: string; draft: SubmissionDraft; state: SubmissionState; locale?: LocaleRuntime;
  onSubmit?: (draft: SubmissionDraft) => void; onDraftChange?: (patch: Partial<SubmissionDraft>) => void; recovery?: Recovery;
  /** Member-side Space/Collection/visibility picker; absent only in tests. */
  targets?: { view: SubmissionTargetsView; actions: SubmissionTargetsActions };
  /** Server-draft status of the text in this form. */
  draftSave?: SubmissionDraftSaveState;
  onDraftRetry?: () => void;
  /** Discards the server draft this browser owns; the confirmation is this page's. */
  onDraftDiscard?: () => void;
  /** Present while this editor is resubmitting a returned item. */
  resubmit?: SubmitResubmitView;
  onResubmitRestart?: () => void;
  onResubmitLeave?: () => void;
  onResubmitStatusRetry?: () => void;
  comments?: { state: SubmissionCommentsState; onRetry: () => void };
}) {
  const pending = state.kind === "pending";
  const unresolved = recovery?.title !== undefined;
  const similarCandidates = state.kind === "success" ? state.similarCandidates ?? [] : [];
  const resubmitting = resubmit !== undefined;
  const resubmitted = resubmit?.state === "submitted";
  const target = targets?.view.target ?? null;
  // The submit button stays disabled while an unresolved write is on screen, but
  // the form itself still reports a submit: the owning route repeats exactly the
  // identity it already holds instead of silently starting a new one.
  const submitDisabled = pending || unresolved || recovery?.invalid === true || resubmitted;
  const submitBlocked = pending || recovery?.invalid === true || resubmitted;
  // A discard is offered wherever this editor could hold a draft: a state the
  // server reported, or text that has not been sent yet. It is refused while a
  // write of either kind is in flight, because the journal slot is taken.
  const draftText = draft.title.trim() !== "" || draft.content.trim() !== "";
  const discarding = draftSave?.kind === "discarding";
  const discardAvailable = onDraftDiscard !== undefined && draftSave !== undefined && !resubmitting
    && (draftSave.kind !== "idle" || draftText);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  return <section className="mx-auto max-w-3xl space-y-6">
    <PageHeader
      title={frontendText(locale, resubmitting ? "SUBMIT_RESUBMIT_TITLE" : "SUBMIT_TITLE")}
      // The id stays on the context text so the form keeps its historical
      // `aria-describedby="submission-description"` after the header move.
      description={<span id="submission-description">{frontendText(locale, resubmitting ? "SUBMIT_RESUBMIT_DESCRIPTION" : "SUBMIT_DESCRIPTION")}</span>}
    />
    {(state.kind === "validation" || state.kind === "error") && <PageState kind="error" title={state.message} />}
    {state.kind === "success" && <PageState kind="empty" title={state.message} />}
    {recovery?.storageUnavailable && <Alert data-submission-storage-warning><AlertDescription>{frontendText(locale, "SUBMIT_STORAGE_WARNING")}</AlertDescription></Alert>}
    {recovery?.invalid && <Alert><AlertDescription><p>{frontendText(locale, "SUBMIT_INTENT_INVALID")}</p><a className="underline" href="/my-submissions">{frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS")}</a></AlertDescription></Alert>}
    {unresolved && !recovery?.invalid && <Card aria-live="polite"><CardHeader><CardTitle>{frontendText(locale, "SUBMIT_RECOVERY_TITLE")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="break-words text-sm font-medium">{recovery?.title}</p>
      <p className="text-sm text-muted-foreground">{frontendText(locale, "SUBMIT_RECOVERY_DESCRIPTION")}</p>
      <div className="flex flex-wrap items-center gap-3"><Button type="button" data-submission-retry disabled={pending} onClick={recovery?.onRetry}>{frontendText(locale, pending ? "SUBMIT_BUTTON_PENDING" : "SUBMIT_RETRY")}</Button><a className="text-sm underline" href="/my-submissions">{frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS")}</a></div>
    </CardContent></Card>}
    {resubmitting && <Card data-submission-resubmit={resubmit.state} aria-live="polite"><CardHeader><CardTitle>{frontendText(locale, resubmitted ? "SUBMIT_RESUBMIT_SUCCESS_TITLE" : "SUBMIT_RESUBMIT_RETURNED")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="break-words text-sm font-medium">{resubmit.title}</p>
      {resubmit.reviewNote && <p className="text-sm text-muted-foreground"><span className="font-medium">{frontendText(locale, "SUBMIT_RESUBMIT_NOTE")}：</span>{resubmit.reviewNote}</p>}
      {resubmitted && <>
        <p data-submission-resubmit-status={resubmit.statusRead} className="text-sm">
          {resubmit.statusRead === "found" && resubmit.status
            ? <>{frontendText(locale, "SUBMIT_RESUBMIT_STATUS")}: <span className="font-medium">{resubmit.status}</span></>
            : frontendText(locale, resubmit.statusRead === "missing" ? "SUBMIT_RESUBMIT_STATUS_MISSING" : "SUBMIT_RESUBMIT_STATUS_UNREAD")}
        </p>
        {resubmit.submissionId && <p className="break-words text-sm text-muted-foreground">{frontendText(locale, "SUBMIT_RESUBMIT_ALREADY")} {resubmit.submissionId}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {resubmit.statusRead !== "found" && onResubmitStatusRetry && <Button type="button" variant="outline" size="sm" data-submission-resubmit-status-retry onClick={onResubmitStatusRetry}>{frontendText(locale, "SUBMIT_RESUBMIT_STATUS_RETRY")}</Button>}
          {onResubmitRestart && <Button type="button" variant="outline" size="sm" data-submission-resubmit-restart onClick={onResubmitRestart}>{frontendText(locale, "SUBMIT_RESUBMIT_START_OVER")}</Button>}
          {onResubmitLeave && <Button type="button" variant="outline" size="sm" data-submission-resubmit-leave onClick={onResubmitLeave}>{frontendText(locale, "SUBMIT_RESUBMIT_CANCEL")}</Button>}
        </div>
      </>}
    </CardContent></Card>}
    {similarCandidates.length > 0 && <Alert><AlertDescription><p className="font-medium">{frontendText(locale, "SUBMIT_SIMILAR_NOTICE")}</p><ul className="mt-2 list-disc pl-5">{similarCandidates.map((candidate) => <li key={candidate.sourceVersionId}>{candidate.title}</li>)}</ul></AlertDescription></Alert>}
    <form aria-describedby="submission-description" aria-busy={pending ? "true" : undefined} onSubmit={(event) => { event.preventDefault(); if (!submitBlocked) onSubmit?.(draft); }}>
      <Card><CardHeader><CardTitle>{frontendText(locale, resubmitting ? "SUBMIT_RESUBMIT_EDIT" : "SUBMIT_NEW")}</CardTitle></CardHeader><CardContent className="space-y-5">
        {targets && <SubmissionTargetPicker locale={locale} view={targets.view} actions={targets.actions} />}
        {resubmitting && resubmit?.title && target && target.requestedVisibility === "admin_only" && <p data-submission-resubmit-visibility-locked className="text-xs text-muted-foreground">{frontendText(locale, "SUBMIT_RESUBMIT_VISIBILITY_LOCKED")}</p>}
        <div><Label htmlFor="submission-title">{frontendText(locale, "SUBMIT_TITLE_LABEL")}</Label><Input id="submission-title" value={draft.title} onChange={(event) => onDraftChange?.({ title: event.currentTarget.value })} /></div>
        <div><Label htmlFor="submission-mode">{frontendText(locale, "SUBMIT_MODE_LABEL")}</Label><Select id="submission-mode" value={draft.mode} onChange={(event) => onDraftChange?.({ mode: event.currentTarget.value as SubmissionDraft["mode"] })} className="mt-2">
          <option value="text">{frontendText(locale, "SUBMIT_CONTENT_LABEL")}</option><option value="markdown">{frontendText(locale, "SUBMIT_MARKDOWN_LABEL")}</option><option value="code">{frontendText(locale, "SUBMIT_CODE_LABEL")}</option>
        </Select></div>
        <div><Label htmlFor="submission-content">{frontendText(locale, draft.mode === "code" ? "SUBMIT_CODE_LABEL" : draft.mode === "markdown" ? "SUBMIT_MARKDOWN_LABEL" : "SUBMIT_CONTENT_LABEL")}</Label><Textarea id="submission-content" value={draft.content} onChange={(event) => onDraftChange?.({ content: event.currentTarget.value })} className="min-h-64 font-mono" /></div>
        {draftSave && <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          <p data-submission-draft-status={draftSave.kind} className="text-sm text-muted-foreground">
            {frontendText(locale, draftSave.kind === "saving" ? "SUBMIT_DRAFT_SAVING" : draftSave.kind === "discarding" ? "SUBMIT_DRAFT_DISCARDING" : draftSave.kind === "saved" ? "SUBMIT_DRAFT_SAVED" : draftSave.kind === "unconfirmed" ? draftReasonKeys[draftSave.reason ?? "error"] : "SUBMIT_DRAFT_IDLE")}
            {draftSave.kind === "saved" && draftSave.reason === "storage" ? <> {frontendText(locale, "SUBMIT_DRAFT_STORAGE")}</> : null}
            {draftSave.kind === "saved" && draftSave.at ? <> <span className="font-mono text-xs">{draftSave.at}</span></> : null}
          </p>
          {draftSave.kind === "unconfirmed" && draftSave.reason !== "resubmit" && draftSave.reason !== "no_target" && onDraftRetry && <Button type="button" variant="outline" size="sm" data-submission-draft-retry onClick={onDraftRetry}>{frontendText(locale, recheckReasons[draftSave.reason ?? "error"] === true ? "SUBMIT_DRAFT_RECHECK" : "SUBMIT_DRAFT_RETRY")}</Button>}
          {discardAvailable && <Button type="button" variant="outline" size="sm" data-submission-draft-discard aria-haspopup="dialog" disabled={draftSave.kind === "saving" || discarding} onClick={() => setDiscardConfirm(true)}>{frontendText(locale, "SUBMIT_DRAFT_DISCARD")}</Button>}
        </div>}
        {!resubmitting && <AssetAvailabilityPanel locale={locale} memberId={memberId} title={draft.title} target={target} />}
        {resubmitting && <p data-submission-resubmit-no-asset className="text-xs text-muted-foreground">{frontendText(locale, "SUBMIT_RESUBMIT_NO_ASSET")}</p>}
        {!resubmitted && <StatefulButton type="submit" state={pending ? "loading" : "idle"} loadingText={frontendText(locale, "SUBMIT_BUTTON_PENDING")} disabled={submitDisabled}>{frontendText(locale, resubmitting ? "SUBMIT_RESUBMIT_SUBMIT" : "SUBMIT_BUTTON")}</StatefulButton>}
      </CardContent></Card>
    </form>
    {resubmit && comments && <SubmissionCommentsPanel locale={locale} state={comments.state} onRetry={comments.onRetry} />}
    {discardAvailable && <ConfirmAction open={discardConfirm} title={frontendText(locale, "SUBMIT_DRAFT_DISCARD_TITLE")}
      description={frontendText(locale, "SUBMIT_DRAFT_DISCARD_IMPACT")}
      cancelLabel={frontendText(locale, "TASKS_KEEP_EDITING")} confirmLabel={frontendText(locale, "SUBMIT_DRAFT_DISCARD_CONFIRM")}
      destructive onCancel={() => setDiscardConfirm(false)}
      onConfirm={() => { setDiscardConfirm(false); onDraftDiscard?.(); }} />}
  </section>;
}
