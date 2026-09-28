import { canonicalInstant } from "./calendar-query";
export interface FocusTransitionIntent { readonly id: string; readonly clientKey: string; readonly taskId: string; readonly action: "pause" | "resume" | "complete" | "abandon"; readonly expectedUpdatedAt: string; }
export type StoredFocusTransition = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: FocusTransitionIntent; acknowledged: boolean };
const storageKey = (memberId: string) => `memory-garden:focus-transition:v1:${encodeURIComponent(memberId)}`;
const fields = ["id", "clientKey", "taskId", "action", "expectedUpdatedAt"] as const;
const same = (a: FocusTransitionIntent, b: FocusTransitionIntent) => fields.every(key => a[key] === b[key]);
export function validFocusTransition(value: unknown): value is FocusTransitionIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as FocusTransitionIntent;
  if (Object.keys(v).length !== fields.length || Object.keys(v).some(k => !fields.includes(k as never))
    || ![v.id, v.clientKey, v.taskId].every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id))
    || !["pause", "resume", "complete", "abandon"].includes(v.action)
    || !canonicalInstant(v.expectedUpdatedAt)) return false;
  return true;
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Never silently replace a malformed record or a different unresolved transition.
export function loadFocusTransition(memberId: string): StoredFocusTransition {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || typeof v.acknowledged !== "boolean" || !validFocusTransition(v.intent)
      || Object.keys(v).length !== 4 || Object.keys(v).some(key => !["version", "memberId", "intent", "acknowledged"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent), acknowledged: v.acknowledged };
  } catch { return { kind: "blocked" }; }
}
function persist(memberId: string, intent: FocusTransitionIntent, acknowledge: boolean): boolean {
  try {
    if (!validFocusTransition(intent)) return false;
    const previous = loadFocusTransition(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent)) || (acknowledge && previous.kind !== "ready")) return false;
    const acknowledged = acknowledge || (previous.kind === "ready" && previous.acknowledged);
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent, acknowledged }));
    const saved = loadFocusTransition(memberId);
    return saved.kind === "ready" && same(saved.intent, intent) && saved.acknowledged === acknowledged;
  } catch { return false; }
}
export function saveFocusTransition(memberId: string, intent: FocusTransitionIntent): boolean { return persist(memberId, intent, false); }
export function acknowledgeFocusTransition(memberId: string, intent: FocusTransitionIntent): boolean { return persist(memberId, intent, true); }
export function clearFocusTransition(memberId: string, intent: FocusTransitionIntent): boolean {
  try {
    const previous = loadFocusTransition(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
