import { MENU_LABEL_KEYS, type MenuSnapshot } from "../../shared/admin-menu-fields";
import type { AdminMenuCreate, AdminMenuUpdate } from "./admin-menus-data";

export type AdminMenuWriteIntent =
  | { readonly op: "update"; readonly id: string; readonly input: AdminMenuUpdate }
  | { readonly op: "create"; readonly input: AdminMenuCreate }
  | { readonly op: "delete"; readonly id: string };
export type StoredAdminMenuWrite = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: AdminMenuWriteIntent };
const storageKey = (memberId: string) => `memory-garden:admin-menu-write:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const keyPattern = /^[a-z][a-z0-9_-]{1,63}$/u;
const pathPattern = /^\/[A-Za-z0-9_\-/:.]*$/u;
const bitsPattern = /^0x[0-9a-f]{1,16}$/iu;
const labels = new Set<string>(MENU_LABEL_KEYS);
const snapshotKeys = ["parentId", "labelKey", "path", "position", "requiredBits", "status", "visible"];
const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
function validBits(value: unknown): value is string {
  if (typeof value !== "string" || !bitsPattern.test(value)) return false;
  try { return BigInt(value) <= 0xffffffffffffffffn; } catch { return false; }
}
function validSnapshot(value: unknown): value is MenuSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === snapshotKeys.length && snapshotKeys.every((key) => keys.includes(key))
    && (record.parentId === null || isId(record.parentId))
    && typeof record.labelKey === "string" && labels.has(record.labelKey)
    && (record.path === null || (typeof record.path === "string" && record.path.length <= 200 && pathPattern.test(record.path)))
    && Number.isSafeInteger(record.position) && Number(record.position) >= 0 && Number(record.position) <= 10000
    && validBits(record.requiredBits)
    && (record.status === "active" || record.status === "disabled")
    && typeof record.visible === "boolean";
}
function validUpdate(value: unknown): value is AdminMenuUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length < 1 || keys.some((key) => key !== "expected" && !snapshotKeys.includes(key))) return false;
  if (!keys.some((key) => key !== "expected")) return false;
  if ("expected" in record && !validSnapshot(record.expected)) return false;
  if ("parentId" in record && record.parentId !== null && !isId(record.parentId)) return false;
  if ("labelKey" in record && (typeof record.labelKey !== "string" || !labels.has(record.labelKey))) return false;
  if ("path" in record && record.path !== null && (typeof record.path !== "string" || record.path.length > 200 || !pathPattern.test(record.path))) return false;
  if ("position" in record && (!Number.isSafeInteger(record.position) || Number(record.position) < 0 || Number(record.position) > 10000)) return false;
  if ("requiredBits" in record && !validBits(record.requiredBits)) return false;
  if ("status" in record && record.status !== "active" && record.status !== "disabled") return false;
  if ("visible" in record && typeof record.visible !== "boolean") return false;
  return true;
}
function validCreate(value: unknown): value is AdminMenuCreate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const expected = ["key", "labelKey", "path", "parentId", "icon", "position", "requiredBits", "groupName"];
  return keys.length === expected.length && expected.every((key) => keys.includes(key))
    && typeof record.key === "string" && keyPattern.test(record.key)
    && typeof record.labelKey === "string" && labels.has(record.labelKey)
    && (record.path === null || (typeof record.path === "string" && record.path.length <= 200 && pathPattern.test(record.path)))
    && (record.parentId === null || isId(record.parentId))
    && (record.icon === null || (typeof record.icon === "string" && record.icon.length <= 128 && !/[\u0000-\u001f\u007f-\u009f]/u.test(record.icon)))
    && Number.isSafeInteger(record.position) && Number(record.position) >= 0 && Number(record.position) <= 10000
    && validBits(record.requiredBits)
    && (record.groupName === "workspace" || record.groupName === "admin");
}
export function validAdminMenuWrite(value: unknown): value is AdminMenuWriteIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (record.op === "delete" && keys.length === 2 && keys.every((key) => key === "op" || key === "id")) return isId(record.id);
  if (record.op === "update" && keys.length === 3 && keys.every((key) => ["op", "id", "input"].includes(key))) return isId(record.id) && validUpdate(record.input);
  if (record.op === "create" && keys.length === 2 && keys.every((key) => key === "op" || key === "input")) return validCreate(record.input);
  return false;
}
function plain(intent: AdminMenuWriteIntent): AdminMenuWriteIntent {
  if (intent.op === "delete") return { op: "delete", id: intent.id };
  if (intent.op === "create") return { op: "create", input: { ...intent.input, requiredBits: intent.input.requiredBits.toLowerCase() } };
  const input = { ...intent.input };
  if (typeof input.requiredBits === "string") input.requiredBits = input.requiredBits.toLowerCase();
  if (input.expected) input.expected = { ...input.expected, requiredBits: input.expected.requiredBits.toLowerCase() };
  return { op: "update", id: intent.id, input };
}
function same(left: AdminMenuWriteIntent, right: AdminMenuWriteIntent): boolean { return JSON.stringify(plain(left)) === JSON.stringify(plain(right)); }
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("MENU_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the change is sent. A later read reconciles it; the change is not sent again.
export function loadAdminMenuWrite(memberId: string): StoredAdminMenuWrite {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || !validAdminMenuWrite(value.intent)
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(plain(value.intent)) };
  } catch { return { kind: "blocked" }; }
}
export function saveAdminMenuWrite(memberId: string, intent: AdminMenuWriteIntent): boolean {
  try {
    if (!memberId || !validAdminMenuWrite(intent)) return false;
    const current = loadAdminMenuWrite(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "ready") return same(current.intent, intent);
    const store = storage();
    const key = storageKey(memberId);
    store.setItem(key, JSON.stringify({ version: 1, memberId, intent: plain(intent) }));
    const saved = loadAdminMenuWrite(memberId);
    const ok = saved.kind === "ready" && same(saved.intent, intent);
    if (!ok) store.removeItem(key);
    return ok;
  } catch { return false; }
}
export function clearAdminMenuWrite(memberId: string, intent: AdminMenuWriteIntent): boolean {
  try {
    if (!memberId || !validAdminMenuWrite(intent)) return false;
    const current = loadAdminMenuWrite(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "empty") return true;
    if (!same(current.intent, intent)) return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminMenuWrite(memberId).kind === "empty";
  } catch { return false; }
}
export function discardBlockedAdminMenuWrite(memberId: string): boolean {
  try {
    if (!memberId || loadAdminMenuWrite(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminMenuWrite(memberId).kind === "empty";
  } catch { return false; }
}
