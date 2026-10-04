import { apiFetch, type Fetcher } from "./api";

export interface PrivateKnowledgeNote {
  v: 1;
  knowledgeItemId: string;
  title: string;
  body: string;
  visibility: "private";
  access?: "owner" | "shared";
  updatedAt: string;
}

export interface RemotePrivateKnowledgeNote extends PrivateKnowledgeNote {
  id: string;
  ownerId: string;
  access: "owner" | "shared";
  citations: PrivateKnowledgeNoteCitation[];
}

/** Never read or migrate the old item-only cache: its member ownership is unknown. */
export function memberKnowledgeNoteStorage(memberId: string, storage: NoteStorage = browserStorage()): NoteStorage {
  assertMemberId(memberId);
  const key = (value: string) => `memory-garden:member-note:v1:${memberId}:${value}`;
  return { getItem: value => storage.getItem(key(value)), setItem: (value, data) => storage.setItem(key(value), data), removeItem: value => storage.removeItem(key(value)) };
}

export interface PrivateKnowledgeNoteListItem extends PrivateKnowledgeNote {
  id: string;
  createdAt: string;
}

export interface PrivateKnowledgeNoteDraft {
  title?: string;
  body?: string;
}

export interface PrivateKnowledgeNoteCitation {
  revisionId: string;
  chunkId: string;
  startLine: number;
  endLine: number;
}

