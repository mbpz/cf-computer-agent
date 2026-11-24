import { isCanonicalTimestamp } from "../components/review/review-detail-data";
import { BATCH_OPERATION_ID_PATTERN, validBatchReason, type BatchActionKind, type BatchItemAction } from "./review-batch-plan";
import type { BatchReviewItemOutcome } from "./admin-batch-review-data";

/**
 * A frozen batch attempt survives a refresh or a route change. It contains the
 * exact actions (operation numbers and expected versions) and, when the POST
 * answered, the per-item outcomes. It never contains credentials or notes
 * beyond what the reviewer already typed.
 */
export interface StoredBatchIntent {
  readonly version: 1;
  readonly memberId: string;
  /** Identity of this frozen attempt; old settle/clear paths must match it. */
  readonly batchId: string;
  readonly decision: BatchActionKind;
  readonly reasonCode: string;
  readonly note: string;
  readonly attempts: readonly BatchItemAction[];
  readonly outcomes: readonly BatchReviewItemOutcome[] | null;
  /** The subset sent by the current retry; absent means the whole batch. */
  readonly inflight?: readonly BatchItemAction[] | null;
  readonly status: "pending" | "unknown" | "done";
  readonly savedAt: string;
}

const KEY_PREFIX = "memory-garden:review-batch-intent:v1:";
const key = (memberId: string) => `${KEY_PREFIX}${memberId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAction(value: unknown): BatchItemAction | null {
  if (!isRecord(value)) return null;
  const { submissionId, action, reasonCode, note, operationId, expectedUpdatedAt } = value;
  if (typeof submissionId !== "string" || !submissionId || (action !== "reject" && action !== "request_revision")) return null;
  if (typeof reasonCode !== "string" || !validBatchReason(action, reasonCode)) return null;
  if (typeof note !== "string" || typeof expectedUpdatedAt !== "string" || !isCanonicalTimestamp(expectedUpdatedAt)) return null;
  if (typeof operationId !== "string" || !BATCH_OPERATION_ID_PATTERN.test(operationId)) return null;
  return { submissionId, action, reasonCode, note, operationId, expectedUpdatedAt };
}

function parseOutcome(value: unknown): BatchReviewItemOutcome | null {
  if (!isRecord(value)) return null;
  const { submissionId, action, status } = value;
  if (typeof submissionId !== "string" || (action !== "reject" && action !== "request_revision")) return null;
  if (status !== "succeeded" && status !== "failed") return null;
  if (status === "succeeded") return { submissionId, action, status, ...(value.result === undefined ? {} : { result: value.result }) };
  const error = isRecord(value.error) ? value.error : null;
  if (!error || typeof error.code !== "string" || typeof error.status !== "number" || typeof error.retryable !== "boolean") return null;
  return { submissionId, action, status, error: { code: error.code, status: error.status, retryable: error.retryable } };
}

export function loadBatchIntent(memberId: string): StoredBatchIntent | null {
  if (!memberId) return null;
  try {
    const raw = sessionStorage.getItem(key(memberId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.memberId !== memberId) return null;
    // Legacy records written before batch identity existed: adopt one stable id
    // once, persist the migration, and treat an abandoned pending write as unknown.
    const legacy = typeof value.batchId !== "string" || !value.batchId;
    const batchId = legacy ? crypto.randomUUID() : value.batchId as string;
    const decision = value.decision;
    const status = value.status;
    if (decision !== "reject" && decision !== "request_revision") return null;
    if (status !== "pending" && status !== "unknown" && status !== "done") return null;
    const migratedStatus = status === "pending" ? "unknown" as const : status;
    if (typeof value.reasonCode !== "string" || typeof value.note !== "string" || !Array.isArray(value.attempts)) return null;
    const attempts = value.attempts.map(parseAction);
    if (attempts.some((action) => !action)) return null;
    const outcomes = value.outcomes === null ? null : Array.isArray(value.outcomes) ? value.outcomes.map(parseOutcome) : undefined;
    if (outcomes === undefined || outcomes?.some((outcome) => !outcome)) return null;
    let inflight: BatchItemAction[] | null = null;
    if (value.inflight !== undefined && value.inflight !== null) {
      if (!Array.isArray(value.inflight)) return null;
      const parsed = value.inflight.map(parseAction);
      if (parsed.some((action) => !action)) return null;
      inflight = parsed as BatchItemAction[];
    }
    const intent: StoredBatchIntent = {
      version: 1, memberId, batchId, decision, reasonCode: value.reasonCode, note: value.note,
      attempts: attempts as BatchItemAction[], outcomes: outcomes as BatchReviewItemOutcome[] | null,
      inflight, status: migratedStatus, savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date(0).toISOString(),
    };
    if (legacy || status !== migratedStatus) writeIntent(intent);
    return intent;
  } catch {
    return null;
  }
}

function writeIntent(intent: StoredBatchIntent): boolean {
  try { sessionStorage.setItem(key(intent.memberId), JSON.stringify(intent)); return true; } catch { return false; }
}

/** Creates a batch only when the slot is free or holds an already-finished batch. */
export function beginBatchIntent(intent: StoredBatchIntent): boolean {
  try {
    const current = loadBatchIntent(intent.memberId);
    if (current && current.batchId !== intent.batchId && current.status !== "done") return false;
    return writeIntent(intent);
  } catch { return false; }
}

/** Updates only the batch that still owns the slot; a removed record is never rebuilt. */
export function updateBatchIntent(intent: StoredBatchIntent): boolean {
  try {
    const current = loadBatchIntent(intent.memberId);
    if (!current || current.batchId !== intent.batchId) return false;
    return writeIntent(intent);
  } catch { return false; }
}

/** Clears only the batch that owns the slot; a missing record is not a success for an old callback. */
export function clearBatchIntent(memberId: string, batchId: string): boolean {
  try {
    const current = loadBatchIntent(memberId);
    if (!current || current.batchId !== batchId) return false;
    sessionStorage.removeItem(key(memberId));
    return true;
  } catch { return false; }
}
