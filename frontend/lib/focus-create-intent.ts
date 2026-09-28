export interface FocusCreateIntent { readonly id: string; readonly clientKey: string; readonly title: string; readonly taskId: string; readonly durationMinutes: number; }
export type StoredFocusIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: FocusCreateIntent; acknowledged: boolean };
const storageKey = (memberId: string) => `memory-garden:focus-create:v1:${encodeURIComponent(memberId)}`;
const fields = ["id", "clientKey", "title", "taskId", "durationMinutes"] as const;
const same = (a: FocusCreateIntent, b: FocusCreateIntent) => fields.every(key => a[key] === b[key]);
export function validFocusIntent(value: unknown): value is FocusCreateIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as FocusCreateIntent;
  if (Object.keys(v).length !== fields.length || Object.keys(v).some(k => !fields.includes(k as never))
    || ![v.id, v.clientKey].every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id))
    || typeof v.title !== "string" || !v.title.trim() || v.title !== v.title.trim() || v.title.length > 240
    || typeof v.taskId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v.taskId)
    || !Number.isInteger(v.durationMinutes) || v.durationMinutes < 1 || v.durationMinutes > 240) return false;
  return true;
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Never silently replace a malformed record or a different unresolved creation.
export function loadFocusIntent(memberId: string): StoredFocusIntent {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || typeof v.acknowledged !== "boolean" || !validFocusIntent(v.intent)
      || Object.keys(v).length !== 4 || Object.keys(v).some(key => !["version", "memberId", "intent", "acknowledged"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent), acknowledged: v.acknowledged };
  } catch { return { kind: "blocked" }; }
}
function persist(memberId: string, intent: FocusCreateIntent, acknowledge: boolean): boolean {
  try {
    if (!validFocusIntent(intent)) return false;
    const previous = loadFocusIntent(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent)) || (acknowledge && previous.kind !== "ready")) return false;
    const acknowledged = acknowledge || (previous.kind === "ready" && previous.acknowledged);
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent, acknowledged }));
    const saved = loadFocusIntent(memberId);
    return saved.kind === "ready" && same(saved.intent, intent) && saved.acknowledged === acknowledged;
  } catch { return false; }
}
export function saveFocusIntent(memberId: string, intent: FocusCreateIntent): boolean { return persist(memberId, intent, false); }
export function acknowledgeFocusIntent(memberId: string, intent: FocusCreateIntent): boolean { return persist(memberId, intent, true); }
export function clearFocusIntent(memberId: string, intent: FocusCreateIntent): boolean {
  try {
    const previous = loadFocusIntent(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
