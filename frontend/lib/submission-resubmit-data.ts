import { apiFetch, type Fetcher } from "./api";
import { createIdempotencyKey } from "../components/submissions/submission-form-model";
import { validateSubmissionTarget, type SimilarSubmissionCandidate, type SubmissionTarget } from "./submission-data";
import { loadMySubmissionsPage, type MySubmissionsPageResult } from "./my-submissions-data";
import type { SubmissionDraftFields } from "./submission-draft-data";

/**
 * Resubmission of a returned (revision-requested) submission through
 * `POST /api/submissions/:id/resubmit`.
 *
 * The server accepts a resubmission only while the prior row's status is
 * `revision_requested` (`src/submissions/repository.ts:findResubmittable`) and
 * treats the idempotency key as the identity of the attempt: the same key
 * replays the recorded submission, a different key creates another row. So the
 * key lives in this record, journaled before the request and reused by every
 * retry of the same attempt.
 */

export type ResubmitStatus = "draft" | "review_pending" | "published" | "rejected" | "revision_requested";

/** The returned item the member opens for editing, read from `/api/submissions/mine`. */
export interface ResubmitSource {
  id: string;
  title: string;
  kind: SubmissionDraftFields["mode"];
  content: string;
  target: SubmissionTarget;
  reviewNote?: string;
}

export interface ResubmitRecord {
  version: 1;
  priorId: string;
  key: string;
  draft: SubmissionDraftFields;
  target: SubmissionTarget | null;
  state: "editing" | "submitted";
  /** The reviewer's stated reason for the return, kept for context while editing. */
  reviewNote?: string;
  /** Set only after a resubmission the server confirmed. */
  submissionId?: string;
  /** Kept when the member explicitly starts another edit of the same item. */
  lastSubmissionId?: string;
  startedAt: string;
}

export type ResubmitLoad = { kind: "empty" | "unavailable" | "invalid" } | { kind: "ready"; record: ResubmitRecord };

export interface ResubmitResult {
  id: string;
  status: ResubmitStatus;
  similarCandidates: SimilarSubmissionCandidate[];
}

export interface ResubmitReconciliation {
  kind: "resolved" | "resend" | "pending";
  submissionId?: string;
  status?: ResubmitStatus;
}

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RequestOptions = { requester?: Fetcher; signal?: AbortSignal };
const RESUBMIT_PREFIX = "personal-workbench:submission-resubmit:v1";

