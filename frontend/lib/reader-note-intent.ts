import type { PrivateKnowledgeNoteCitation } from "./knowledge-note";

export type NoteFields = { title: string; body: string };
export type NoteSaveIntent = { id: string; kind: "save"; fields: NoteFields; citations: PrivateKnowledgeNoteCitation[] };
export type NoteShareIntent = { id: string; kind: "share" | "revoke"; noteId: string; title: string; recipientId: string; email: string; fields: NoteFields };
export type ReaderNoteIntent = NoteSaveIntent | NoteShareIntent;
type Outcome = "pending" | "applied" | "rejected";
export type StoredReaderNoteIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: ReaderNoteIntent; outcome: Outcome };
const key = (member: string, item: string) => `memory-garden:reader-note-intent:v1:${encodeURIComponent(member)}:${encodeURIComponent(item)}`;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && new TextEncoder().encode(v).length <= max;
function valid(v: unknown): v is ReaderNoteIntent {
  if (!object(v) || !id(v.id) || !object(v.fields) || !exact(v.fields, ["title", "body"]) || !text(v.fields.title, 1024) || !text(v.fields.body, 65536)) return false;
  if (v.kind === "save") return exact(v, ["id", "kind", "fields", "citations"]) && !!v.fields.title.trim() && !!v.fields.body.trim() && text(v.fields.body, 32768)
    && Array.isArray(v.citations) && v.citations.length > 0 && v.citations.length <= 8 && v.citations.every(c => object(c) && exact(c, ["revisionId", "chunkId", "startLine", "endLine"]) && id(c.revisionId) && id(c.chunkId) && Number.isSafeInteger(c.startLine) && Number(c.startLine) >= 1 && Number.isSafeInteger(c.endLine) && Number(c.endLine) >= Number(c.startLine));
  return (v.kind === "share" || v.kind === "revoke") && exact(v, ["id", "kind", "noteId", "title", "recipientId", "email", "fields"]) && id(v.noteId) && id(v.recipientId) && text(v.title, 1024) && text(v.email, 1024);
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("NOTE_INTENT_STORAGE_UNAVAILABLE");
  return value;
}
// Tab/member/item scoped. Not a backup, cross-tab lock, or server idempotency token.
export function loadReaderNoteIntent(member: string, item: string): StoredReaderNoteIntent {
  try {
    if (!id(member) || !id(item)) return { kind: "blocked" };
    const raw = storage().getItem(key(member, item));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 420000) return { kind: "blocked" };
    const v: unknown = JSON.parse(raw);
    if (!object(v) || !exact(v, ["version", "member", "item", "intent", "outcome"]) || v.version !== 1 || v.member !== member || v.item !== item || !valid(v.intent) || (typeof v.outcome !== "string" || !["pending", "applied", "rejected"].includes(v.outcome))) return { kind: "blocked" };
    return { kind: "ready", intent: v.intent, outcome: v.outcome as Outcome };
  } catch { return { kind: "blocked" }; }
}
const same = (a: ReaderNoteIntent, b: ReaderNoteIntent) => JSON.stringify(a) === JSON.stringify(b);
function write(member: string, item: string, intent: ReaderNoteIntent, outcome: Outcome) {
  storage().setItem(key(member, item), JSON.stringify({ version: 1, member, item, intent, outcome }));
  const saved = loadReaderNoteIntent(member, item);
  if (saved.kind !== "ready" || !same(saved.intent, intent) || saved.outcome !== outcome) throw new Error("NOTE_INTENT_STORAGE_FAILED");
}
export function prepareReaderNoteIntent(member: string, item: string, intent: ReaderNoteIntent) {
  if (!valid(intent) || loadReaderNoteIntent(member, item).kind !== "empty") throw new Error("NOTE_INTENT_STORAGE_BLOCKED");
  write(member, item, intent, "pending");
}
export function settleReaderNoteIntent(member: string, item: string, intent: ReaderNoteIntent, outcome: Exclude<Outcome, "pending">) {
  const previous = loadReaderNoteIntent(member, item);
  if (previous.kind !== "ready" || !same(previous.intent, intent) || (previous.outcome !== "pending" && previous.outcome !== outcome)) throw new Error("NOTE_INTENT_CHANGED");
  if (previous.outcome !== outcome) write(member, item, intent, outcome);
}
export function clearReaderNoteIntent(member: string, item: string, intent: ReaderNoteIntent) {
  const previous = loadReaderNoteIntent(member, item);
  if (previous.kind !== "ready" || !same(previous.intent, intent) || previous.outcome === "pending") throw new Error("NOTE_INTENT_CHANGED");
  // Retain a settled tombstone until removal is verified. A thrown readback can
  // leave storage empty; the in-memory owner may retry, but must not send again.
  storage().removeItem(key(member, item));
  if (storage().getItem(key(member, item)) !== null) throw new Error("NOTE_INTENT_STORAGE_FAILED");
}

/** Only after a validated receipt/pre-write rejection or an owner-scoped read. */
export function finishReaderNoteIntent(member: string, item: string, intent: ReaderNoteIntent, outcome: "applied" | "rejected") {
  // A previous verified settlement may have removed the key before its readback
  // threw. Requiring fresh outcome evidence at the caller makes empty safe here.
  if (loadReaderNoteIntent(member, item).kind === "empty") return;
  settleReaderNoteIntent(member, item, intent, outcome);
  clearReaderNoteIntent(member, item, intent);
}
