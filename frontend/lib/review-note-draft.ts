export type StoredReviewNoteDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; notes: string };
const storageKey = (memberId: string) => `memory-garden:review-note-draft:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_ENTRIES = 20;
const MAX_NOTE_BYTES = 4_000;
const MAX_RAW = 16_384;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("REVIEW_NOTE_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}

function validNote(note: string): boolean {
  return new TextEncoder().encode(note).byteLength <= MAX_NOTE_BYTES
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(note) && !/[\uD800-\uDFFF]/u.test(note);
}

function validEntry(value: unknown): value is { action: "reject" | "request_changes"; reasonCode: string; note: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || typeof record.note !== "string" || !validNote(record.note)) return false;
  if (record.action === "reject") return ["not_relevant", "duplicate", "unsafe"].includes(String(record.reasonCode));
  return record.action === "request_changes" && record.reasonCode === "needs_revision";
}

function parseEntries(value: unknown): Record<string, { action: "reject" | "request_changes"; reasonCode: string; note: string }> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ids = Object.keys(record);
  if (ids.length < 1 || ids.length > MAX_ENTRIES || ids.some((id) => !idPattern.test(id))) return null;
  const entries: Record<string, { action: "reject" | "request_changes"; reasonCode: string; note: string }> = {};
  for (const id of ids) {
    const entry = record[id];
    if (!validEntry(entry)) return null;
    entries[id] = { action: entry.action, reasonCode: entry.reasonCode, note: entry.note };
  }
  return entries;
}

// Tab-scoped, member-scoped session storage for an unsent review note.
// Survives refresh and navigation, not tab closure. Restoring never submits the decision.
export function loadReviewNoteDraft(memberId: string): StoredReviewNoteDraft {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    const entries = parseEntries(value?.entries);
    if (!value || value.version !== 1 || value.memberId !== memberId || !entries
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "entries"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", notes: JSON.stringify(entries) };
  } catch { return { kind: "blocked" }; }
}

export function persistReviewNoteDraft(memberId: string, notes: string): boolean {
  try {
    if (!memberId) return false;
    if (notes === "{}") { storage().removeItem(storageKey(memberId)); return true; }
    const entries = parseEntries(JSON.parse(notes) as unknown);
    if (!entries) return false;
    const body = JSON.stringify({ version: 1, memberId, entries });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedReviewNoteDraft(memberId: string): boolean {
  try {
    if (!memberId) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
