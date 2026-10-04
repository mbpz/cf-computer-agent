export type TimelineComposerDraft = { readonly kind: "meeting" | "decision" | "action_item" | "milestone"; readonly title: string; readonly body: string; readonly startsAt: string; readonly dueAt: string };
export type StoredTimelineDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: TimelineComposerDraft };
const storageKey = (memberId: string, projectId: string) => `memory-garden:timeline-draft:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(projectId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const kinds = new Set(["meeting", "decision", "action_item", "milestone"]);
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;
const MAX_RAW = 64_000;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("TIMELINE_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
function text(value: unknown, max: number, multiline: boolean): value is string {
  return typeof value === "string" && [...value].length <= max
    && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u : /[\u0000-\u001f\u007f-\u009f]/u).test(value);
}
function time(value: unknown): value is string {
  return value === "" || (typeof value === "string" && timePattern.test(value));
}
export function validTimelineDraft(value: unknown): value is TimelineComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 5 || !kinds.has(String(record.kind))) return false;
  if (!text(record.title, 400, false) || !text(record.body, 200_000, true) || !time(record.startsAt) || !time(record.dueAt)) return false;
  return record.title !== "" || record.body !== "" || record.startsAt !== "" || record.dueAt !== "" || record.kind !== "meeting";
}
function plain(draft: TimelineComposerDraft): TimelineComposerDraft {
  return { kind: draft.kind, title: draft.title, body: draft.body, startsAt: draft.startsAt, dueAt: draft.dueAt };
}

// Tab-scoped unsent timeline item for one project. Separate from an in-flight create.
// Survives refresh, not tab closure. Restoring never creates the item.
export function loadTimelineDraft(memberId: string, projectId: string): StoredTimelineDraft {
  try {
    if (!idPattern.test(memberId) || !idPattern.test(projectId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, projectId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || value.projectId !== projectId || Object.keys(value).length !== 4 || !validTimelineDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistTimelineDraft(memberId: string, projectId: string, draft: TimelineComposerDraft): boolean {
  try {
    if (!idPattern.test(memberId) || !idPattern.test(projectId)) return false;
    if (draft.kind === "meeting" && draft.title === "" && draft.body === "" && draft.startsAt === "" && draft.dueAt === "") { storage().removeItem(storageKey(memberId, projectId)); return true; }
    if (!validTimelineDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, projectId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId, projectId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedTimelineDraft(memberId: string, projectId: string): boolean {
  try {
    if (!idPattern.test(memberId) || !idPattern.test(projectId)) return false;
    storage().removeItem(storageKey(memberId, projectId));
    return true;
  } catch { return false; }
}
