import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { MAX_REVIEW_NOTE_BYTES } from "./review-detail-data";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import {
  BATCH_REJECT_REASON_CODES, BATCH_REVISION_REASON_CODE, batchScope, failedRetryActions, MAX_BATCH_ACTIONS, planBatchActions,
  type BatchActionKind, type BatchItemAction, type BatchPlanDiagnosticCode, type BatchPlannableRow,
} from "../../lib/review-batch-plan";
import { BatchReviewRequestError, BatchReviewUnknownOutcomeError, sendBatchReview, type BatchReviewItemOutcome } from "../../lib/admin-batch-review-data";
import { beginBatchIntent, clearBatchIntent, loadBatchIntent, updateBatchIntent, type StoredBatchIntent } from "../../lib/review-batch-intent";

/** The batch surface state machine: nothing, applying, per-item outcomes, or a refusal. */
export type ReviewBatchState =
  | { kind: "idle" }
  | { kind: "pending"; count: number }
  | { kind: "done"; outcomes: readonly BatchReviewItemOutcome[]; attempts: readonly BatchItemAction[]; retried: boolean }
  | { kind: "unknown"; attempts: readonly BatchItemAction[]; message: string }
  | { kind: "rejected"; message: string };

export interface ReviewBatchController {
  /** Submission ids selected on the current page. */
  readonly selected: ReadonlySet<string>;
  toggle: (submissionId: string) => void;
  selectAllPage: () => void;
  clear: () => void;
  readonly decision: BatchActionKind;
  setDecision: (decision: BatchActionKind) => void;
  readonly reasonCode: string;
  setReasonCode: (reasonCode: string) => void;
  readonly note: string;
  setNote: (note: string) => void;
  readonly state: ReviewBatchState;
  /** Identity of the batch that currently owns persisted recovery state. */
  readonly batchId: string | null;
  /** A refusal notice (locked send, unplannable batch or whole-request failure). */
  readonly notice: string | null;
  /** True while a batch is in flight; the selection is frozen. */
  readonly freeze: boolean;
  send: () => void;
  retryFailed: () => void;
  /** Replays the frozen unknown attempt with its original numbers and payload. */
  retryAttempts: () => void;
  /** Drops a restored unknown attempt; it is not resent. */
  discardUnknown: () => void;
}

export interface UseReviewBatchInput {
  /** The rows of the CURRENT page; a selection never reaches across pages. */
  items: readonly BatchPlannableRow[];
  memberId?: string;
  locale: LocaleRuntime;
  /** False unless the reviewer holds `knowledge:review`: then no batch affordance exists. */
  enabled: boolean;
  requester?: Fetcher;
  /** Called when an attempt is frozen and sent; the page records its ownership. */
  onStart?: (attempts: readonly BatchItemAction[]) => void;
  /** Called after a completed batch (including retries) with the per-item outcomes. */
  onSettled?: (outcomes: readonly BatchReviewItemOutcome[]) => void;
}

const encoder = new TextEncoder();
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/gu;
const defaultReason = (decision: BatchActionKind) => decision === "request_revision" ? BATCH_REVISION_REASON_CODE : BATCH_REJECT_REASON_CODES[0];

/** The batch note shares the single-decision byte ceiling; input is clamped, never truncated silently by the server. */
function boundNote(input: string): string {
  const cleaned = input.replace(CONTROL_CHARACTER, "");
  if (encoder.encode(cleaned).byteLength <= MAX_REVIEW_NOTE_BYTES) return cleaned;
  let result = ""; let bytes = 0;
  for (const character of cleaned) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > MAX_REVIEW_NOTE_BYTES) break;
    result += character; bytes += size;
  }
  return result;
}

