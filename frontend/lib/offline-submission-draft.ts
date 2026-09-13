import type { SubmissionDraft } from "../components/submissions/submission-form-model";

const MAX_BYTES = 131072;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadOfflineSubmissionDraft(memberId: string, storage?: DraftStorage): SubmissionDraft | null {
  const key = storageKey(memberId);
  if (!key) return null;
  try {
    const target = storage ?? browserStorage();
    const raw = target.getItem(key);
    if (!raw) return null;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { target.removeItem(key); return null; }
    if (!isDraft(value)) { target.removeItem(key); return null; }
    return { mode: value.mode, title: value.title, content: value.content };
  } catch { return null; }
}

export function saveOfflineSubmissionDraft(memberId: string, draft: SubmissionDraft, storage?: DraftStorage): void {
  const key = storageKey(memberId);
  if (!key || !isDraft(draft)) return;
  if (!draft.title.trim() && !draft.content.trim()) { clearOfflineSubmissionDraft(memberId, storage); return; }
  try { (storage ?? browserStorage()).setItem(key, JSON.stringify({ mode: draft.mode, title: draft.title, content: draft.content })); } catch { /* private best effort */ }
}

export function clearOfflineSubmissionDraft(memberId: string, storage?: DraftStorage): void {
  const key = storageKey(memberId);
  if (!key) return;
  try { (storage ?? browserStorage()).removeItem(key); } catch { /* private best effort */ }
}

function storageKey(memberId: string): string | null {
  if (typeof memberId !== "string" || !memberId.trim()
      || new TextEncoder().encode(memberId).byteLength > 512) return null;
  try {
    return `personal-workbench:offline-submission-draft:v2:${encodeURIComponent(memberId)}`;
  } catch { return null; }
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
