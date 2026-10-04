export type CalendarComposerDraft = { readonly title: string; readonly startsAt: string; readonly endsAt: string };
export type StoredCalendarDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: CalendarComposerDraft };
const storageKey = (memberId: string) => `memory-garden:calendar-draft:v1:${encodeURIComponent(memberId)}`;
const memberPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;
const MAX_RAW = 8_192;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("CALENDAR_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
function time(value: unknown): value is string {
  return value === "" || (typeof value === "string" && timePattern.test(value));
}
export function validCalendarDraft(value: unknown): value is CalendarComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || typeof record.title !== "string" || record.title.length > 240 || /[\u0000-\u001f\u007f-\u009f]/u.test(record.title)) return false;
  if (!time(record.startsAt) || !time(record.endsAt)) return false;
  return record.title !== "" || record.startsAt !== "" || record.endsAt !== "";
}

// Tab-scoped unsent event fields. Separate from an in-flight create.
// Survives refresh, not tab closure. Restoring never creates the event.
export function loadCalendarDraft(memberId: string): StoredCalendarDraft {
  try {
    if (!memberPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validCalendarDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze({ title: value.draft.title, startsAt: value.draft.startsAt, endsAt: value.draft.endsAt }) };
  } catch { return { kind: "blocked" }; }
}

export function persistCalendarDraft(memberId: string, draft: CalendarComposerDraft): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    if (draft.title === "" && draft.startsAt === "" && draft.endsAt === "") { storage().removeItem(storageKey(memberId)); return true; }
    if (!validCalendarDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: { title: draft.title, startsAt: draft.startsAt, endsAt: draft.endsAt } });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedCalendarDraft(memberId: string): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