function batchFailureMessage(error: unknown, locale: LocaleRuntime): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 403) return frontendText(locale, "ADMIN_REVIEW_FORBIDDEN");
    if (error.status === 409) return frontendText(locale, "ADMIN_REVIEW_CONFLICT");
    if (error.status === 400) return `${frontendText(locale, "ADMIN_REVIEW_VALIDATION_ERROR")} (${error.code})`;
    if (error.retryable) return frontendText(locale, "ADMIN_REVIEW_RESULT_UNKNOWN");
    return `${error.code}: ${error.message}`;
  }
  // The client rejected its own payload or the response shape: nothing was sent,
  // so the protocol code is a validation fault, not an unknown outcome.
  if (error instanceof Error && /^[A-Z][A-Z0-9_]*$/u.test(error.message)) {
    return `${frontendText(locale, "ADMIN_REVIEW_VALIDATION_ERROR")} (${error.message})`;
  }
  // A transport failure is not a verdict: the write's outcome is unknown.
  return frontendText(locale, "ADMIN_REVIEW_RESULT_UNKNOWN");
}

function diagnosticMessage(code: BatchPlanDiagnosticCode, locale: LocaleRuntime): string {
  if (code === "BATCH_PLAN_SELECTION_EMPTY") return frontendText(locale, "ADMIN_REVIEW_BATCH_NONE_SELECTED");
  return `${frontendText(locale, "ADMIN_REVIEW_VALIDATION_ERROR")} (${code})`;
}

function mergeOutcomes(previous: readonly BatchReviewItemOutcome[], next: readonly BatchReviewItemOutcome[]): BatchReviewItemOutcome[] {
  const replaced = new Map(next.map((outcome) => [outcome.submissionId, outcome]));
  return previous.map((outcome) => replaced.get(outcome.submissionId) ?? outcome);
}

/**
 * Owns one batch at a time. The selected rows are planned once per send and the
 * attempts (with their operation numbers) are remembered, so a retry resends the
 * exact same writes — the server replays its recorded result instead of acting
 * twice. The selection freezes while a batch is in flight.
 */
