export type SubmissionMode = "text" | "markdown" | "code";
export interface SubmissionDraft { mode: SubmissionMode; title: string; content: string; }
export type DraftValidation = { ok: true } | { ok: false; field: "title" | "content"; message: string };

export function validateSubmissionDraft(draft: SubmissionDraft): DraftValidation {
  if (!draft.title.trim()) return { ok: false, field: "title", message: "Title is required." };
  const size = new TextEncoder().encode(draft.content).byteLength;
  if (!size) return { ok: false, field: "content", message: "Content is required." };
  if (size > 131072) return { ok: false, field: "content", message: "Content is too large." };
  return { ok: true };
}

export function createIdempotencyKey() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoObject?.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