export function loadResubmitRecord(memberId: string, storage?: StoragePort): ResubmitLoad {
  const key = storageKey(memberId);
  if (!key) return { kind: "invalid" };
  try {
    const raw = (storage ?? browserStorage()).getItem(key);
    if (raw === null) return { kind: "empty" };
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { kind: "invalid" };
    }
    return validRecord(value) ? { kind: "ready", record: copyRecord(value) } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

export function saveResubmitRecord(memberId: string, record: ResubmitRecord, storage?: StoragePort): boolean {
  const key = storageKey(memberId);
  if (!key || !validRecord(record)) return false;
  try {
    (storage ?? browserStorage()).setItem(key, JSON.stringify(copyRecord(record)));
    return true;
  } catch {
    return false;
  }
}

/** Clears the record only when it still belongs to the prior submission this caller names. */
export function clearResubmitRecord(memberId: string, priorId: string, storage?: StoragePort): boolean {
  const key = storageKey(memberId);
  if (!key) return false;
  try {
    const target = storage ?? browserStorage();
    const current = loadResubmitRecord(memberId, target);
    if (current.kind === "empty") return true;
    if (current.kind !== "ready" || current.record.priorId !== priorId) return false;
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether this tab is currently editing a returned item. The marker lives in
 * session storage, so a reload keeps the editor open (the record is in local
 * storage) while a later visit in a new session opens the ordinary composer
 * instead of silently hijacking it. The record itself is never deleted here:
 * its key is what keeps a repeated attempt from creating a second record.
 */
export function openResubmission(memberId: string, priorId: string, storage?: StoragePort): boolean {
  const key = openStorageKey(memberId);
  if (!key) return false;
  try {
    (storage ?? browserSessionStorage()).setItem(key, priorId);
    return true;
  } catch {
    return false;
  }
}

export function closeResubmission(memberId: string, storage?: StoragePort): void {
  const key = openStorageKey(memberId);
  if (!key) return;
  try {
    (storage ?? browserSessionStorage()).removeItem(key);
  } catch {
    // Best effort: a stale marker only means the editor reopens where it was.
  }
}

export function isResubmissionOpen(memberId: string, priorId: string, storage?: StoragePort): boolean {
  const key = openStorageKey(memberId);
  if (!key) return false;
  try {
    return (storage ?? browserSessionStorage()).getItem(key) === priorId;
  } catch {
    return false;
  }
}

/**
 * Opens a returned item for editing. A record already open for this item is
 * reused with its key, so re-entering the editor never mints a second attempt;
 * a confirmed resubmission is returned as-is until the member explicitly
 * restarts the edit.
 */
export function beginResubmission(memberId: string, source: ResubmitSource, storages?: { records?: StoragePort; session?: StoragePort }): ResubmitRecord | null {
  const existing = loadResubmitRecord(memberId, storages?.records);
  if (existing.kind === "ready" && existing.record.priorId === source.id) {
    openResubmission(memberId, source.id, storages?.session);
    return existing.record;
  }
  if (!validSource(source)) return null;
  const record: ResubmitRecord = {
    version: 1,
    priorId: source.id,
    key: createIdempotencyKey(),
    draft: { mode: source.kind, title: source.title, content: source.content },
    target: source.target,
    state: "editing",
    ...(source.reviewNote ? { reviewNote: source.reviewNote } : {}),
    startedAt: new Date().toISOString(),
  };
  if (!saveResubmitRecord(memberId, record, storages?.records)) return null;
  openResubmission(memberId, source.id, storages?.session);
  return record;
}

/**
 * Starts another edit of the same returned item after a confirmed
 * resubmission. This is an explicit new attempt, so it gets its own key; the
 * earlier submission id is retained as a receipt.
 */
export function restartResubmission(memberId: string, record: ResubmitRecord, storage?: StoragePort): ResubmitRecord | null {
  if (!validRecord(record)) return null;
  const receipt = record.submissionId ?? record.lastSubmissionId;
  const next: ResubmitRecord = {
    version: 1,
    priorId: record.priorId,
    key: createIdempotencyKey(),
    draft: { ...record.draft },
    target: record.target,
    state: "editing",
    ...(receipt ? { lastSubmissionId: receipt } : {}),
    startedAt: new Date().toISOString(),
  };
  return saveResubmitRecord(memberId, next, storage) ? next : null;
}

export function withResubmitEdits(record: ResubmitRecord, draft: SubmissionDraftFields, target: SubmissionTarget | null): ResubmitRecord {
  return { ...record, draft: { ...draft }, target: target ? { ...target } : null };
}

export function withResubmitResult(record: ResubmitRecord, result: ResubmitResult): ResubmitRecord {
  return { ...record, state: "submitted", submissionId: result.id };
}

/** POST the resubmission with the record's journaled key. */
export async function resubmitSubmission(record: ResubmitRecord, options: RequestOptions = {}): Promise<ResubmitResult> {
  const { requester = fetch, signal } = options;
  if (!validRecord(record)) throw new Error("SUBMISSION_RESUBMIT_INVALID");
  const title = record.draft.title.trim();
  if (!title || !record.draft.content.trim()) throw new Error("SUBMISSION_DRAFT_INVALID");
  const destination = record.target === null ? null : validateSubmissionTarget(record.target);
  const response = await apiFetch<unknown>(`/api/submissions/${encodeURIComponent(record.priorId)}/resubmit`, {
    requester,
    signal,
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": record.key },
    body: JSON.stringify({
      ...(destination === null ? {} : destination),
      kind: record.draft.mode,
      title,
      content: record.draft.content,
    }),
  });
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("SUBMISSION_RESPONSE_INVALID");
  const submission = (response as Record<string, unknown>).submission;
  if (!submission || typeof submission !== "object" || Array.isArray(submission)) throw new Error("SUBMISSION_RESPONSE_INVALID");
  const row = submission as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(row.id) || !isResubmitStatus(row.status)) {
    throw new Error("SUBMISSION_RESPONSE_INVALID");
  }
  return { id: row.id, status: row.status, similarCandidates: similarCandidates((response as Record<string, unknown>).similarCandidates) };
}

/**
 * Reads the authoritative status of one of the member's own submissions. The
 * list is the only member-readable projection of a submission, so a missing row
 * is reported as such instead of being guessed.
 */
export async function readSubmissionStatus(submissionId: string, options: RequestOptions = {}): Promise<{ status: ResubmitStatus; title: string } | null> {
  const page: MySubmissionsPageResult = await loadMySubmissionsPage({ page: 1, pageSize: 20, requester: options.requester ?? fetch, signal: options.signal });
  const item = page.items.find((candidate) => candidate.id === submissionId);
  if (!item || !item.status || !isResubmitStatus(item.status)) return null;
  return { status: item.status, title: item.title ?? "" };
}

/**
 * Reconciles a resubmission whose outcome was never observed: a row that
 * supersedes this prior item proves the journaled key already landed, so the
 * same key is never replayed blindly. Anything not found on the newest page is
 * reported as not landed (a resubmission is always the newest row).
 */
export async function resolveResubmission(priorId: string, options: RequestOptions = {}): Promise<ResubmitReconciliation> {
  try {
    const page: MySubmissionsPageResult = await loadMySubmissionsPage({ page: 1, pageSize: 20, requester: options.requester ?? fetch, signal: options.signal });
    const superseding = page.items.find((item) => item.supersedes === priorId);
    if (!superseding) return { kind: "resend" };
    return {
      kind: "resolved",
      submissionId: superseding.id,
      ...(superseding.status && isResubmitStatus(superseding.status) ? { status: superseding.status } : {}),
    };
  } catch {
    return { kind: "pending" };
  }
}

function isResubmitStatus(value: unknown): value is ResubmitStatus {
  return value === "draft" || value === "review_pending" || value === "published" || value === "rejected" || value === "revision_requested";
}

function similarCandidates(value: unknown): SimilarSubmissionCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const row = candidate as Record<string, unknown>;
    if (typeof row.submissionId !== "string" || typeof row.sourceId !== "string" || typeof row.sourceVersionId !== "string"
      || typeof row.title !== "string" || typeof row.similarity !== "number" || !Number.isFinite(row.similarity)) return [];
    return [{ submissionId: row.submissionId, sourceId: row.sourceId, sourceVersionId: row.sourceVersionId, title: row.title, similarity: row.similarity }];
  });
}

