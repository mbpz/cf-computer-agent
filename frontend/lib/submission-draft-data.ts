import { apiFetch, type Fetcher } from "./api";
import { validateSubmissionTarget, type SubmissionTarget } from "./submission-data";
import type { SubmissionMode } from "../components/submissions/submission-form-model";

/**
 * Server-side submission drafts (`POST /api/submissions/drafts`,
 * `GET|PATCH|DELETE /api/submissions/drafts/:id`).
 *
 * The server draft is the authority: it is the only copy this module ever
 * reports as saved, and only a server answer lets the module say a draft is
 * gone. The local storage records here are (a) the identity of the server draft
 * this browser is editing, (b) the write intent that resolves a draft operation
 * whose outcome was never observed — a save or a discard — and (c) the text
 * mirror kept by `offline-submission-draft.ts`, which stays the synchronous,
 * unload-safe copy.
 */

const MAX_TITLE_BYTES = 512;
const MAX_CONTENT_BYTES = 131072;
const MAX_INTENT_AGE_MS = 7 * 86_400_000;

export interface SubmissionDraftFields {
  mode: SubmissionMode;
  title: string;
  content: string;
}

/** Which server draft this browser is editing, and the destination it carries. */
export interface SubmissionDraftRecord {
  version: 1;
  draftId: string | null;
  target: SubmissionTarget | null;
}

/** The exact request body a draft write sends; it is journaled verbatim. */
export interface DraftBody {
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  requestedVisibility: "shared" | "admin_only";
  kind: SubmissionMode;
  title: string;
  content: string;
}

/** A save write: it carries the exact request body it sends, journaled verbatim. */
export interface DraftSaveIntent {
  version: 1;
  op: "create" | "update";
  draftId: string | null;
  body: DraftBody;
  startedAt: string;
}

/** A discard: the id is the whole operation, so it carries no body. */
export interface DraftDiscardIntent {
  version: 1;
  op: "discard";
  draftId: string;
  body: null;
  startedAt: string;
}

/** The one draft operation this browser journals before it leaves. */
export type DraftWriteIntent = DraftSaveIntent | DraftDiscardIntent;

export interface ServerDraft {
  id: string;
  title: string;
  content: string;
  kind: SubmissionMode;
  target: SubmissionTarget;
  updatedAt: string;
}

export type DraftRecordLoad =
  | { kind: "empty" | "unavailable" | "invalid" }
  | { kind: "ready"; record: SubmissionDraftRecord };

export type DraftWriteIntentLoad =
  | { kind: "empty" | "unavailable" | "invalid" }
  | { kind: "ready"; intent: DraftWriteIntent };

/**
 * How the visitor's text is currently kept. `saved` is the only state that
 * claims the server holds the draft; every other state says the text is only in
 * this browser. `idle` says this editor has no server draft — before any text,
 * and after a discard the server confirmed.
 */
export type SubmissionDraftSaveState = {
  kind: "idle" | "saving" | "saved" | "discarding" | "unconfirmed";
  /** Why the server copy is not confirmed, or why recovery is not guaranteed. */
  reason?: "no_target" | "storage" | "error" | "unknown" | "unsaved" | "resubmit" | "discard_error" | "discard_unknown";
  /** The server's `updatedAt` for the confirmed draft. */
  at?: string;
};

/**
 * What re-reading a journaled intent proved: `resolved` is a landed save,
 * `discarded` is a landed discard (the draft the intent named is gone),
 * `resend` is a save that never landed, `recreate` is a save whose draft the
 * server no longer knows, and `pending` means nothing could be proven.
 */
export type DraftWriteResolution =
  | { kind: "resolved"; draft: ServerDraft }
  | { kind: "discarded" }
  | { kind: "resend" }
  | { kind: "recreate" }
  | { kind: "pending" };

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RequestOptions = { requester?: Fetcher; signal?: AbortSignal };

/**
 * The body for a draft write, or `null` when the draft cannot be described to
 * the server yet (no submittable destination, or fields the endpoint rejects).
 */
