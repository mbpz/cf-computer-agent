export type FocusComposerDraft = { readonly title: string; readonly taskId: string; readonly taskTitle: string };
export type StoredFocusDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: FocusComposerDraft };
const storageKey = (memberId: string) => `memory-garden:focus-draft:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 8_192;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("FOCUS_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
const text = (value: unknown, max: number): value is string => typeof value === "string" && [...value].length <= max
  && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
export function validFocusDraft(value: unknown): value is FocusComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !text(record.title, 240) || !text(record.taskTitle, 240)) return false;
  if (record.taskId !== "" && !idPattern.test(String(record.taskId))) return false;
  if (record.taskId === "" && record.taskTitle !== "") return false;
  return record.title !== "" || record.taskId !== "";
}
function plain(draft: FocusComposerDraft): FocusComposerDraft {
  return { title: draft.title, taskId: draft.taskId, taskTitle: draft.taskTitle };
}

// Tab-scoped, member-scoped session storage for an unsent focus start.
// Survives refresh and navigation, not tab closure. Restoring never starts a session.
export function loadFocusDraft(memberId: string): StoredFocusDraft {
  try {
    if (!idPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validFocusDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistFocusDraft(memberId: string, draft: FocusComposerDraft): boolean {
  try {
    if (!idPattern.test(memberId)) return false;
    if (draft.title === "" && draft.taskId === "" && draft.taskTitle === "") { storage().removeItem(storageKey(memberId)); return true; }
    if (!validFocusDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedFocusDraft(memberId: string): boolean {
  try {
    if (!idPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
