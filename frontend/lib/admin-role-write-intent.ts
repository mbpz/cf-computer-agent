export type AdminRoleWriteIntent =
  | { readonly op: "update"; readonly roleId: string; readonly allowBits: string }
  | { readonly op: "create"; readonly key: string; readonly name: string; readonly allowBits: string }
  | { readonly op: "assign"; readonly roleId: string; readonly memberId: string }
  | { readonly op: "unassign"; readonly roleId: string; readonly memberId: string };
export type StoredAdminRoleWrite = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: AdminRoleWriteIntent };
const storageKey = (memberId: string) => `memory-garden:admin-role-write:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const keyPattern = /^[a-z][a-z0-9_-]{1,63}$/u;
const bitsPattern = /^0x[0-9a-f]+$/iu;
const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
function validBits(value: unknown): value is string {
  if (typeof value !== "string" || !bitsPattern.test(value) || value.length > 18) return false;
  try {
    const mask = BigInt(value);
    return mask >= 0n && mask <= ((1n << 64n) - 1n);
  } catch { return false; }
}
function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= 200 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
export function validAdminRoleWrite(value: unknown): value is AdminRoleWriteIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (record.op === "update" && keys.length === 3 && keys.every((key) => ["op", "roleId", "allowBits"].includes(key))) return isId(record.roleId) && validBits(record.allowBits);
  if (record.op === "create" && keys.length === 4 && keys.every((key) => ["op", "key", "name", "allowBits"].includes(key))) {
    return typeof record.key === "string" && keyPattern.test(record.key) && validName(record.name) && validBits(record.allowBits);
  }
  if ((record.op === "assign" || record.op === "unassign") && keys.length === 3 && keys.every((key) => ["op", "roleId", "memberId"].includes(key))) {
    return isId(record.roleId) && isId(record.memberId);
  }
  return false;
}
function plain(intent: AdminRoleWriteIntent): AdminRoleWriteIntent {
  if (intent.op === "update") return { op: "update", roleId: intent.roleId, allowBits: intent.allowBits.toLowerCase() };
  if (intent.op === "create") return { op: "create", key: intent.key, name: intent.name, allowBits: intent.allowBits.toLowerCase() };
  return intent.op === "assign"
    ? { op: "assign", roleId: intent.roleId, memberId: intent.memberId }
    : { op: "unassign", roleId: intent.roleId, memberId: intent.memberId };
}
function same(left: AdminRoleWriteIntent, right: AdminRoleWriteIntent): boolean { return JSON.stringify(plain(left)) === JSON.stringify(plain(right)); }
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("ROLE_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the change is sent. A later read reconciles it; the change is not sent again.
export function loadAdminRoleWrite(memberId: string): StoredAdminRoleWrite {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || !validAdminRoleWrite(value.intent)
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(plain(value.intent)) };
  } catch { return { kind: "blocked" }; }
}
export function saveAdminRoleWrite(memberId: string, intent: AdminRoleWriteIntent): boolean {
  try {
    if (!memberId || !validAdminRoleWrite(intent)) return false;
    const current = loadAdminRoleWrite(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "ready") return same(current.intent, intent);
    const store = storage();
    const key = storageKey(memberId);
    store.setItem(key, JSON.stringify({ version: 1, memberId, intent: plain(intent) }));
    const saved = loadAdminRoleWrite(memberId);
    const ok = saved.kind === "ready" && same(saved.intent, intent);
    if (!ok) store.removeItem(key);
    return ok;
  } catch { return false; }
}
export function clearAdminRoleWrite(memberId: string, intent: AdminRoleWriteIntent): boolean {
  try {
    if (!memberId || !validAdminRoleWrite(intent)) return false;
    const current = loadAdminRoleWrite(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "empty") return true;
    if (!same(current.intent, intent)) return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminRoleWrite(memberId).kind === "empty";
  } catch { return false; }
}
export function discardBlockedAdminRoleWrite(memberId: string): boolean {
  try {
    if (!memberId || loadAdminRoleWrite(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminRoleWrite(memberId).kind === "empty";
  } catch { return false; }
}
