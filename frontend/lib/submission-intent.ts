import { createIdempotencyKey, validateSubmissionDraft, type SubmissionDraft } from "../components/submissions/submission-form-model";

export type SubmissionIntent = { version: 1; key: string; draft: SubmissionDraft };
export type IntentLoad = { kind: "empty" | "unavailable" | "invalid" } | { kind: "ready"; intent: SubmissionIntent };
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createSubmissionIntent(draft: SubmissionDraft): SubmissionIntent {
  if (!validDraft(draft)) throw new Error("SUBMISSION_DRAFT_INVALID");
  return { version: 1, key: createIdempotencyKey(), draft: { mode: draft.mode, title: draft.title.trim(), content: draft.content } };
}

export function loadSubmissionIntent(memberId: string, storage?: StoragePort): IntentLoad {
  const key = storageKey(memberId);
  if (!key) return { kind: "invalid" };
  try {
    const raw = (storage ?? browserStorage()).getItem(key);
    if (raw === null) return { kind: "empty" };
    try {
      const value: unknown = JSON.parse(raw);
      return validIntent(value) ? { kind: "ready", intent: copy(value) } : { kind: "invalid" };
    } catch { return { kind: "invalid" }; }
  } catch { return { kind: "unavailable" }; }
}

export function saveSubmissionIntent(memberId: string, intent: SubmissionIntent, storage?: StoragePort): boolean {
  const key = storageKey(memberId);
  if (!key || !validIntent(intent)) return false;
  try {
    const target = storage ?? browserStorage();
    const existing = loadSubmissionIntent(memberId, target);
    if (existing.kind !== "empty" && !(existing.kind === "ready" && JSON.stringify(existing.intent) === JSON.stringify(copy(intent)))) return false;
    target.setItem(key, JSON.stringify(copy(intent)));
    return true;
  } catch { return false; }
}

export function clearSubmissionIntent(memberId: string, intentKey: string, storage?: StoragePort): boolean {
  const key = storageKey(memberId);
  if (!key) return false;
  try {
    const target = storage ?? browserStorage();
    const current = loadSubmissionIntent(memberId, target);
    if (current.kind === "empty") return true;
    if (current.kind !== "ready" || current.intent.key !== intentKey) return false;
    target.removeItem(key);
    return true;
  } catch { return false; }
}

function copy(intent: SubmissionIntent): SubmissionIntent {
  return { version: 1, key: intent.key, draft: { mode: intent.draft.mode, title: intent.draft.title, content: intent.draft.content } };
}
function validDraft(value: unknown): value is SubmissionDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as SubmissionDraft;
  return ["text", "markdown", "code"].includes(draft.mode) && typeof draft.title === "string" && typeof draft.content === "string"
    && new TextEncoder().encode(draft.title).byteLength <= 512 && validateSubmissionDraft(draft).ok;
}
function validIntent(value: unknown): value is SubmissionIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as SubmissionIntent;
  return intent.version === 1 && typeof intent.key === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(intent.key) && validDraft(intent.draft);
}
function storageKey(memberId: string): string | null {
  if (typeof memberId !== "string" || !memberId.trim() || new TextEncoder().encode(memberId).byteLength > 512) return null;
  try { return `personal-workbench:submission-intent:v1:${encodeURIComponent(memberId)}`; } catch { return null; }
}
function browserStorage(): StoragePort {
  const storage = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage;
  if (!storage) throw new Error("SUBMISSION_STORAGE_UNAVAILABLE");
  return storage;
}