function validSource(source: ResubmitSource): boolean {
  return /^[A-Za-z0-9_-]{1,200}$/u.test(source.id)
    && (source.kind === "text" || source.kind === "markdown" || source.kind === "code")
    && typeof source.title === "string" && typeof source.content === "string"
    && new TextEncoder().encode(source.content).byteLength <= 131072
    && validTarget(source.target);
}

function validTarget(value: unknown): value is SubmissionTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    validateSubmissionTarget(value as SubmissionTarget);
    return true;
  } catch {
    return false;
  }
}

function validRecord(value: unknown): value is ResubmitRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return false;
  if (typeof record.priorId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(record.priorId)) return false;
  if (typeof record.key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(record.key)) return false;
  if (record.state !== "editing" && record.state !== "submitted") return false;
  if (record.state === "submitted" && (typeof record.submissionId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(record.submissionId))) return false;
  if (record.submissionId !== undefined && (typeof record.submissionId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(record.submissionId))) return false;
  if (record.lastSubmissionId !== undefined && (typeof record.lastSubmissionId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(record.lastSubmissionId))) return false;
  if (typeof record.startedAt !== "string" || !Number.isFinite(Date.parse(record.startedAt))) return false;
  if (record.reviewNote !== undefined && (typeof record.reviewNote !== "string" || record.reviewNote.length > 4000)) return false;
  if (record.target !== null && !validTarget(record.target)) return false;
  const draft = record.draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  const fields = draft as Record<string, unknown>;
  return (fields.mode === "text" || fields.mode === "markdown" || fields.mode === "code")
    && typeof fields.title === "string" && new TextEncoder().encode(fields.title).byteLength <= 512
    && typeof fields.content === "string" && new TextEncoder().encode(fields.content).byteLength <= 131072;
}

function copyRecord(record: ResubmitRecord): ResubmitRecord {
  return {
    version: 1,
    priorId: record.priorId,
    key: record.key,
    draft: { ...record.draft },
    target: record.target ? { ...record.target } : null,
    state: record.state,
    ...(record.reviewNote ? { reviewNote: record.reviewNote } : {}),
    ...(record.submissionId ? { submissionId: record.submissionId } : {}),
    ...(record.lastSubmissionId ? { lastSubmissionId: record.lastSubmissionId } : {}),
    startedAt: record.startedAt,
  };
}

function storageKey(memberId: string): string | null {
  if (typeof memberId !== "string" || !memberId.trim() || new TextEncoder().encode(memberId).byteLength > 512) return null;
  try {
    return `${RESUBMIT_PREFIX}:${encodeURIComponent(memberId)}`;
  } catch {
    return null;
  }
}

function openStorageKey(memberId: string): string | null {
  const key = storageKey(memberId);
  return key === null ? null : `${key}:open`;
}

function browserSessionStorage(): StoragePort {
  const storage = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!storage) throw new Error("SUBMISSION_STORAGE_UNAVAILABLE");
  return storage;
}

function browserStorage(): StoragePort {
  const storage = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage;
  if (!storage) throw new Error("SUBMISSION_STORAGE_UNAVAILABLE");
  return storage;
}