export function useReviewBatch({ items, memberId, locale, enabled, requester = fetch, onStart, onSettled }: UseReviewBatchInput): ReviewBatchController {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [decision, setDecisionState] = useState<BatchActionKind>("reject");
  const [reasonCode, setReasonCodeState] = useState<string>(defaultReason("reject"));
  const [note, setNoteState] = useState<string>("");
  const [state, setState] = useState<ReviewBatchState>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const operationIdsRef = useRef<Map<string, string>>(new Map());
  const batchIdRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const restoredRef = useRef(false);
  const restoredIntentRef = useRef<StoredBatchIntent | null>(null);

  // Restore a frozen attempt after refresh/route changes before any new send.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!memberId) return;
    const stored = loadBatchIntent(memberId);
    if (!stored) return;
    restoredIntentRef.current = stored;
    batchIdRef.current = stored.batchId;
    operationIdsRef.current = new Map(stored.attempts.map((action) => [action.submissionId, action.operationId]));
    setDecisionState(stored.decision);
    setReasonCodeState(stored.reasonCode);
    setNoteState(stored.note);
    if (stored.status === "done" && stored.outcomes) {
      setState({ kind: "done", outcomes: stored.outcomes, attempts: stored.attempts, retried: false });
    } else {
      setState({ kind: "unknown", attempts: stored.attempts, message: frontendText(locale, "ADMIN_REVIEW_RESULT_UNKNOWN") });
    }
  }, [locale, memberId]);

  // Rows arrive after the restore effect; select only the stored ids that exist.
  useEffect(() => {
    const stored = restoredIntentRef.current;
    if (!stored || items.length === 0) return;
    restoredIntentRef.current = null;
    const present = new Set(items.map((item) => item.id));
    setSelected(new Set(stored.attempts.map((action) => action.submissionId).filter((id) => present.has(id))));
  }, [items]);

  // Rows that leave the page leave the selection: a scope statement only ever
  // names the current page.
  useEffect(() => {
    setSelected((previous) => {
      if (previous.size === 0) return previous;
      const present = new Set(items.map((item) => item.id));
      const next = new Set<string>();
      for (const id of previous) if (present.has(id)) next.add(id);
      return next.size === previous.size ? previous : next;
    });
  }, [items]);

  // A different reviewer owns a different set of operation numbers.
  useEffect(() => { operationIdsRef.current = new Map(); }, [memberId]);

  const frozen = state.kind === "pending";
  const toggle = useCallback((submissionId: string) => {
    if (pendingRef.current) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(submissionId)) next.delete(submissionId);
      else if (next.size < MAX_BATCH_ACTIONS) next.add(submissionId);
      else { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_LIMIT")); return previous; }
      return next;
    });
  }, [locale]);
  const selectAllPage = useCallback(() => {
    if (pendingRef.current) return;
    setSelected(new Set(items.slice(0, MAX_BATCH_ACTIONS).map((item) => item.id)));
    if (items.length > MAX_BATCH_ACTIONS) setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_LIMIT"));
    else setNotice(null);
  }, [items, locale]);
  const clear = useCallback(() => { if (pendingRef.current) return; setSelected(new Set()); }, []);
  const setDecision = useCallback((next: BatchActionKind) => {
    if (pendingRef.current) return;
    setDecisionState(next); setReasonCodeState(defaultReason(next));
  }, []);
  const setReasonCode = useCallback((next: string) => { if (!pendingRef.current) setReasonCodeState(next); }, []);
  const setNote = useCallback((next: string) => { if (!pendingRef.current) setNoteState(boundNote(next)); }, []);

  const intentFor = useCallback((batchId: string, attempts: readonly BatchItemAction[], status: StoredBatchIntent["status"], outcomes: readonly BatchReviewItemOutcome[] | null): StoredBatchIntent | null => {
    if (!memberId || attempts.length === 0) return null;
    return { version: 1, memberId, batchId, decision, reasonCode, note, attempts, outcomes, status, savedAt: new Date().toISOString() };
  }, [decision, memberId, note, reasonCode]);
  const createBatch = useCallback((batchId: string, attempts: readonly BatchItemAction[]): boolean => {
    const intent = intentFor(batchId, attempts, "pending", null);
    return intent !== null && beginBatchIntent(intent);
  }, [intentFor]);
  const updateBatch = useCallback((batchId: string, attempts: readonly BatchItemAction[], status: StoredBatchIntent["status"], outcomes: readonly BatchReviewItemOutcome[] | null): boolean => {
    const intent = intentFor(batchId, attempts, status, outcomes);
    return intent !== null && updateBatchIntent(intent);
  }, [intentFor]);
  const ownsStoredBatch = useCallback((batchId: string): boolean => {
    if (!memberId) return false;
    return loadBatchIntent(memberId)?.batchId === batchId;
  }, [memberId]);
  const clearBatch = useCallback((batchId: string): boolean => memberId ? clearBatchIntent(memberId, batchId) : false, [memberId]);
  // Only a pre-send validation failure or an explicit non-retryable HTTP refusal
  // proves nothing was applied. A transport failure or a malformed 200 is unknown.
  const unknownFailure = (error: unknown): boolean => {
    if (error instanceof BatchReviewRequestError) return false;
    if (error instanceof ApiRequestError) return error.retryable || error.status >= 500;
    return true;
  };
  const owned = (batchId: string) => batchIdRef.current === batchId;

  const send = useCallback(async () => {
    if (!enabled) return;
    if (pendingRef.current) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_LOCKED")); return; }
    if (state.kind === "unknown") { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_RECOVER_FIRST")); return; }
    const selectedRows = items.filter((item) => selected.has(item.id));
    if (selectedRows.length === 0) return;
    if (selectedRows.length > MAX_BATCH_ACTIONS) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_LIMIT")); return; }
    // A new confirmation always allocates new operation numbers; only an
    // unknown retry or a known-failure retry may resend frozen attempts.
    const plan = planBatchActions(selectedRows, decision, reasonCode, note, new Map());
    if (plan.kind === "unplannable") { setNotice(diagnosticMessage(plan.code, locale)); return; }
    const batchId = globalThis.crypto.randomUUID();
    if (!createBatch(batchId, plan.actions)) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_RECOVER_FIRST")); return; }
    batchIdRef.current = batchId;
    setNotice(null);
    pendingRef.current = true;
    onStart?.(plan.actions);
    setState({ kind: "pending", count: plan.actions.length });
    try {
      const result = await sendBatchReview(plan.actions, requester);
      if (!owned(batchId)) return;
      if (result.items.every((outcome) => outcome.status === "succeeded")) clearBatch(batchId);
      else updateBatch(batchId, plan.actions, "done", result.items);
      setState({ kind: "done", outcomes: result.items, attempts: plan.actions, retried: false });
      onSettled?.(result.items);
    } catch (error) {
      if (!owned(batchId)) return;
      if (unknownFailure(error)) {
        updateBatch(batchId, plan.actions, "unknown", null);
        setState({ kind: "unknown", attempts: plan.actions, message: frontendText(locale, "ADMIN_REVIEW_RESULT_UNKNOWN") });
      } else {
        clearBatch(batchId);
        setState({ kind: "rejected", message: batchFailureMessage(error, locale) });
      }
    } finally {
      pendingRef.current = false;
    }
  }, [clearBatch, createBatch, decision, enabled, items, locale, note, onSettled, onStart, reasonCode, requester, selected, state.kind, updateBatch]);

  const retryFailed = useCallback(async () => {
    if (!enabled) return;
    if (pendingRef.current) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_LOCKED")); return; }
    if (state.kind !== "done") return;
    const retryActions = failedRetryActions(state.outcomes, state.attempts);
    if (retryActions.length === 0) return;
    const batchId = batchIdRef.current;
    if (!batchId || !ownsStoredBatch(batchId)) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_RECOVER_FIRST")); return; }
    setNotice(null);
    pendingRef.current = true;
    onStart?.(retryActions);
    if (!updateBatch(batchId, state.attempts, "pending", state.outcomes)) { pendingRef.current = false; setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_RECOVER_FIRST")); return; }
    setState({ kind: "pending", count: retryActions.length });
    try {
      const result = await sendBatchReview(retryActions, requester);
      if (!owned(batchId)) return;
      const outcomes = mergeOutcomes(state.outcomes, result.items);
      if (outcomes.every((outcome) => outcome.status === "succeeded")) clearBatch(batchId);
      else updateBatch(batchId, state.attempts, "done", outcomes);
      setState({ kind: "done", outcomes, attempts: state.attempts, retried: true });
      onSettled?.(outcomes);
    } catch (error) {
      if (!owned(batchId)) return;
      // The earlier outcomes remain true; only this attempt's transport failed.
      if (unknownFailure(error)) {
        updateBatch(batchId, state.attempts, "unknown", null);
        setState({ kind: "unknown", attempts: state.attempts, message: frontendText(locale, "ADMIN_REVIEW_RESULT_UNKNOWN") });
      } else {
        setNotice(batchFailureMessage(error, locale));
        setState({ kind: "done", outcomes: state.outcomes, attempts: state.attempts, retried: true });
      }
    } finally {
      pendingRef.current = false;
    }
  }, [clearBatch, enabled, locale, onSettled, onStart, owned, ownsStoredBatch, requester, state, updateBatch]);

  const retryAttempts = useCallback(async () => {
    if (!enabled || pendingRef.current || state.kind !== "unknown") return;
    const attempts = state.attempts;
    const batchId = batchIdRef.current;
    if (attempts.length === 0 || !batchId || !ownsStoredBatch(batchId)) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_RECOVER_FIRST")); return; }
    pendingRef.current = true;
    onStart?.(attempts);
    if (!updateBatch(batchId, attempts, "pending", null)) { pendingRef.current = false; setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_RECOVER_FIRST")); return; }
    setState({ kind: "pending", count: attempts.length });
    try {
      const result = await sendBatchReview(attempts, requester);
      if (!owned(batchId)) return;
      if (result.items.every((outcome) => outcome.status === "succeeded")) clearBatch(batchId);
      else updateBatch(batchId, attempts, "done", result.items);
      setState({ kind: "done", outcomes: result.items, attempts, retried: true });
      onSettled?.(result.items);
    } catch (error) {
      if (!owned(batchId)) return;
      if (unknownFailure(error)) {
        updateBatch(batchId, attempts, "unknown", null);
        setState({ kind: "unknown", attempts, message: frontendText(locale, "ADMIN_REVIEW_RESULT_UNKNOWN") });
      } else {
        setNotice(batchFailureMessage(error, locale));
        setState({ kind: "unknown", attempts, message: frontendText(locale, "ADMIN_REVIEW_RESULT_UNKNOWN") });
      }
    } finally {
      pendingRef.current = false;
    }
  }, [clearBatch, enabled, locale, onSettled, onStart, owned, ownsStoredBatch, requester, state, updateBatch]);

  const discardUnknown = useCallback(() => {
    if (pendingRef.current) return;
    if (batchIdRef.current) clearBatch(batchIdRef.current);
    batchIdRef.current = null;
    setState({ kind: "idle" });
    setSelected(new Set());
  }, [clearBatch]);

  return { selected, toggle, selectAllPage, clear, decision, setDecision, reasonCode, setReasonCode, note, setNote, state, batchId: batchIdRef.current, notice, freeze: frozen, send, retryFailed, retryAttempts, discardUnknown };
}

/** The scope substitutions for `ADMIN_REVIEW_BATCH_SCOPE`, always naming the current page. */
function batchScopeText(locale: LocaleRuntime, page: number, pageSize: number, selected: number, pageCount: number): string {
  const scope = batchScope(page, pageSize, selected, pageCount);
  return frontendText(locale, "ADMIN_REVIEW_BATCH_SCOPE")
    .replace("{page}", String(scope.page))
    .replace("{selected}", String(scope.selected))
    .replace("{pageCount}", String(scope.pageCount));
}

export function ReviewBatchToolbar({ batch, rows, page, pageSize, locale }: {
  batch: ReviewBatchController;
  rows: readonly BatchPlannableRow[];
  page: number;
  pageSize: number;
  locale: LocaleRuntime;
}) {
  const reasonId = useId();
  const noteId = useId();
  const selectedOnPage = rows.filter((row) => batch.selected.has(row.id)).length;
  const frozen = batch.freeze;
  const pending = batch.state.kind === "pending" ? batch.state.count : null;
  return (
    <Card data-batch-toolbar>
      <CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_BATCH_TITLE")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p data-batch-scope className="text-sm text-muted-foreground">{batchScopeText(locale, page, pageSize, selectedOnPage, rows.length)}</p>
        <p data-batch-limit className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_LIMIT")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" data-batch-select-all aria-label={frontendText(locale, "ADMIN_REVIEW_BATCH_SELECT_ALL")} disabled={frozen || rows.length === 0} onClick={batch.selectAllPage}>{frontendText(locale, "ADMIN_REVIEW_BATCH_SELECT_ALL")}</Button>
          <Button type="button" variant="outline" size="sm" data-batch-clear disabled={frozen || selectedOnPage === 0} onClick={batch.clear}>{frontendText(locale, "ADMIN_REVIEW_BATCH_CLEAR")}</Button>
        </div>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="text-sm font-medium">{frontendText(locale, "ADMIN_REVIEW_BATCH_ACTION_LABEL")}</legend>
          <Button type="button" variant={batch.decision === "reject" ? "default" : "outline"} size="sm" data-batch-action="reject" aria-pressed={batch.decision === "reject"} disabled={frozen} onClick={() => batch.setDecision("reject")}>{frontendText(locale, "ADMIN_REVIEW_BATCH_REJECT")}</Button>
          <Button type="button" variant={batch.decision === "request_revision" ? "default" : "outline"} size="sm" data-batch-action="request_revision" aria-pressed={batch.decision === "request_revision"} disabled={frozen} onClick={() => batch.setDecision("request_revision")}>{frontendText(locale, "ADMIN_REVIEW_BATCH_REQUEST_REVISION")}</Button>
        </fieldset>
        {batch.decision === "reject"
          ? <div className="space-y-1">
            <Label htmlFor={reasonId}>{frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}</Label>
            <Select value={batch.reasonCode} disabled={frozen} onValueChange={(value) => batch.setReasonCode(value)}>
              <SelectTrigger id={reasonId} data-batch-reason aria-label={frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {BATCH_REJECT_REASON_CODES.map((code) => <SelectItem key={code} value={code}>{frontendText(locale, `ADMIN_REVIEW_REASON_${code.toUpperCase()}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          : <p data-batch-reason-fixed className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_REASON_NEEDS_REVISION")}</p>}
        <div className="space-y-1">
          <Label htmlFor={noteId}>{frontendText(locale, "ADMIN_REVIEW_BATCH_NOTE")}</Label>
          <Textarea id={noteId} data-batch-note value={batch.note} disabled={frozen} aria-label={frontendText(locale, "ADMIN_REVIEW_BATCH_NOTE")} aria-describedby={`${noteId}-hint`} onChange={(event) => batch.setNote(event.target.value)} />
          <p id={`${noteId}-hint`} className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_NOTE_HINT")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" data-batch-send disabled={selectedOnPage === 0} onClick={batch.send}>{frontendText(locale, "ADMIN_REVIEW_BATCH_ACTION_LABEL")}</Button>
          {selectedOnPage === 0 && <p data-batch-none-selected className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_NONE_SELECTED")}</p>}
        </div>
        {frozen && <p data-batch-scope-lock className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_SCOPE_LOCK")}</p>}
        {pending !== null && <p data-batch-pending className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_PENDING").replace("{count}", String(pending))}</p>}
        {batch.notice && <p role="alert" data-batch-notice className="text-sm text-destructive">{batch.notice}</p>}
        <p data-batch-publish-unsupported className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_PUBLISH_UNSUPPORTED")}</p>
      </CardContent>
    </Card>
  );
}

export function ReviewBatchResults({ state, locale, onRetryFailed }: {
  state: ReviewBatchState;
  locale: LocaleRuntime;
  onRetryFailed: () => void;
}) {
  // A whole-request rejection is not a per-item outcome: the server refused the
  // batch before applying anything, and the same attempts may be re-sent as-is.
  if (state.kind === "rejected") return (
    <Alert data-batch-rejected variant="destructive" role="alert">
      <AlertTitle>{frontendText(locale, "ADMIN_REVIEW_BATCH_RESULTS_TITLE")}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
  if (state.kind !== "done") return null;
  const requested = state.outcomes.length;
  const succeeded = state.outcomes.filter((outcome) => outcome.status === "succeeded").length;
  const failed = requested - succeeded;
  return (
    <Card data-batch-results data-batch-retried={state.retried || undefined}>
      <CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_BATCH_RESULTS_TITLE")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p data-batch-summary className={failed > 0 ? "text-sm text-destructive" : "text-sm"}>
          {failed > 0
            ? frontendText(locale, "ADMIN_REVIEW_BATCH_PARTIAL").replace("{succeeded}", String(succeeded)).replace("{requested}", String(requested)).replace("{failed}", String(failed))
            : frontendText(locale, "ADMIN_REVIEW_BATCH_ALL_APPLIED").replace("{requested}", String(requested))}
        </p>
        <ul className="space-y-1 text-sm">
          {state.outcomes.map((outcome) => (
            <li key={outcome.submissionId} data-batch-outcome={outcome.submissionId} data-batch-outcome-status={outcome.status}>
              {outcome.status === "succeeded"
                ? frontendText(locale, "ADMIN_REVIEW_BATCH_ITEM_SUCCEEDED").replace("{submissionId}", outcome.submissionId)
                : frontendText(locale, "ADMIN_REVIEW_BATCH_ITEM_FAILED").replace("{submissionId}", outcome.submissionId).replace("{code}", outcome.error?.code ?? "UNKNOWN")}
            </li>
          ))}
        </ul>
        {failed > 0 && <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" data-batch-retry-failed onClick={onRetryFailed}>{frontendText(locale, "ADMIN_REVIEW_BATCH_RETRY_FAILED").replace("{count}", String(failed))}</Button>
          <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_RETRY_STABLE")}</p>
        </div>}
      </CardContent>
    </Card>
  );
}
