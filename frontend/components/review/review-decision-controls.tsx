import { useId, useState } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { MAX_REVIEW_NOTE_BYTES, validReviewNote, type ReviewDecision, type ReviewNoteInput, type ReviewReceipt, type ReviewRecovery } from "./review-detail-data";

export type ReviewDecisionState =
  | { kind: "idle" }
  | { kind: "pending"; action: ReviewDecision }
  | { kind: "success"; receipt: ReviewReceipt }
  | { kind: "error"; action: ReviewDecision; recovery: ReviewRecovery };

export function reviewDecisionLocked(state: ReviewDecisionState): boolean {
  return state.kind === "pending" || (state.kind === "error" && state.recovery !== "edit");
}

export function ReviewDecisionControls({ disabled, terminal, pendingAction, onDecision, locale, targetLabel }: {
  disabled?: boolean; terminal?: boolean; pendingAction?: ReviewDecision;
  onDecision?: (action: ReviewDecision, details?: ReviewNoteInput) => void; locale?: LocaleRuntime; targetLabel?: string;
}) {
  const [selected, setSelected] = useState<"reject" | "request_changes" | null>(null);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {(["publish", "request_changes", "reject"] as const).map((action) => {
        const label = frontendText(locale, action === "publish" ? "ADMIN_REVIEW_PUBLISH" : action === "reject" ? "ADMIN_REVIEW_REJECT" : "ADMIN_REVIEW_REQUEST_CHANGES");
        return <Button key={action} type="button" disabled={disabled || terminal} variant={action === "publish" ? "default" : action === "reject" ? "destructive" : "outline"}
          aria-label={targetLabel ? `${label} ${targetLabel}` : undefined} aria-busy={pendingAction === action}
          aria-expanded={action === "publish" ? undefined : selected === action}
          onClick={() => { if (action === "publish") onDecision?.(action); else setSelected(action); }}>
          {pendingAction === action ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : label}
        </Button>;
      })}
    </div>
    {selected && !terminal && <ReviewDecisionForm key={selected} action={selected} disabled={disabled} locale={locale}
      onCancel={() => setSelected(null)} onSubmit={(details) => onDecision?.(selected, details)} />}
  </div>;
}

export function ReviewDecisionForm({ action, disabled, locale, onSubmit, onCancel }: {
  action: "reject" | "request_changes"; disabled?: boolean; locale?: LocaleRuntime;
  onSubmit: (details: ReviewNoteInput) => void; onCancel: () => void;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [reasonCode, setReason] = useState<ReviewNoteInput["reasonCode"]>(action === "reject" ? "not_relevant" : "needs_revision");
  const valid = validReviewNote(note);
  return <form className="space-y-3 rounded-md border bg-muted/20 p-3" onSubmit={(event) => { event.preventDefault(); if (!disabled && valid) onSubmit({ reasonCode, note }); }}>
    {action === "reject" && <div className="space-y-2">
      <Label htmlFor={`${id}-reason`}>{frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}</Label>
      <Select id={`${id}-reason`} data-review-reason disabled={disabled} value={reasonCode} onChange={(event) => setReason(event.target.value as ReviewNoteInput["reasonCode"])}>
        <option value="not_relevant">{frontendText(locale, "ADMIN_REVIEW_REASON_NOT_RELEVANT")}</option>
        <option value="duplicate">{frontendText(locale, "ADMIN_REVIEW_REASON_DUPLICATE")}</option>
        <option value="unsafe">{frontendText(locale, "ADMIN_REVIEW_REASON_UNSAFE")}</option>
      </Select>
    </div>}
    <div className="space-y-2">
      <Label htmlFor={`${id}-note`}>{frontendText(locale, "ADMIN_REVIEW_NOTE")}</Label>
      <Textarea id={`${id}-note`} data-review-note disabled={disabled} value={note} onChange={(event) => setNote(event.target.value)}
        aria-invalid={!valid} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className={valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
        {new TextEncoder().encode(note).byteLength} / {MAX_REVIEW_NOTE_BYTES} {frontendText(locale, "ADMIN_REVIEW_NOTE_HINT")}
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant={action === "reject" ? "destructive" : "default"} disabled={disabled || !valid}>
        {frontendText(locale, action === "reject" ? "ADMIN_REVIEW_CONFIRM_REJECT" : "ADMIN_REVIEW_CONFIRM_REVISION")}
      </Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>{frontendText(locale, "ADMIN_REVIEW_CANCEL")}</Button>
    </div>
  </form>;
}

export function ReviewDecisionFeedback({ state, locale, onRetry, onReload }: {
  state: ReviewDecisionState; locale?: LocaleRuntime; onRetry?: () => void; onReload?: () => void;
}) {
  if (state.kind === "success") {
    const { receipt } = state;
    const key = receipt.action === "publish" ? `ADMIN_REVIEW_INDEX_${receipt.searchStatus.toUpperCase()}`
      : receipt.action === "reject" ? "ADMIN_REVIEW_REJECTED" : "ADMIN_REVIEW_REVISION_REQUESTED";
    return <Alert role="status"><AlertDescription className="space-y-1">
      <p>{frontendText(locale, key)}</p>
      {receipt.action === "publish" && <p className="break-all text-xs text-muted-foreground">
        {frontendText(locale, "ADMIN_REVIEW_KNOWLEDGE_ID")}: {receipt.knowledgeItemId} · {frontendText(locale, "ADMIN_REVIEW_REVISION_ID")}: {receipt.revisionId}
      </p>}
    </AlertDescription></Alert>;
  }
  if (state.kind !== "error") return null;
  const key = state.recovery === "retry" ? "ADMIN_REVIEW_RESULT_UNKNOWN" : state.recovery === "reload" ? "ADMIN_REVIEW_CONFLICT" : "ADMIN_REVIEW_VALIDATION_ERROR";
  return <Alert variant="destructive"><AlertDescription className="space-y-2">
    <p>{frontendText(locale, key)}</p>
    {state.recovery === "retry" && <Button type="button" variant="outline" onClick={onRetry}>{frontendText(locale, "ADMIN_REVIEW_RETRY_SAME")}</Button>}
    {state.recovery === "reload" && <Button type="button" variant="outline" onClick={onReload}>{frontendText(locale, "ADMIN_REVIEW_RELOAD")}</Button>}
  </AlertDescription></Alert>;
}
