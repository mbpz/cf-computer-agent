export type NotificationUpdateIntent =
  | { readonly op: "read"; readonly id: string }
  | { readonly op: "open"; readonly id: string }
  | { readonly op: "bulk"; readonly ids: readonly string[] };
export type StoredNotificationUpdate = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: NotificationUpdateIntent };
const storageKey = (memberId: string) => `memory-garden:notification-update:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
export function validNotificationUpdate(value: unknown): value is NotificationUpdateIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if ((record.op === "read" || record.op === "open") && keys.length === 2 && keys.every((key) => key === "op" || key === "id") && isId(record.id)) {
    return true;
  }
  return record.op === "bulk" && keys.length === 2 && keys.every((key) => key === "op" || key === "ids")
    && Array.isArray(record.ids) && record.ids.length >= 1 && record.ids.length <= 100
    && record.ids.every(isId) && new Set(record.ids).size === record.ids.length;
}
function same(left: NotificationUpdateIntent, right: NotificationUpdateIntent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("NOTIFICATION_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the request is sent, so a refresh during an unknown update still knows to reconcile.
export function loadNotificationUpdate(memberId: string): StoredNotificationUpdate {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || !validNotificationUpdate(value.intent)
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    const intent = value.intent.op === "bulk"
      ? Object.freeze({ op: "bulk" as const, ids: Object.freeze([...value.intent.ids]) })
      : Object.freeze({ op: value.intent.op, id: value.intent.id });
    return { kind: "ready", intent };
  } catch { return { kind: "blocked" }; }
}
export function saveNotificationUpdate(memberId: string, intent: NotificationUpdateIntent): boolean {
  try {
    if (!validNotificationUpdate(intent) || loadNotificationUpdate(memberId).kind !== "empty") return false;
    const stored = intent.op === "bulk" ? { op: "bulk", ids: [...intent.ids] } : { op: intent.op, id: intent.id };
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent: stored }));
    const saved = loadNotificationUpdate(memberId);
    return saved.kind === "ready" && same(saved.intent, intent.op === "bulk" ? { op: "bulk", ids: [...intent.ids] } : intent);
  } catch { return false; }
}
export function clearNotificationUpdate(memberId: string, intent: NotificationUpdateIntent): boolean {
  try {
    const previous = loadNotificationUpdate(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
export function discardBlockedNotificationUpdate(memberId: string): boolean {
  try {
    if (!memberId || loadNotificationUpdate(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
