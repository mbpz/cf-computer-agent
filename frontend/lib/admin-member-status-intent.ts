export type AdminMemberStatusIntent = { readonly id: string; readonly status: "active" | "disabled" };
export type StoredAdminMemberStatus = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intents: readonly AdminMemberStatusIntent[] };
const storageKey = (memberId: string) => `memory-garden:admin-member-status:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const statuses = new Set(["active", "disabled"]);
function isId(value: unknown): value is string { return typeof value === "string" && idPattern.test(value); }
export function validAdminMemberStatus(value: unknown): value is AdminMemberStatusIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 2 && keys.every((key) => key === "id" || key === "status") && isId(record.id) && statuses.has(record.status as string);
}
function plain(intent: AdminMemberStatusIntent): AdminMemberStatusIntent { return { id: intent.id, status: intent.status }; }
function same(left: AdminMemberStatusIntent, right: AdminMemberStatusIntent): boolean { return left.id === right.id && left.status === right.status; }
function freeze(intent: AdminMemberStatusIntent): AdminMemberStatusIntent { return Object.freeze(plain(intent)); }
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("MEMBER_STATUS_STORAGE_UNAVAILABLE");
  return value;
}
function parseIntents(value: unknown): AdminMemberStatusIntent[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 || !value.every(validAdminMemberStatus)) return null;
  if (new Set(value.map((item) => item.id)).size !== value.length) return null;
  return value.map(freeze);
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the status change is sent, so a refresh during an unknown result still waits for a read.
export function loadAdminMemberStatuses(memberId: string): StoredAdminMemberStatus {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    const intents = parseIntents(value?.intents);
    if (!value || value.version !== 1 || value.memberId !== memberId || !intents
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intents"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intents: Object.freeze(intents) };
  } catch { return { kind: "blocked" }; }
}
export function saveAdminMemberStatus(memberId: string, intent: AdminMemberStatusIntent): boolean {
  try {
    if (!memberId || !validAdminMemberStatus(intent)) return false;
    const current = loadAdminMemberStatuses(memberId);
    if (current.kind === "blocked") return false;
    const existing = current.kind === "ready" ? current.intents.find((item) => item.id === intent.id) : undefined;
    if (existing) return same(existing, intent);
    if (current.kind === "ready" && current.intents.length >= 20) return false;
    const intents = [...(current.kind === "ready" ? current.intents.map(plain) : []), plain(intent)];
    const store = storage();
    const key = storageKey(memberId);
    const previous = store.getItem(key);
    store.setItem(key, JSON.stringify({ version: 1, memberId, intents }));
    const saved = loadAdminMemberStatuses(memberId);
    const ok = saved.kind === "ready" && saved.intents.some((item) => same(item, intent));
    if (!ok) {
      if (previous === null) store.removeItem(key);
      else store.setItem(key, previous);
    }
    return ok;
  } catch { return false; }
}
export function clearAdminMemberStatus(memberId: string, intent: AdminMemberStatusIntent): boolean {
  try {
    if (!memberId || !validAdminMemberStatus(intent)) return false;
    const current = loadAdminMemberStatuses(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "empty") return true;
    const match = current.intents.find((item) => item.id === intent.id);
    if (!match) return true;
    if (!same(match, intent)) return false;
    const intents = current.intents.filter((item) => item.id !== intent.id).map(plain);
    const store = storage();
    const key = storageKey(memberId);
    if (intents.length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify({ version: 1, memberId, intents }));
    const saved = loadAdminMemberStatuses(memberId);
    return saved.kind === "empty" || (saved.kind === "ready" && saved.intents.every((item) => item.id !== intent.id));
  } catch { return false; }
}
export function discardBlockedAdminMemberStatus(memberId: string): boolean {
  try {
    if (!memberId || loadAdminMemberStatuses(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminMemberStatuses(memberId).kind === "empty";
  } catch { return false; }
}
