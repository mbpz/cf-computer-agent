import type { SubmissionDraft } from "../components/submissions/submission-form-model";

const STORAGE_KEY = "memory-garden:offline-submission-draft:v1";
const MAX_BYTES = 131072;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadOfflineSubmissionDraft(storage?: DraftStorage): SubmissionDraft | null {
  try {
    const target = storage ?? browserStorage();
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isDraft(value)) { target.removeItem(STORAGE_KEY); return null; }
    return value;
  } catch { return null; }
}

export function saveOfflineSubmissionDraft(draft: SubmissionDraft, storage?: DraftStorage): void {
  if (!draft.title.trim() && !draft.content.trim()) { clearOfflineSubmissionDraft(storage); return; }
  if (!isDraft(draft)) return;
  try { (storage ?? browserStorage()).setItem(STORAGE_KEY, JSON.stringify({ mode: draft.mode, title: draft.title, content: draft.content })); } catch { /* private best effort */ }
}

export function clearOfflineSubmissionDraft(storage?: DraftStorage): void {
  try { (storage ?? browserStorage()).removeItem(STORAGE_KEY); } catch { /* private best effort */ }
}

function isDraft(value: unknown): value is SubmissionDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.mode === "text" || record.mode === "markdown" || record.mode === "code")
    && typeof record.title === "string" && typeof record.content === "string"
    && new TextEncoder().encode(record.title).byteLength <= 512
    && new TextEncoder().encode(record.content).byteLength <= MAX_BYTES;
}

function browserStorage(): DraftStorage {
  const candidate = (globalThis as typeof globalThis & { window?: { localStorage?: DraftStorage } }).window?.localStorage;
  if (!candidate) throw new Error("OFFLINE_DRAFT_STORAGE_UNAVAILABLE");
  return candidate;
}
