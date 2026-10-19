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
  BATCH_REJECT_REASON_CODES, BATCH_REVISION_REASON_CODE, batchScope, failedRetryActions, planBatchActions,
  type BatchActionKind, type BatchItemAction, type BatchPlanDiagnosticCode, type BatchPlannableRow,
} from "../../lib/review-batch-plan";
import { sendBatchReview, type BatchReviewItemOutcome } from "../../lib/admin-batch-review-data";

/** The batch surface state machine: nothing, applying, per-item outcomes, or a refusal. */
export type ReviewBatchState =
  | { kind: "idle" }
  | { kind: "pending"; count: number }
  | { kind: "done"; outcomes: readonly BatchReviewItemOutcome[]; attempts: readonly BatchItemAction[]; retried: boolean }
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
  /** A refusal notice (locked send, unplannable batch or whole-request failure). */
  readonly notice: string | null;
  /** True while a batch is in flight; the selection is frozen. */
  readonly freeze: boolean;
  send: () => void;
  retryFailed: () => void;
}

export interface UseReviewBatchInput {
  /** The rows of the CURRENT page; a selection never reaches across pages. */
  items: readonly BatchPlannableRow[];
  memberId?: string;
  locale: LocaleRuntime;
  /** False unless the reviewer holds `knowledge:review`: then no batch affordance exists. */
  enabled: boolean;
  requester?: Fetcher;
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
export function useReviewBatch({ items, memberId, locale, enabled, requester = fetch, onSettled }: UseReviewBatchInput): ReviewBatchController {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [decision, setDecisionState] = useState<BatchActionKind>("reject");
  const [reasonCode, setReasonCodeState] = useState<string>(defaultReason("reject"));
  const [note, setNoteState] = useState<string>("");
  const [state, setState] = useState<ReviewBatchState>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const operationIdsRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef(false);

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
      if (next.has(submissionId)) next.delete(submissionId); else next.add(submissionId);
      return next;
    });
  }, []);
  const selectAllPage = useCallback(() => {
    if (pendingRef.current) return;
    setSelected(new Set(items.map((item) => item.id)));
  }, [items]);
  const clear = useCallback(() => { if (pendingRef.current) return; setSelected(new Set()); }, []);
  const setDecision = useCallback((next: BatchActionKind) => {
    if (pendingRef.current) return;
    setDecisionState(next); setReasonCodeState(defaultReason(next));
  }, []);
  const setReasonCode = useCallback((next: string) => { if (!pendingRef.current) setReasonCodeState(next); }, []);
  const setNote = useCallback((next: string) => { if (!pendingRef.current) setNoteState(boundNote(next)); }, []);

  const send = useCallback(async () => {
    if (!enabled) return;
    if (pendingRef.current) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_LOCKED")); return; }
    const selectedRows = items.filter((item) => selected.has(item.id));
    if (selectedRows.length === 0) return;
    const plan = planBatchActions(selectedRows, decision, reasonCode, note, operationIdsRef.current);
    if (plan.kind === "unplannable") { setNotice(diagnosticMessage(plan.code, locale)); return; }
    setNotice(null);
    pendingRef.current = true;
    setState({ kind: "pending", count: plan.actions.length });
    try {
      const result = await sendBatchReview(plan.actions, requester);
      setState({ kind: "done", outcomes: result.items, attempts: plan.actions, retried: false });
      onSettled?.(result.items);
    } catch (error) {
      setState({ kind: "rejected", message: batchFailureMessage(error, locale) });
    } finally {
      pendingRef.current = false;
    }
  }, [decision, enabled, items, locale, note, onSettled, reasonCode, requester, selected]);

  const retryFailed = useCallback(async () => {
    if (!enabled) return;
    if (pendingRef.current) { setNotice(frontendText(locale, "ADMIN_REVIEW_BATCH_LOCKED")); return; }
    if (state.kind !== "done") return;
    const retryActions = failedRetryActions(state.outcomes, state.attempts);
    if (retryActions.length === 0) return;
    setNotice(null);
    pendingRef.current = true;
    setState({ kind: "pending", count: retryActions.length });
    try {
      const result = await sendBatchReview(retryActions, requester);
      const outcomes = mergeOutcomes(state.outcomes, result.items);
      setState({ kind: "done", outcomes, attempts: state.attempts, retried: true });
      onSettled?.(outcomes);
    } catch (error) {
      // The earlier outcomes remain true; only this attempt's transport failed.
      setNotice(batchFailureMessage(error, locale));
      setState({ kind: "done", outcomes: state.outcomes, attempts: state.attempts, retried: true });
    } finally {
      pendingRef.current = false;
    }
  }, [enabled, locale, onSettled, requester, state]);

  return { selected, toggle, selectAllPage, clear, decision, setDecision, reasonCode, setReasonCode, note, setNote, state, notice, freeze: frozen, send, retryFailed };
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
