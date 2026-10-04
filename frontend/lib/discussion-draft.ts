export type DiscussionComposerDraft = { readonly body: string; readonly replyId: string; readonly replyAuthor: string };
export type StoredDiscussionDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: DiscussionComposerDraft };
const storageKey = (memberId: string, threadId: string) => `memory-garden:discussion-draft:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(threadId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 16_384;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("DISCUSSION_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
function validBody(value: unknown): value is string {
  return typeof value === "string" && [...value].length <= 5_000
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value);
}
export function validDiscussionDraft(value: unknown): value is DiscussionComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !validBody(record.body)) return false;
  if (record.replyId !== "" && !isId(record.replyId)) return false;
  if (record.replyAuthor !== "" && !isId(record.replyAuthor)) return false;
  if (record.replyId === "" && record.replyAuthor !== "") return false;
  return record.body !== "" || record.replyId !== "";
}
function plain(draft: DiscussionComposerDraft): DiscussionComposerDraft {
  return { body: draft.body, replyId: draft.replyId, replyAuthor: draft.replyAuthor };
}

// Tab-scoped, member-and-thread-scoped session storage for an unsent composer.
// Survives refresh and navigation, not tab closure. Restoring never sends the message.
export function loadDiscussionDraft(memberId: string, threadId: string): StoredDiscussionDraft {
  try {
    if (!isId(memberId) || !isId(threadId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, threadId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || value.threadId !== threadId
      || Object.keys(value).length !== 4 || !validDiscussionDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistDiscussionDraft(memberId: string, threadId: string, draft: DiscussionComposerDraft): boolean {
  try {
    if (!isId(memberId) || !isId(threadId)) return false;
    if (draft.body === "" && draft.replyId === "" && draft.replyAuthor === "") {
      storage().removeItem(storageKey(memberId, threadId));
      return true;
    }
    if (!validDiscussionDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, threadId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId, threadId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedDiscussionDraft(memberId: string, threadId: string): boolean {
  try {
    if (!isId(memberId) || !isId(threadId)) return false;
    storage().removeItem(storageKey(memberId, threadId));
    return true;
  } catch { return false; }
}