export interface PrivateKnowledgeNoteShare {
  noteId: string;
  recipientMemberId: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface PrivateKnowledgeWorkspaceMember {
  id: string;
  email: string;
  role: "admin" | "contributor";
}

type NoteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const NOTE_KEY_PREFIX = "memory-garden:knowledge-note:v1:";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_TITLE_BYTES = 1024;
const MAX_BODY_BYTES = 32 * 1024;

export function loadPrivateKnowledgeNote(knowledgeItemId: string, storage: NoteStorage = browserStorage()): PrivateKnowledgeNote {
  assertKnowledgeItemId(knowledgeItemId);
  const raw = storage.getItem(noteKey(knowledgeItemId));
  if (!raw) return emptyNote(knowledgeItemId);
  try {
    return normalizePrivateKnowledgeNote(JSON.parse(raw) as unknown, knowledgeItemId) ?? emptyNote(knowledgeItemId);
  } catch {
    return emptyNote(knowledgeItemId);
  }
}

export function clearPrivateKnowledgeNote(knowledgeItemId: string, storage: NoteStorage = browserStorage()): void {
  assertKnowledgeItemId(knowledgeItemId);
  storage.removeItem(noteKey(knowledgeItemId));
  if (storage.getItem(noteKey(knowledgeItemId)) !== null) throw new Error("KNOWLEDGE_NOTE_CACHE_REMOVE_FAILED");
}

export function savePrivateKnowledgeNote(
  knowledgeItemId: string,
  draft: PrivateKnowledgeNoteDraft,
  storage: NoteStorage = browserStorage(),
  now: () => string = () => new Date().toISOString(),
): PrivateKnowledgeNote {
  assertKnowledgeItemId(knowledgeItemId);
  const title = normalizeDraftText(draft.title);
  const body = normalizeDraftText(draft.body);
  assertByteLimit(title, MAX_TITLE_BYTES, "KNOWLEDGE_NOTE_TOO_LARGE");
  assertByteLimit(body, MAX_BODY_BYTES, "KNOWLEDGE_NOTE_TOO_LARGE");
  const note: PrivateKnowledgeNote = { v: 1, knowledgeItemId, title, body, visibility: "private", updatedAt: now() };
  storage.setItem(noteKey(knowledgeItemId), JSON.stringify(note));
  return note;
}

export function normalizePrivateKnowledgeNote(value: unknown, expectedKnowledgeItemId: string): PrivateKnowledgeNote | null {
  if (!ID_PATTERN.test(expectedKnowledgeItemId) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || record.knowledgeItemId !== expectedKnowledgeItemId || record.visibility !== "private") return null;
  if (record.access !== undefined && record.access !== "owner" && record.access !== "shared") return null;
  if (typeof record.title !== "string" || typeof record.body !== "string" || typeof record.updatedAt !== "string") return null;
  if (new TextEncoder().encode(record.title).byteLength > MAX_TITLE_BYTES || new TextEncoder().encode(record.body).byteLength > MAX_BODY_BYTES) return null;
  return {
    v: 1, knowledgeItemId: expectedKnowledgeItemId, title: record.title, body: record.body, visibility: "private", updatedAt: record.updatedAt,
    ...(record.access === undefined ? {} : { access: record.access }),
  };
}

export async function loadRemotePrivateKnowledgeNote(knowledgeItemId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<RemotePrivateKnowledgeNote | null> {
  assertKnowledgeItemId(knowledgeItemId);
  const data = await apiFetch<{ note?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/note`, { requester: noteRequester(requester), signal });
  if (data?.note === null) return null;
  return normalizeRemoteNote(data?.note, knowledgeItemId);
}

export async function loadPrivateKnowledgeNotes(requester: Fetcher = fetch, signal?: AbortSignal): Promise<PrivateKnowledgeNoteListItem[]> {
  const data = await apiFetch<unknown>("/api/knowledge/notes?limit=8", { requester, signal });
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray((data as { items?: unknown }).items)) throw new Error("KNOWLEDGE_NOTES_INVALID");
  return (data as { items: unknown[] }).items.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || !ID_PATTERN.test(record.id) || typeof record.knowledgeItemId !== "string" || !ID_PATTERN.test(record.knowledgeItemId)
      || record.visibility !== "private" || typeof record.title !== "string" || typeof record.body !== "string"
      || typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") return [];
    const access = record.access;
    if (access !== "owner" && access !== "shared") throw new Error("KNOWLEDGE_NOTES_INVALID");
    return [{
      v: 1 as const,
      id: record.id,
      knowledgeItemId: record.knowledgeItemId,
      title: record.title,
      body: record.body,
      visibility: "private" as const,
      access,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
    }];
  });
}

export async function listPrivateKnowledgeNoteShares(knowledgeItemId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<PrivateKnowledgeNoteShare[]> {
  assertKnowledgeItemId(knowledgeItemId);
  const data = await apiFetch<{ shares?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/note/shares`, { requester: statusRequester(requester, 200), signal });
  if (!Array.isArray(data?.shares)) throw new Error("KNOWLEDGE_NOTE_SHARES_INVALID");
  const rows = data.shares.map(normalizeShare);
  if (new Set(rows.map(row => row.recipientMemberId)).size !== rows.length) throw new Error("KNOWLEDGE_NOTE_SHARES_INVALID");
  return rows;
}

export async function loadActiveWorkspaceMembers(requester: Fetcher = fetch, signal?: AbortSignal): Promise<PrivateKnowledgeWorkspaceMember[]> {
  const data = await apiFetch<unknown>("/api/members/active", { requester, signal });
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray((data as { items?: unknown }).items)) throw new Error("KNOWLEDGE_MEMBERS_INVALID");
  return (data as { items: unknown[] }).items.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || !ID_PATTERN.test(record.id) || typeof record.email !== "string"
      || (record.role !== "admin" && record.role !== "contributor")) return [];
    return [{ id: record.id, email: record.email, role: record.role }];
  });
}

