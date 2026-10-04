export interface ReviewCommentIntent { readonly id: string; readonly body: string }
export type StoredReviewComment = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: ReviewCommentIntent };
const storageKey = (memberId: string, submissionId: string) => `memory-garden:review-comment:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(submissionId)}`;
const operationId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const submissionIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
function validBody(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length >= 1 && value.length <= 4000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value);
}
export function validReviewCommentIntent(value: unknown): value is ReviewCommentIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && typeof record.id === "string" && operationId.test(record.id) && validBody(record.body);
}
function same(left: ReviewCommentIntent, right: ReviewCommentIntent): boolean {
  return left.id === right.id && left.body === right.body;
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("REVIEW_COMMENT_STORAGE_UNAVAILABLE");
  return value;
}
function freezeIntent(intent: ReviewCommentIntent): ReviewCommentIntent {
  const next: ReviewCommentIntent = { id: intent.id, body: intent.body };
  Object.freeze(next);
  return next;
}
export function loadReviewCommentIntent(memberId: string, submissionId: string): StoredReviewComment {
  try {
    if (!memberId || !submissionIdPattern.test(submissionId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, submissionId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 16384) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || value.submissionId !== submissionId || !validReviewCommentIntent(value.intent)
      || Object.keys(value).length !== 4 || Object.keys(value).some((key) => !["version", "memberId", "submissionId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: freezeIntent(value.intent) };
  } catch { return { kind: "blocked" }; }
}
export function saveReviewCommentIntent(memberId: string, submissionId: string, intent: ReviewCommentIntent): boolean {
  try {
    const stored = { id: intent.id, body: intent.body };
    if (!validReviewCommentIntent(stored) || loadReviewCommentIntent(memberId, submissionId).kind !== "empty") return false;
    storage().setItem(storageKey(memberId, submissionId), JSON.stringify({ version: 1, memberId, submissionId, intent: stored }));
    const saved = loadReviewCommentIntent(memberId, submissionId);
    return saved.kind === "ready" && same(saved.intent, stored);
  } catch { return false; }
}
export function clearReviewCommentIntent(memberId: string, submissionId: string, intent: ReviewCommentIntent): boolean {
  try {
    const previous = loadReviewCommentIntent(memberId, submissionId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId, submissionId));
    return storage().getItem(storageKey(memberId, submissionId)) === null;
  } catch { return false; }
}
export function discardBlockedReviewCommentIntent(memberId: string, submissionId: string): boolean {
  try {
    if (!memberId || loadReviewCommentIntent(memberId, submissionId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId, submissionId));
    return storage().getItem(storageKey(memberId, submissionId)) === null;
  } catch { return false; }
}
