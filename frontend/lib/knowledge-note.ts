import { apiFetch, type Fetcher } from "./api";

export interface PrivateKnowledgeNote {
  v: 1;
  knowledgeItemId: string;
  title: string;
  body: string;
  visibility: "private";
  updatedAt: string;
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
  if (typeof record.title !== "string" || typeof record.body !== "string" || typeof record.updatedAt !== "string") return null;
  if (new TextEncoder().encode(record.title).byteLength > MAX_TITLE_BYTES || new TextEncoder().encode(record.body).byteLength > MAX_BODY_BYTES) return null;
  return { v: 1, knowledgeItemId: expectedKnowledgeItemId, title: record.title, body: record.body, visibility: "private", updatedAt: record.updatedAt };
}

export async function loadRemotePrivateKnowledgeNote(knowledgeItemId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<PrivateKnowledgeNote | null> {
  assertKnowledgeItemId(knowledgeItemId);
  const data = await apiFetch<{ note?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/note`, { requester, signal });
  if (data.note === null || data.note === undefined) return null;
  return normalizeRemoteNote(data.note, knowledgeItemId);
}

export async function loadPrivateKnowledgeNotes(requester: Fetcher = fetch, signal?: AbortSignal): Promise<PrivateKnowledgeNoteListItem[]> {
  const data = await apiFetch<{ items?: unknown[] }>("/api/knowledge/notes?limit=8", { requester, signal });
  if (!Array.isArray(data.items)) return [];
  return data.items.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || !ID_PATTERN.test(record.id) || typeof record.knowledgeItemId !== "string" || !ID_PATTERN.test(record.knowledgeItemId)
      || record.visibility !== "private" || typeof record.title !== "string" || typeof record.body !== "string"
      || typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") return [];
    return [{
      v: 1 as const,
      id: record.id,
      knowledgeItemId: record.knowledgeItemId,
      title: record.title,
      body: record.body,
      visibility: "private" as const,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
    }];
  });
}

export async function saveRemotePrivateKnowledgeNote(
  knowledgeItemId: string,
  draft: PrivateKnowledgeNoteDraft,
  citations: readonly PrivateKnowledgeNoteCitation[],
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<PrivateKnowledgeNote> {
  assertKnowledgeItemId(knowledgeItemId);
  const data = await apiFetch<{ note?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/note`, {
    requester,
    signal,
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: draft.title ?? "", body: draft.body ?? "", citations }),
  });
  return normalizeRemoteNote(data.note, knowledgeItemId);
}

function emptyNote(knowledgeItemId: string): PrivateKnowledgeNote {
  return { v: 1, knowledgeItemId, title: "", body: "", visibility: "private", updatedAt: "" };
}

function normalizeRemoteNote(value: unknown, expectedKnowledgeItemId: string): PrivateKnowledgeNote {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("KNOWLEDGE_NOTE_INVALID");
  const record = value as Record<string, unknown>;
  if (record.visibility !== "private" || typeof record.title !== "string" || typeof record.body !== "string" || typeof record.updatedAt !== "string") throw new Error("KNOWLEDGE_NOTE_INVALID");
  const note = { v: 1 as const, knowledgeItemId: expectedKnowledgeItemId, title: record.title, body: record.body, visibility: "private" as const, updatedAt: record.updatedAt };
  if (!normalizePrivateKnowledgeNote(note, expectedKnowledgeItemId)) throw new Error("KNOWLEDGE_NOTE_INVALID");
  return note;
}

function normalizeDraftText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertKnowledgeItemId(value: string): void {
  if (!ID_PATTERN.test(value)) throw new Error("KNOWLEDGE_NOTE_ID_INVALID");
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
