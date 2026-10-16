import { apiFetch, type Fetcher } from "./api";
import { isCanonicalTimestamp, validReviewNote } from "../components/review/review-detail-data";
import { BATCH_OPERATION_ID_PATTERN, validBatchReason, type BatchActionKind, type BatchItemAction } from "./review-batch-plan";

/** One per-submission outcome of a batch request; the summary is derived from these. */
export interface BatchReviewItemOutcome {
  readonly submissionId: string;
  readonly action: BatchActionKind;
  readonly status: "succeeded" | "failed";
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly status: number; readonly retryable: boolean };
}

export interface BatchReviewResult {
  readonly requested: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly items: readonly BatchReviewItemOutcome[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function invalidResponse(): never {
  throw new Error("BATCH_REVIEW_RESPONSE_INVALID");
}

/**
 * Fail closed on anything that does not match the contract: the reported counts
 * are recomputed from the items themselves, every item must answer one of the
 * actions that were sent (exactly once), and a failed item must carry the
 * server's own `error`.
 */
export function normalizeBatchReview(input: unknown, actions: readonly BatchItemAction[]): BatchReviewResult {
  if (!isRecord(input)) invalidResponse();
  const { requested, succeeded, failed, items } = input;
  if (!isNonNegativeInteger(requested) || !isNonNegativeInteger(succeeded) || !isNonNegativeInteger(failed)) invalidResponse();
  if (!Array.isArray(items) || items.length !== actions.length) invalidResponse();
  const sentBySubmission = new Map(actions.map((action) => [action.submissionId, action]));
  const seen = new Set<string>();
  const outcomes = items.map((value: unknown): BatchReviewItemOutcome => {
    if (!isRecord(value)) invalidResponse();
    const submissionId = value.submissionId;
    if (typeof submissionId !== "string") invalidResponse();
    const sent = sentBySubmission.get(submissionId);
    if (!sent || seen.has(submissionId)) invalidResponse();
    if (value.action !== sent.action) invalidResponse();
    if (value.status === "succeeded") {
      seen.add(submissionId);
      return { submissionId, action: sent.action, status: "succeeded", ...(value.result === undefined ? {} : { result: value.result }) };
    }
    if (value.status !== "failed") invalidResponse();
    const error = isRecord(value.error) ? value.error : null;
    if (!error || typeof error.code !== "string" || error.code.length === 0
      || !isNonNegativeInteger(error.status) || typeof error.retryable !== "boolean") invalidResponse();
    seen.add(submissionId);
    return { submissionId, action: sent.action, status: "failed", error: { code: error.code, status: error.status, retryable: error.retryable } };
  });
  // The counts are never trusted from the payload alone: a server whose totals
  // disagree with its own items is malformed, and a summary shown from it would
  // lie about what was applied.
  const derivedSucceeded = outcomes.filter((outcome) => outcome.status === "succeeded").length;
  const derivedFailed = outcomes.length - derivedSucceeded;
  if (requested !== outcomes.length || succeeded !== derivedSucceeded || failed !== derivedFailed) invalidResponse();
  return { requested: outcomes.length, succeeded: derivedSucceeded, failed: derivedFailed, items: outcomes };
}

function assertBatchAction(action: BatchItemAction): void {
  if (!isRecord(action)) throw new Error("BATCH_REVIEW_REQUEST_INVALID");
  if (typeof action.submissionId !== "string" || action.submissionId.length === 0) throw new Error("BATCH_REVIEW_REQUEST_INVALID");
  if (action.action !== "reject" && action.action !== "request_revision") throw new Error("BATCH_REVIEW_REQUEST_INVALID");
  if (!validBatchReason(action.action, action.reasonCode)) throw new Error("BATCH_REVIEW_REQUEST_INVALID");
  if (typeof action.note !== "string" || !validReviewNote(action.note)) throw new Error("BATCH_REVIEW_REQUEST_INVALID");
  if (!BATCH_OPERATION_ID_PATTERN.test(action.operationId) || !isCanonicalTimestamp(action.expectedUpdatedAt)) throw new Error("BATCH_REVIEW_REQUEST_INVALID");
}

/**
 * One request for a whole batch. A malformed body (or an identity the server
 * rejects) is a WHOLE-request failure and surfaces as the `ApiRequestError`
 * thrown by `apiFetch`; per-item outcomes are only ever the 200 response.
 */
export async function sendBatchReview(actions: readonly BatchItemAction[], requester: Fetcher = fetch): Promise<BatchReviewResult> {
  if (!Array.isArray(actions) || actions.length === 0) throw new Error("BATCH_REVIEW_REQUEST_INVALID");
  for (const action of actions) assertBatchAction(action);
  const payload = await apiFetch<unknown>("/api/admin/submissions/batch-review", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actions }),
  });
  return normalizeBatchReview(payload, actions);
}