export async function sharePrivateKnowledgeNote(knowledgeItemId: string, recipientMemberId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<PrivateKnowledgeNoteShare> {
  assertKnowledgeItemId(knowledgeItemId);
  assertMemberId(recipientMemberId);
  const data = await apiFetch<{ share?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/note/shares`, {
    requester: statusRequester(requester, 201), signal, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipientMemberId }),
  });
  const share = normalizeShare(data?.share);
  if (share.recipientMemberId !== recipientMemberId || share.revokedAt !== null) throw new Error("KNOWLEDGE_NOTE_SHARE_INVALID");
  return share;
}

export async function revokePrivateKnowledgeNoteShare(knowledgeItemId: string, recipientMemberId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<void> {
  assertKnowledgeItemId(knowledgeItemId);
  assertMemberId(recipientMemberId);
  await apiFetch<void>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/note/shares/${encodeURIComponent(recipientMemberId)}`, { requester: statusRequester(requester, 204), signal, method: "DELETE" });
}

export async function saveRemotePrivateKnowledgeNote(
  knowledgeItemId: string,
  draft: PrivateKnowledgeNoteDraft,
  citations: readonly PrivateKnowledgeNoteCitation[],
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<RemotePrivateKnowledgeNote> {
  assertKnowledgeItemId(knowledgeItemId);
  const data = await apiFetch<{ note?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/note`, {
    requester: noteRequester(requester),
    signal,
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: draft.title ?? "", body: draft.body ?? "", citations }),
  });
  return normalizeRemoteNote(data?.note, knowledgeItemId);
}

function emptyNote(knowledgeItemId: string): PrivateKnowledgeNote {
  return { v: 1, knowledgeItemId, title: "", body: "", visibility: "private", updatedAt: "" };
}

function noteRequester(requester: Fetcher): Fetcher { return statusRequester(requester, 200); }

function statusRequester(requester: Fetcher, status: number): Fetcher {
  return async (input, init) => {
    const response = await requester(input, init);
    if (response.ok && response.status !== status) throw new Error("KNOWLEDGE_NOTE_RECEIPT_INVALID");
    return response;
  };
}

function normalizeRemoteNote(value: unknown, expectedKnowledgeItemId: string): RemotePrivateKnowledgeNote {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("KNOWLEDGE_NOTE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !ID_PATTERN.test(record.id)
    || typeof record.ownerId !== "string" || !ID_PATTERN.test(record.ownerId)
    || record.knowledgeItemId !== expectedKnowledgeItemId
    || (record.access !== "owner" && record.access !== "shared")
    || record.visibility !== "private" || typeof record.title !== "string" || typeof record.body !== "string"
    || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))
    || !Array.isArray(record.citations) || record.citations.length < 1 || record.citations.length > 8) throw new Error("KNOWLEDGE_NOTE_INVALID");
  const citations = record.citations.map((value): PrivateKnowledgeNoteCitation => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("KNOWLEDGE_NOTE_INVALID");
    const citation = value as Record<string, unknown>;
    if (typeof citation.revisionId !== "string" || !ID_PATTERN.test(citation.revisionId)
      || typeof citation.chunkId !== "string" || !ID_PATTERN.test(citation.chunkId)
      || !Number.isSafeInteger(citation.startLine) || !Number.isSafeInteger(citation.endLine)
      || (citation.startLine as number) < 1 || (citation.endLine as number) < (citation.startLine as number)) throw new Error("KNOWLEDGE_NOTE_INVALID");
    return { revisionId: citation.revisionId, chunkId: citation.chunkId, startLine: citation.startLine as number, endLine: citation.endLine as number };
  });
  const note = normalizePrivateKnowledgeNote({ ...record, v: 1 }, expectedKnowledgeItemId);
  if (!note) throw new Error("KNOWLEDGE_NOTE_INVALID");
  return { ...note, id: record.id, ownerId: record.ownerId, access: record.access, citations };
}

function normalizeDraftText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertKnowledgeItemId(value: string): void {
  if (!ID_PATTERN.test(value)) throw new Error("KNOWLEDGE_NOTE_ID_INVALID");
}

function assertMemberId(value: string): void {
  if (!ID_PATTERN.test(value)) throw new Error("KNOWLEDGE_NOTE_MEMBER_ID_INVALID");
}

function normalizeShare(value: unknown): PrivateKnowledgeNoteShare {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("KNOWLEDGE_NOTE_SHARE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.noteId !== "string" || !ID_PATTERN.test(record.noteId)
    || typeof record.recipientMemberId !== "string" || !ID_PATTERN.test(record.recipientMemberId)
    || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))
    || (record.revokedAt !== null && (typeof record.revokedAt !== "string" || !Number.isFinite(Date.parse(record.revokedAt))))) {
    throw new Error("KNOWLEDGE_NOTE_SHARE_INVALID");
  }
  return { noteId: record.noteId, recipientMemberId: record.recipientMemberId, createdAt: record.createdAt, revokedAt: record.revokedAt as string | null };
}

function assertByteLimit(value: string, maxBytes: number, code: string): void {
  if (new TextEncoder().encode(value).byteLength > maxBytes) throw new Error(code);
}

function noteKey(knowledgeItemId: string): string {
  return NOTE_KEY_PREFIX + knowledgeItemId;
}

function browserStorage(): NoteStorage {
  const candidate = (globalThis as typeof globalThis & { window?: { localStorage?: NoteStorage } }).window?.localStorage;
  if (!candidate) throw new Error("KNOWLEDGE_NOTE_STORAGE_UNAVAILABLE");
  return candidate;
}