export function draftBody(target: SubmissionTarget | null, draft: SubmissionDraftFields): DraftBody | null {
  if (!target) return null;
  let destination: SubmissionTarget;
  try {
    destination = validateSubmissionTarget(target);
  } catch {
    return null;
  }
  const title = draft.title.trim();
  if (new TextEncoder().encode(title).byteLength > MAX_TITLE_BYTES) return null;
  if (!title && !draft.content.trim()) return null;
  if (new TextEncoder().encode(draft.content).byteLength > MAX_CONTENT_BYTES) return null;
  return {
    requestedSpaceId: destination.requestedSpaceId,
    requestedCollectionId: destination.requestedCollectionId,
    requestedVisibility: destination.requestedVisibility,
    kind: draft.mode,
    title,
    content: draft.content,
  };
}

export function loadDraftRecord(memberId: string, storage?: StoragePort): DraftRecordLoad {
  const key = storageKey(RECORD_PREFIX, memberId);
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

export function saveDraftRecord(memberId: string, record: SubmissionDraftRecord, storage?: StoragePort): boolean {
  const key = storageKey(RECORD_PREFIX, memberId);
  if (!key || !validRecord(record)) return false;
  try {
    (storage ?? browserStorage()).setItem(key, JSON.stringify(copyRecord(record)));
    return true;
  } catch {
    return false;
  }
}

export function clearDraftRecord(memberId: string, storage?: StoragePort): boolean {
  const key = storageKey(RECORD_PREFIX, memberId);
  if (!key) return false;
  try {
    (storage ?? browserStorage()).removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadDraftWriteIntent(memberId: string, storage?: StoragePort): DraftWriteIntentLoad {
  const key = storageKey(INTENT_PREFIX, memberId);
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
    return validIntent(value, Date.now()) ? { kind: "ready", intent: copyIntent(value) } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * Journals a write before it is sent. A different pending intent is never
 * overwritten, so two tabs cannot silently drop each other's recovery record.
 */
export function saveDraftWriteIntent(memberId: string, intent: DraftWriteIntent, storage?: StoragePort): boolean {
  const key = storageKey(INTENT_PREFIX, memberId);
  if (!key || !validIntent(intent)) return false;
  try {
    const target = storage ?? browserStorage();
    const existing = loadDraftWriteIntent(memberId, target);
    if (existing.kind === "ready" && existing.intent.startedAt !== intent.startedAt) return false;
    target.setItem(key, JSON.stringify(copyIntent(intent)));
    return true;
  } catch {
    return false;
  }
}

/** Clears only the intent this caller journaled. */
export function clearDraftWriteIntent(memberId: string, startedAt: string, storage?: StoragePort): boolean {
  const key = storageKey(INTENT_PREFIX, memberId);
  if (!key) return false;
  try {
    const target = storage ?? browserStorage();
    const current = loadDraftWriteIntent(memberId, target);
    if (current.kind === "empty") return true;
    if (current.kind !== "ready" || current.intent.startedAt !== startedAt) return false;
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function createDraftWriteIntent(op: "create" | "update", draftId: string | null, body: DraftBody, now?: string): DraftSaveIntent {
  return { version: 1, op, draftId, body: copyBody(body), startedAt: now ?? new Date().toISOString() };
}

/**
 * The journaled discard of one server draft. It is journaled exactly like a
 * save, so a discard whose answer was lost is re-read instead of guessed at.
 */
export function createDraftDiscardIntent(draftId: string, now?: string): DraftDiscardIntent {
  return { version: 1, op: "discard", draftId: requireDraftId(draftId), body: null, startedAt: now ?? new Date().toISOString() };
}

export function createDraftRecord(draftId: string | null, target: SubmissionTarget | null): SubmissionDraftRecord {
  return { version: 1, draftId, target };
}

/** POST a new draft, or PATCH the draft this browser already owns. */
export async function writeDraft(intent: DraftSaveIntent, options: RequestOptions = {}): Promise<ServerDraft> {
  const { requester = fetch, signal } = options;
  const response = intent.op === "create"
    ? await apiFetch<unknown>("/api/submissions/drafts", {
      requester, signal, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(intent.body),
    })
    : await apiFetch<unknown>(`/api/submissions/drafts/${encodeURIComponent(requireDraftId(intent.draftId))}`, {
      requester, signal, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(intent.body),
    });
  return normalizeServerDraft(response);
}

export async function readDraft(draftId: string, options: RequestOptions = {}): Promise<ServerDraft> {
  const { requester = fetch, signal } = options;
  return normalizeServerDraft(await apiFetch<unknown>(
    `/api/submissions/drafts/${encodeURIComponent(requireDraftId(draftId))}`,
    { requester, signal },
  ));
}

/**
 * DELETE the draft this browser owns. The endpoint is idempotent, so an answer
 * of any status below 500 proves the server either removed the draft or already
 * had it removed; an unreachable server proves nothing and throws instead.
 */
export async function discardDraft(draftId: string, options: RequestOptions = {}): Promise<void> {
  const { requester = fetch, signal } = options;
  await apiFetch<unknown>(
    `/api/submissions/drafts/${encodeURIComponent(requireDraftId(draftId))}`,
    { requester, signal, method: "DELETE" },
  );
}

/**
 * Reads the member's newest drafts to find the record a `create` write would
 * have produced. A new draft is always the newest row, so the first page is the
 * only page that can hold it; anything else is reported as not found.
 */
export async function findDraftByBody(body: DraftBody, options: RequestOptions = {}): Promise<ServerDraft | null> {
  const { requester = fetch, signal } = options;
  const payload = await apiFetch<unknown>("/api/submissions/mine?page=1&pageSize=20&status=draft", { requester, signal });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("DRAFT_RESPONSE_INVALID");
  const items = (payload as Record<string, unknown>).items;
  if (!Array.isArray(items)) throw new Error("DRAFT_RESPONSE_INVALID");
  for (const item of items) {
    let draft: ServerDraft;
    try {
      draft = normalizeServerDraft(item);
    } catch {
      continue;
    }
    if (matchesBody(draft, body)) return draft;
  }
  return null;
}

/**
 * Reconciles a journaled draft operation before it is repeated:
 * - a save that landed (the record now carries exactly the journaled fields) → resolved;
 * - a discard that landed (the record the intent named is gone) → discarded;
 * - a save whose record is gone (an owned draft id the server no longer knows) → create;
 * - a save that did not land → resend the same journaled body;
 * - the readback itself failed → pending, so nothing is sent and the visitor decides.
 */
export async function resolveDraftWriteIntent(intent: DraftWriteIntent, options: RequestOptions = {}): Promise<DraftWriteResolution> {
  try {
    if (intent.op === "discard") {
      try {
        await readDraft(intent.draftId, options);
        // The draft is still there, so the delete never landed.
        return { kind: "resend" };
      } catch (error) {
        // Only the record's own absence proves a discard landed; every other
        // failure (an unreachable server, a 5xx) proves nothing and is pending.
        const missing = error !== null && typeof error === "object" && "status" in error && error.status === 404;
        if (!missing) throw error;
        return { kind: "discarded" };
      }
    }
    if (intent.op === "update" && intent.draftId) {
      let current: ServerDraft | null = null;
      try {
        current = await readDraft(intent.draftId, options);
      } catch (error) {
        // Only an owned draft the server no longer knows means "recreate"; every
        // other failure leaves the outcome unknown.
        const missing = error !== null && typeof error === "object" && "status" in error && error.status === 404;
        if (!missing) throw error;
      }
      if (!current) return { kind: "recreate" };
      return matchesBody(current, intent.body) ? { kind: "resolved", draft: current } : { kind: "resend" };
    }
    const found = await findDraftByBody(intent.body, options);
    return found ? { kind: "resolved", draft: found } : { kind: "resend" };
  } catch {
    return { kind: "pending" };
  }
}

export function matchesBody(draft: ServerDraft, body: DraftBody): boolean {
  return draft.kind === body.kind && draft.title === body.title && draft.content === body.content
    && draft.target.requestedSpaceId === body.requestedSpaceId
    && draft.target.requestedCollectionId === body.requestedCollectionId
    && draft.target.requestedVisibility === body.requestedVisibility;
}

export function normalizeServerDraft(value: unknown): ServerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DRAFT_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(record.id)) throw new Error("DRAFT_RESPONSE_INVALID");
  if (record.status !== "draft") throw new Error("DRAFT_RESPONSE_INVALID");
  if (typeof record.title !== "string" || typeof record.content !== "string") throw new Error("DRAFT_RESPONSE_INVALID");
  if (record.kind !== "text" && record.kind !== "markdown" && record.kind !== "code") throw new Error("DRAFT_RESPONSE_INVALID");
  if (typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("DRAFT_RESPONSE_INVALID");
  const spaceId = record.requestedSpaceId;
  const collectionId = record.requestedCollectionId ?? null;
  const visibility = record.requestedVisibility;
  if (typeof spaceId !== "string") throw new Error("DRAFT_RESPONSE_INVALID");
  if (collectionId !== null && typeof collectionId !== "string") throw new Error("DRAFT_RESPONSE_INVALID");
  if (visibility !== "shared" && visibility !== "admin_only") throw new Error("DRAFT_RESPONSE_INVALID");
  const target = validateSubmissionTarget({ requestedSpaceId: spaceId, requestedCollectionId: collectionId, requestedVisibility: visibility });
  return { id: record.id, title: record.title, content: record.content, kind: record.kind, target, updatedAt: record.updatedAt };
}

function requireDraftId(value: string | null): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(value)) throw new Error("DRAFT_ID_INVALID");
  return value;
}

const RECORD_PREFIX = "personal-workbench:submission-draft:v1";
const INTENT_PREFIX = "personal-workbench:submission-draft-write:v1";

function storageKey(prefix: string, memberId: string): string | null {
  if (typeof memberId !== "string" || !memberId.trim() || new TextEncoder().encode(memberId).byteLength > 512) return null;
  try {
    return `${prefix}:${encodeURIComponent(memberId)}`;
  } catch {
    return null;
  }
}

function browserStorage(): StoragePort {
  const storage = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage;
  if (!storage) throw new Error("DRAFT_STORAGE_UNAVAILABLE");
  return storage;
}

function copyRecord(record: SubmissionDraftRecord): SubmissionDraftRecord {
  return { version: 1, draftId: record.draftId, target: record.target ? { ...record.target } : null };
}

function copyBody(body: DraftBody): DraftBody {
  return {
    requestedSpaceId: body.requestedSpaceId,
    requestedCollectionId: body.requestedCollectionId,
    requestedVisibility: body.requestedVisibility,
    kind: body.kind,
    title: body.title,
    content: body.content,
  };
}

function copyIntent(intent: DraftWriteIntent): DraftWriteIntent {
  return intent.op === "discard"
    ? { version: 1, op: "discard", draftId: intent.draftId, body: null, startedAt: intent.startedAt }
    : { version: 1, op: intent.op, draftId: intent.draftId, body: copyBody(intent.body), startedAt: intent.startedAt };
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
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

function validRecord(value: unknown): value is SubmissionDraftRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return false;
  if (record.draftId !== null && !boundedId(record.draftId)) return false;
  return record.target === null || validTarget(record.target);
}

function validBody(value: unknown): value is DraftBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return boundedId(body.requestedSpaceId)
    && (body.requestedCollectionId === null || boundedId(body.requestedCollectionId))
    && (body.requestedVisibility === "shared" || body.requestedVisibility === "admin_only")
    && (body.kind === "text" || body.kind === "markdown" || body.kind === "code")
    && typeof body.title === "string" && new TextEncoder().encode(body.title).byteLength <= MAX_TITLE_BYTES
    && typeof body.content === "string" && new TextEncoder().encode(body.content).byteLength <= MAX_CONTENT_BYTES;
}

function validIntent(value: unknown, now = Date.now()): value is DraftWriteIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  if (intent.version !== 1) return false;
  if (intent.op !== "create" && intent.op !== "update" && intent.op !== "discard") return false;
  if (intent.draftId !== null && !boundedId(intent.draftId)) return false;
  // Only a create writes a draft the server may not have named yet.
  if (intent.op !== "create" && intent.draftId === null) return false;
  if (typeof intent.startedAt !== "string" || !Number.isFinite(Date.parse(intent.startedAt))) return false;
  // A stale intent is not replayed: the draft it described is a week old.
  if (now - Date.parse(intent.startedAt) > MAX_INTENT_AGE_MS || Date.parse(intent.startedAt) - now > 86_400_000) return false;
  // A discard is the id alone; a save must carry the exact request it sends.
  return intent.op === "discard" ? intent.body === null : validBody(intent.body);
}
