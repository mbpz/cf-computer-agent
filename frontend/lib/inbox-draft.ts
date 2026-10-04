export type InboxComposerDraft = { readonly kind: "text" | "link"; readonly content: string; readonly sourceUrl: string };
export type StoredInboxDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: InboxComposerDraft };
const storageKey = (memberId: string) => `memory-garden:inbox-draft:v1:${encodeURIComponent(memberId)}`;
const memberPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 64_000;
const contentHidden = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("INBOX_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
export function validInboxDraft(value: unknown): value is InboxComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || (record.kind !== "text" && record.kind !== "link")) return false;
  if (typeof record.content !== "string" || record.content.length > 200_000 || contentHidden.test(record.content)) return false;
  if (typeof record.sourceUrl !== "string" || record.sourceUrl.length > 2_048 || contentHidden.test(record.sourceUrl)) return false;
  return record.content !== "" || record.sourceUrl !== "" || record.kind !== "text";
}

// Tab-scoped unsent inbox capture. Separate from an in-flight create.
// Survives refresh, not tab closure. Restoring never captures the item.
export function loadInboxDraft(memberId: string): StoredInboxDraft {
  try {
    if (!memberPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validInboxDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze({ kind: value.draft.kind, content: value.draft.content, sourceUrl: value.draft.sourceUrl }) };
  } catch { return { kind: "blocked" }; }
}

export function persistInboxDraft(memberId: string, draft: InboxComposerDraft): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    if (draft.kind === "text" && draft.content === "" && draft.sourceUrl === "") { storage().removeItem(storageKey(memberId)); return true; }
    if (!validInboxDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: { kind: draft.kind, content: draft.content, sourceUrl: draft.sourceUrl } });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedInboxDraft(memberId: string): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
