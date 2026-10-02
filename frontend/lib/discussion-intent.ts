import type { DiscussionSendInput } from "./discussions-data";
export type StoredDiscussionOperation = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; input: DiscussionSendInput };
export interface DiscussionOperationJournal {
  load(): StoredDiscussionOperation;
  save(input: DiscussionSendInput): boolean;
  clear(input: DiscussionSendInput): boolean;
}
// Tab-scoped recovery only. No expiry, auto-send, or silent replacement of an unresolved operation.
export function createDiscussionOperationJournal(memberId: string, threadId: string): DiscussionOperationJournal {
  const key = `memory-garden:discussion-operation:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(threadId)}`;
  const storage = (): Storage => {
    const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
    if (!value || !isId(memberId) || !isId(threadId)) throw new Error("DISCUSSION_STORAGE_UNAVAILABLE");
    return value;
  };
  const load = (): StoredDiscussionOperation => {
    try {
      const raw = storage().getItem(key);
      if (raw === null) return { kind: "empty" };
      if (raw.length > 100_000) return { kind: "blocked" };
      const value = JSON.parse(raw);
      if (!record(value) || Object.keys(value).length !== 4 || value.version !== 1
        || value.memberId !== memberId || value.threadId !== threadId || !validInput(value.input)) return { kind: "blocked" };
      const input = value.input;
      Object.freeze(input.context); Object.freeze(input.mentionMemberIds); Object.freeze(input);
      return { kind: "ready", input };
    } catch { return { kind: "blocked" }; }
  };
  return {
    load,
    save(input) {
      try {
        if (!validInput(input)) return false;
        const previous = load();
        if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.input, input))) return false;
        storage().setItem(key, JSON.stringify({ version: 1, memberId, threadId, input }));
        const saved = load();
        return saved.kind === "ready" && same(saved.input, input);
      } catch { return false; }
    },
    clear(input) {
      try {
        if (!validInput(input)) return false;
        const previous = load();
        if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.input, input))) return false;
        storage().removeItem(key);
        return storage().getItem(key) === null;
      } catch { return false; }
    },
  };
}
const isId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function validInput(value: unknown): value is DiscussionSendInput {
  if (!record(value) || Object.keys(value).some(key => !["context", "body", "clientKey", "replyToMessageId", "mentionMemberIds"].includes(key))) return false;
  return record(value.context) && Object.keys(value.context).length === 2
    && (value.context.kind === "task" || value.context.kind === "knowledge") && isId(value.context.id)
    && typeof value.body === "string" && !!value.body && value.body.trim() === value.body && [...value.body].length <= 5_000
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value.body)
    && typeof value.clientKey === "string" && !!value.clientKey && value.clientKey.trim() === value.clientKey
    && value.clientKey.length <= 128 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value.clientKey)
    && (value.replyToMessageId === undefined || isId(value.replyToMessageId))
    && Array.isArray(value.mentionMemberIds) && value.mentionMemberIds.length <= 20
    && value.mentionMemberIds.every(isId) && new Set(value.mentionMemberIds).size === value.mentionMemberIds.length;
}
function same(a: DiscussionSendInput, b: DiscussionSendInput): boolean {
  return a.clientKey === b.clientKey && a.context.kind === b.context.kind && a.context.id === b.context.id
    && a.body === b.body && a.replyToMessageId === b.replyToMessageId
    && JSON.stringify(a.mentionMemberIds) === JSON.stringify(b.mentionMemberIds);
}
