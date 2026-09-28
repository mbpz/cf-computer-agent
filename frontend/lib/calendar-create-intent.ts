import { canonicalInstant } from "./calendar-query";
export interface CalendarCreateIntent { readonly id: string; readonly clientKey: string; readonly title: string; readonly startsAt: string; readonly endsAt: string; readonly timezone: string; }
export type StoredCalendarIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: CalendarCreateIntent; acknowledged: boolean };
const storageKey = (memberId: string) => `memory-garden:calendar-create:v1:${encodeURIComponent(memberId)}`;
const fields = ["id", "clientKey", "title", "startsAt", "endsAt", "timezone"] as const;
const same = (a: CalendarCreateIntent, b: CalendarCreateIntent) => fields.every(key => a[key] === b[key]);
export function validCalendarIntent(value: unknown): value is CalendarCreateIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as CalendarCreateIntent;
  if (Object.keys(v).length !== fields.length || Object.keys(v).some(k => !fields.includes(k as never))
    || ![v.id, v.clientKey].every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id))
    || typeof v.title !== "string" || !v.title.trim() || v.title !== v.title.trim() || v.title.length > 240
    || !canonicalInstant(v.startsAt) || !canonicalInstant(v.endsAt) || Date.parse(v.startsAt) <= 0 || Date.parse(v.endsAt) <= Date.parse(v.startsAt)
    || typeof v.timezone !== "string" || !v.timezone || v.timezone.length > 64) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: v.timezone }); return true; } catch { return false; }
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("CALENDAR_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Never silently replace a malformed record or a different unresolved creation.
export function loadCalendarIntent(memberId: string): StoredCalendarIntent {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || typeof v.acknowledged !== "boolean" || !validCalendarIntent(v.intent)
      || Object.keys(v).length !== 4 || Object.keys(v).some(key => !["version", "memberId", "intent", "acknowledged"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent), acknowledged: v.acknowledged };
  } catch { return { kind: "blocked" }; }
}
function persist(memberId: string, intent: CalendarCreateIntent, acknowledge: boolean): boolean {
  try {
    if (!validCalendarIntent(intent)) return false;
    const previous = loadCalendarIntent(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent)) || (acknowledge && previous.kind !== "ready")) return false;
    const acknowledged = acknowledge || (previous.kind === "ready" && previous.acknowledged);
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent, acknowledged }));
    const saved = loadCalendarIntent(memberId);
    return saved.kind === "ready" && same(saved.intent, intent) && saved.acknowledged === acknowledged;
  } catch { return false; }
}
export function saveCalendarIntent(memberId: string, intent: CalendarCreateIntent): boolean { return persist(memberId, intent, false); }
export function acknowledgeCalendarIntent(memberId: string, intent: CalendarCreateIntent): boolean { return persist(memberId, intent, true); }
export function clearCalendarIntent(memberId: string, intent: CalendarCreateIntent): boolean {
  try {
    const previous = loadCalendarIntent(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
