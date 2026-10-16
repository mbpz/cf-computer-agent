import { isCanonicalTimestamp, validReviewNote } from "../components/review/review-detail-data";

/**
 * Pure planning for the administrator batch review surface. No fetch and no
 * React live here: the caller owns the selection and the durable operation
 * numbers, this module owns the shape of a batch and which attempts a retry may
 * resend.
 */

/** The two decisions batch review may apply. Publishing is deliberately absent. */
export type BatchActionKind = "reject" | "request_revision";

/**
 * One planned write for one selected submission. `operationId` is stable across
 * retries and `expectedUpdatedAt` is the version the row was read at, so a
 * replay under the same number is answered by the server's recorded result
 * instead of being applied twice.
 */
export interface BatchItemAction {
  readonly submissionId: string;
  readonly action: BatchActionKind;
  readonly reasonCode: string;
  readonly note: string;
  readonly operationId: string;
  readonly expectedUpdatedAt: string;
}

/** The minimum a row must expose to be planned: its id and the authoritative version. */
export interface BatchPlannableRow {
  readonly id: string;
  readonly updatedAt?: string;
}

/** Why a batch could not be planned; never a reason to send a write. */
export type BatchPlanDiagnosticCode =
  | "BATCH_PLAN_SELECTION_EMPTY"
  | "BATCH_PLAN_VERSION_MISSING"
  | "BATCH_PLAN_REASON_INVALID"
  | "BATCH_PLAN_NOTE_INVALID";

export type BatchPlan =
  | { readonly kind: "planned"; readonly actions: readonly BatchItemAction[] }
  /** `submissionIds` names the rows responsible; empty when the fault is not row-local. */
  | { readonly kind: "unplannable"; readonly code: BatchPlanDiagnosticCode; readonly submissionIds: readonly string[] };

/** The operation-number grammar the batch endpoints accept. */
export const BATCH_OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/** The reason codes each batch action accepts, mirroring the single-item routes. */
export const BATCH_REJECT_REASON_CODES = ["not_relevant", "duplicate", "unsafe"] as const;
export const BATCH_REVISION_REASON_CODE = "needs_revision";

export function validBatchReason(decision: BatchActionKind, reasonCode: string): boolean {
  if (typeof reasonCode !== "string") return false;
  return decision === "request_revision"
    ? reasonCode === BATCH_REVISION_REASON_CODE
    : (BATCH_REJECT_REASON_CODES as readonly string[]).includes(reasonCode);
}

function newOperationId(): string {
  return `batch.${globalThis.crypto.randomUUID()}`;
}

/**
 * One action per selected row. A fresh operation number is allocated per row and
 * kept in `operationIds` (keyed by submission id) so a later retry reuses the
 * exact same number; a row whose version is not a canonical instant makes the
 * whole batch unplannable rather than sending a write without a precondition.
 */
export function planBatchActions(
  rows: readonly BatchPlannableRow[],
  decision: BatchActionKind,
  reasonCode: string,
  note: string,
  operationIds: Map<string, string>,
): BatchPlan {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { kind: "unplannable", code: "BATCH_PLAN_SELECTION_EMPTY", submissionIds: [] };
  }
  if (!validBatchReason(decision, reasonCode)) {
    return { kind: "unplannable", code: "BATCH_PLAN_REASON_INVALID", submissionIds: [] };
  }
  if (!validReviewNote(note)) {
    return { kind: "unplannable", code: "BATCH_PLAN_NOTE_INVALID", submissionIds: [] };
  }
  const unversioned = rows.filter((row) => !isCanonicalTimestamp(row.updatedAt)).map((row) => row.id);
  if (unversioned.length > 0) {
    return { kind: "unplannable", code: "BATCH_PLAN_VERSION_MISSING", submissionIds: unversioned };
  }
  const actions = rows.flatMap((row): BatchItemAction[] => {
    if (!isCanonicalTimestamp(row.updatedAt)) return [];
    const remembered = operationIds.get(row.id);
    const operationId = remembered && BATCH_OPERATION_ID_PATTERN.test(remembered) ? remembered : newOperationId();
    operationIds.set(row.id, operationId);
    return [Object.freeze({ submissionId: row.id, action: decision, reasonCode, note, operationId, expectedUpdatedAt: row.updatedAt })];
  });
  return { kind: "planned", actions };
}

/** The minimum an outcome must expose for a retry to be derived from it. */
export interface BatchOutcomeStatus {
  readonly submissionId: string;
  readonly status: "succeeded" | "failed";
}

/**
 * Exactly the attempts whose outcome failed, in the order they were sent, each
 * still carrying its ORIGINAL operation number and version. A succeeded item is
 * never included, so a retry can only ever replay the failures.
 */
export function failedRetryActions(
  outcomes: readonly BatchOutcomeStatus[],
  attempts: readonly BatchItemAction[],
): BatchItemAction[] {
  const failed = new Set(outcomes.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.submissionId));
  if (failed.size === 0) return [];
  return attempts.filter((attempt) => failed.has(attempt.submissionId));
}

export interface BatchScope {
  /** The current page number the selection was made on. */
  readonly page: number;
  /** How many rows on that page are currently selected. */
  readonly selected: number;
  /** How many rows the current page holds. */
  readonly pageCount: number;
}

/**
 * The substitutions for `ADMIN_REVIEW_BATCH_SCOPE`. The window size (`pageSize`)
 * is part of the page identity a caller reads the rows from, so it is accepted
 * here even though the statement itself names the row count.
 */
export function batchScope(page: number, pageSize: number, selected: number, pageCount: number): BatchScope {
  void pageSize;
  return { page, selected, pageCount };
}
