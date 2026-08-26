export interface PrivateKnowledgeNote {
  v: 1;
  knowledgeItemId: string;
  title: string;
  body: string;
  visibility: "private";
  updatedAt: string;
}

export interface PrivateKnowledgeNoteDraft {
  title?: string;
  body?: string;
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

function emptyNote(knowledgeItemId: string): PrivateKnowledgeNote {
  return { v: 1, knowledgeItemId, title: "", body: "", visibility: "private", updatedAt: "" };
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
