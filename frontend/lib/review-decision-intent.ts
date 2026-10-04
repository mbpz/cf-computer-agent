import { validReviewNote, type ReviewDecision, type ReviewOperation } from "../components/review/review-detail-data";

export type StoredReviewDecision = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: ReviewOperation };
const storageKey = (memberId: string, submissionId: string) => `memory-garden:review-decision:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(submissionId)}`;
const idPattern = /^[A-Za-z0-9_-]+$/u;
const actions = new Set<ReviewDecision>(["publish", "reject", "request_changes"]);
function isId(value: unknown): value is string { return typeof value === "string" && idPattern.test(value); }
function expectedPath(id: string, action: ReviewDecision): string {
  const path = action === "request_changes" ? "request-revision" : action;
  return `/api/admin/submissions/${encodeURIComponent(id)}/${path}`;
}
function validBody(action: ReviewDecision, body: string): boolean {
  if (body.length > 16000) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return false; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  if (action === "publish") {
    return Object.keys(record).length === 5
      && typeof record.title === "string" && record.title.length <= 500 && !record.title.includes("\u0000")
      && (record.visibility === "shared" || record.visibility === "admin_only")
      && isId(record.spaceId)
      && (record.collectionId === null || isId(record.collectionId))
      && Array.isArray(record.tagIds) && record.tagIds.length <= 50 && record.tagIds.every(isId);
  }
  const reason = record.reasonCode;
  const noteOk = typeof record.note === "string" && validReviewNote(record.note);
  return Object.keys(record).length === 2 && noteOk && (
    action === "request_changes" ? reason === "needs_revision" : reason === "not_relevant" || reason === "duplicate" || reason === "unsafe"
  );
}
export function validReviewDecision(value: unknown): value is ReviewOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || !isId(record.id) || typeof record.action !== "string" || !actions.has(record.action as ReviewDecision)) return false;
  const action = record.action as ReviewDecision;
  return record.path === expectedPath(record.id, action) && typeof record.body === "string" && validBody(action, record.body);
}
function same(left: ReviewOperation, right: ReviewOperation): boolean {
  return left.id === right.id && left.action === right.action && left.path === right.path && left.body === right.body;
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("REVIEW_DECISION_STORAGE_UNAVAILABLE");
  return value;
}
function freezeIntent(intent: ReviewOperation): ReviewOperation {
  const next: ReviewOperation = { id: intent.id, action: intent.action, path: intent.path, body: intent.body };
  Object.freeze(next);
  return next;
}
export function loadReviewDecision(memberId: string, submissionId: string): StoredReviewDecision {
  try {
    if (!memberId || !isId(submissionId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, submissionId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 20000) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || value.submissionId !== submissionId || !validReviewDecision(value.intent)
      || (value.intent as ReviewOperation).id !== submissionId
      || Object.keys(value).length !== 4 || Object.keys(value).some((key) => !["version", "memberId", "submissionId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: freezeIntent(value.intent) };
  } catch { return { kind: "blocked" }; }
}
export function saveReviewDecision(memberId: string, submissionId: string, intent: ReviewOperation): boolean {
  try {
    const stored = { id: intent.id, action: intent.action, path: intent.path, body: intent.body };
    if (stored.id !== submissionId || !validReviewDecision(stored) || loadReviewDecision(memberId, submissionId).kind !== "empty") return false;
    storage().setItem(storageKey(memberId, submissionId), JSON.stringify({ version: 1, memberId, submissionId, intent: stored }));
    const saved = loadReviewDecision(memberId, submissionId);
    return saved.kind === "ready" && same(saved.intent, stored);
  } catch { return false; }
}
export function clearReviewDecision(memberId: string, submissionId: string, intent: ReviewOperation): boolean {
  try {
    const previous = loadReviewDecision(memberId, submissionId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId, submissionId));
    return storage().getItem(storageKey(memberId, submissionId)) === null;
  } catch { return false; }
}
export function discardBlockedReviewDecision(memberId: string, submissionId: string): boolean {
  try {
    if (!memberId || loadReviewDecision(memberId, submissionId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId, submissionId));
    return storage().getItem(storageKey(memberId, submissionId)) === null;
  } catch { return false; }
}
