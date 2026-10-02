import { useEffect, useId, useRef, useState } from "react";
import { registerWorkspaceLeaveGuard } from "../../lib/workspace-location";
import { ReviewDraftProvider, useReviewDrafts, initialReviewNote as initialDetails } from "./review-drafts";
import { ConfirmAction } from "../ui/confirm-action";
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

type NoteAction = "reject" | "request_changes";
const decisionLabel = (action: ReviewDecision) => action === "publish" ? "ADMIN_REVIEW_PUBLISH" : action === "reject" ? "ADMIN_REVIEW_REJECT" : "ADMIN_REVIEW_REQUEST_CHANGES";

type ReviewDecisionControlsProps = {
  disabled?: boolean; terminal?: boolean; pendingAction?: ReviewDecision; decisionUnresolved?: boolean;
  onDecision?: (action: ReviewDecision, details?: ReviewNoteInput) => void; locale?: LocaleRuntime; targetLabel: string; targetId: string; snapshot: unknown; confirmationLock?: { current: object | null };
};
export function ReviewDecisionControls(props: ReviewDecisionControlsProps) {
  const drafts = useReviewDrafts();
  // Standalone page/component callers get the same ownership protocol. Routes
  // provide a longer-lived owner above error states and paginated rows.
  return drafts ? <ReviewDecisionEditor {...props} drafts={drafts} />
    : <ReviewDraftProvider locale={props.locale}><ReviewDecisionControls {...props} /></ReviewDraftProvider>;
}
function ReviewDecisionEditor({ disabled, terminal, pendingAction, decisionUnresolved, onDecision, locale, targetLabel, targetId, snapshot, confirmationLock, drafts }: ReviewDecisionControlsProps & { drafts: NonNullable<ReturnType<typeof useReviewDrafts>> }) {
  type Confirmation = { kind: "decision"; action: ReviewDecision; details?: ReviewNoteInput; snapshot: unknown; targetId: string; targetLabel: string }
    | { kind: "discard"; next: ReviewDecision | null; snapshot: unknown; targetId: string; targetLabel: string };
  const [selected, setSelected] = useState<NoteAction | null>(() => drafts.get(targetId)?.action ?? null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const owner = useRef({});
  const ownedElsewhere = () => Boolean(confirmationLock?.current && confirmationLock.current !== owner.current);
  const locked = Boolean(disabled || terminal || pendingAction || !onDecision);
  const currentDetails = () => { const saved = drafts.get(targetId); return saved ? { reasonCode: saved.reasonCode, note: saved.note } : initialDetails(selected ?? "reject"); };
  const details = currentDetails();
  const setDetails = (next: ReviewNoteInput) => { if (selected && !locked && !confirmationRef.current && !drafts.isConfirming()) drafts.set(targetId, { ...next, action: selected }); };
  const resetDetails = () => drafts.clear(targetId);
  const blocked = useRef<() => boolean>(() => false);
  blocked.current = () => confirmationRef.current !== null || Boolean(pendingAction || decisionUnresolved);
  useEffect(() => {
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: blocked.current() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => { if (blocked.current()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { unregister(); window.removeEventListener("beforeunload", warn); };
  }, []);
  const valid = Boolean(confirmation && !locked && confirmation.snapshot === snapshot && confirmation.targetId === targetId && confirmation.targetLabel === targetLabel);
  const release = () => { if (confirmationLock?.current === owner.current) confirmationLock.current = null; };
  const cancel = () => { confirmationRef.current = null; setConfirmation(null); release(); };
  useEffect(() => { if (confirmation && !valid) cancel(); }, [confirmation, valid]);
  useEffect(() => {
    if (terminal) { setSelected(null); if (!drafts.preserveUnsent) resetDetails(); }
    else setSelected(drafts.get(targetId)?.action ?? null);
  }, [targetId, terminal]);
  useEffect(() => () => { confirmationRef.current = null; release(); }, [confirmationLock]);
  const open = (next: Confirmation) => {
    if (ownedElsewhere()) return;
    if (confirmationLock) confirmationLock.current = owner.current;
    confirmationRef.current = next; setConfirmation(next);
  };
  const capture = { snapshot, targetId, targetLabel };
  const dirty = () => selected !== null && (currentDetails().note !== "" || currentDetails().reasonCode !== initialDetails(selected).reasonCode);
  const choose = (next: ReviewDecision | null) => {
    setSelected(next === "publish" ? null : next);
    if (next === "publish") open({ kind: "decision", action: "publish", ...capture });
    else if (next) resetDetails();
    if (!next || next === "publish") resetDetails();
  };
  const requestChoice = (next: ReviewDecision | null) => {
    if (locked || ownedElsewhere() || confirmationRef.current || drafts.isConfirming() || (next !== null && next === selected)) return;
    if (dirty()) open({ kind: "discard", next, ...capture });
    else choose(next);
  };
  const submit = () => {
    if (locked || ownedElsewhere() || confirmationRef.current || drafts.isConfirming() || !selected || !validReviewNote(currentDetails().note)) return;
    open({ kind: "decision", action: selected, details: { ...currentDetails() }, ...capture });
  };
  const confirm = () => {
    if (!valid || !confirmation || confirmationRef.current !== confirmation) return;
    cancel(); // Consume synchronously: a stale/double click cannot send another decision.
    if (confirmation.kind === "discard") choose(confirmation.next);
    else onDecision?.(confirmation.action, confirmation.details);
  };
  const description = !confirmation ? "" : `${confirmation.targetLabel} (${confirmation.targetId}). ${confirmation.kind === "discard"
    ? frontendText(locale, "ADMIN_REVIEW_DISCARD_IMPACT")
    : `${frontendText(locale, confirmation.action === "publish" ? "ADMIN_REVIEW_PUBLISH_IMPACT" : confirmation.action === "reject" ? "ADMIN_REVIEW_REJECT_IMPACT" : "ADMIN_REVIEW_REVISION_IMPACT")}${confirmation.details ? ` ${frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}: ${frontendText(locale, `ADMIN_REVIEW_REASON_${confirmation.details.reasonCode.toUpperCase()}`)}. ${frontendText(locale, "ADMIN_REVIEW_NOTE")}: ${confirmation.details.note}` : ""}`}`;
  return <>
    <div className="space-y-3" inert={valid} aria-hidden={valid || undefined}>
      <div className="flex flex-wrap gap-2">
        {(["publish", "request_changes", "reject"] as const).map((action) => {
          const label = frontendText(locale, decisionLabel(action));
          return <Button key={action} type="button" disabled={locked || valid} variant={action === "publish" ? "default" : action === "reject" ? "destructive" : "outline"}
            aria-label={`${label} ${targetLabel}`} aria-busy={pendingAction === action}
            aria-expanded={action === "publish" ? undefined : selected === action} onClick={() => requestChoice(action)}>
            {pendingAction === action ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : label}
          </Button>;
        })}
      </div>
      {selected && !terminal && <ReviewDecisionForm action={selected} details={details} onChange={setDetails} disabled={locked || valid || drafts.confirming} locale={locale}
        onCancel={() => requestChoice(null)} onSubmit={submit} />}
    </div>
    <ConfirmAction key={confirmation?.kind === "decision" ? confirmation.action : "discard"} open={valid} title={frontendText(locale, confirmation?.kind === "discard" ? "ADMIN_RECORD_DISCARD_TITLE" : "ADMIN_REVIEW_CONFIRM_TITLE")}
      description={description} cancelLabel={frontendText(locale, "ADMIN_REVIEW_CANCEL")}
      confirmLabel={frontendText(locale, confirmation?.kind === "discard" ? "ADMIN_RECORD_DISCARD_CONFIRM" : "ADMIN_REVIEW_CONFIRM_DECISION")}
      destructive={confirmation?.kind === "discard" || confirmation?.action === "reject"} onCancel={cancel} onConfirm={confirm} />
  </>;
}

export function ReviewDecisionForm({ action, details, onChange, disabled, locale, onSubmit, onCancel }: {
  action: "reject" | "request_changes"; details: ReviewNoteInput; onChange: (details: ReviewNoteInput) => void; disabled?: boolean; locale?: LocaleRuntime;
  onSubmit: (details: ReviewNoteInput) => void; onCancel: () => void;
}) {
  const id = useId();
  const {note, reasonCode} = details;
  const valid = validReviewNote(note);
  return <form className="space-y-3 rounded-md border bg-muted/20 p-3" onSubmit={(event) => { event.preventDefault(); if (!disabled && valid) onSubmit({ reasonCode, note }); }}>
    {action === "reject" && <div className="space-y-2">
      <Label htmlFor={`${id}-reason`}>{frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}</Label>
      <Select id={`${id}-reason`} data-review-reason disabled={disabled} value={reasonCode} onChange={(event) => onChange({ ...details, reasonCode: event.target.value as ReviewNoteInput["reasonCode"] })}>
        <option value="not_relevant">{frontendText(locale, "ADMIN_REVIEW_REASON_NOT_RELEVANT")}</option>
        <option value="duplicate">{frontendText(locale, "ADMIN_REVIEW_REASON_DUPLICATE")}</option>
        <option value="unsafe">{frontendText(locale, "ADMIN_REVIEW_REASON_UNSAFE")}</option>
      </Select>
    </div>}
    <div className="space-y-2">
      <Label htmlFor={`${id}-note`}>{frontendText(locale, "ADMIN_REVIEW_NOTE")}</Label>
      <Textarea id={`${id}-note`} data-review-note disabled={disabled} value={note} onChange={(event) => onChange({ ...details, note: event.target.value })}
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

export function ReviewDecisionFeedback({ state, locale, onRetry, onReload, allowUnknownReload }: {
  state: ReviewDecisionState; locale?: LocaleRuntime; onRetry?: () => void; onReload?: () => void; allowUnknownReload?: boolean;
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
    {(state.recovery === "reload" || (state.recovery === "retry" && allowUnknownReload && onReload)) && <Button type="button" variant="outline" onClick={onReload}>{frontendText(locale, "ADMIN_REVIEW_RELOAD")}</Button>}
  </AlertDescription></Alert>;
}
