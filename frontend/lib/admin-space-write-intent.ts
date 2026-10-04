import type { AdminSpaceCommand } from "./admin-spaces-data";

export type AdminSpaceWriteIntent =
  | { readonly op: "create"; readonly slug: string; readonly name: string }
  | { readonly op: "manage"; readonly command: AdminSpaceCommand };
export type StoredAdminSpaceWrite = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: AdminSpaceWriteIntent };
const storageKey = (memberId: string) => `memory-garden:admin-space-write:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
const isStamp = (value: unknown): value is string => typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
function fields(value: unknown, extra: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const expected = ["name", "description", "status", "position", ...extra];
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) return null;
  if (typeof record.name !== "string" || record.name.trim().length < 1 || record.name.length > 120) return null;
  if (typeof record.description !== "string" || record.description.length > 1000) return null;
  if (record.status !== "active" && record.status !== "disabled") return null;
  if (!Number.isSafeInteger(record.position) || Number(record.position) < 0 || Number(record.position) > 1_000_000) return null;
  return record;
}
export function validAdminSpaceWrite(value: unknown): value is AdminSpaceWriteIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (record.op === "create" && keys.length === 3 && keys.every((key) => key === "op" || key === "slug" || key === "name")) {
    return typeof record.slug === "string" && record.slug.length <= 80 && slugPattern.test(record.slug)
      && typeof record.name === "string" && record.name.trim().length >= 1 && record.name.length <= 120;
  }
  if (record.op !== "manage" || keys.length !== 2 || !keys.every((key) => key === "op" || key === "command")) return false;
  return validCommand(record.command);
}
function validCommand(value: unknown): value is AdminSpaceCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const keys = Object.keys(command);
  if (!isId(command.spaceId)) return false;
  if (command.kind === "space" && keys.length === 3 && keys.every((key) => ["kind", "spaceId", "input"].includes(key))) {
    const input = fields(command.input, ["slug", "expectedUpdatedAt"]);
    return Boolean(input && typeof input.slug === "string" && input.slug.length <= 80 && slugPattern.test(input.slug) && isStamp(input.expectedUpdatedAt));
  }
  if (command.kind === "create-collection" && keys.length === 4 && keys.every((key) => ["kind", "spaceId", "requestKey", "input"].includes(key))) {
    const input = fields(command.input, ["parentId"]);
    return typeof command.requestKey === "string" && uuidPattern.test(command.requestKey) && Boolean(input && (input.parentId === null || isId(input.parentId)));
  }
  if (command.kind === "collection" && keys.length === 4 && keys.every((key) => ["kind", "spaceId", "collectionId", "input"].includes(key))) {
    const input = fields(command.input, ["parentId", "expectedUpdatedAt"]);
    return isId(command.collectionId) && Boolean(input && (input.parentId === null || isId(input.parentId)) && isStamp(input.expectedUpdatedAt));
  }
  return false;
}
function plain(intent: AdminSpaceWriteIntent): AdminSpaceWriteIntent {
  if (intent.op === "create") return { op: "create", slug: intent.slug, name: intent.name };
  const command = intent.command;
  if (command.kind === "space") return { op: "manage", command: { kind: "space", spaceId: command.spaceId, input: { ...command.input } } };
  if (command.kind === "create-collection") return { op: "manage", command: { kind: "create-collection", spaceId: command.spaceId, requestKey: command.requestKey, input: { ...command.input } } };
  return { op: "manage", command: { kind: "collection", spaceId: command.spaceId, collectionId: command.collectionId, input: { ...command.input } } };
}
function same(left: AdminSpaceWriteIntent, right: AdminSpaceWriteIntent): boolean { return JSON.stringify(plain(left)) === JSON.stringify(plain(right)); }
function freeze(intent: AdminSpaceWriteIntent): AdminSpaceWriteIntent { return Object.freeze(plain(intent)); }
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("SPACE_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the change is sent. A later read reconciles it; the change is not sent again.
export function loadAdminSpaceWrite(memberId: string): StoredAdminSpaceWrite {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 16384) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || !validAdminSpaceWrite(value.intent)
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: freeze(value.intent) };
  } catch { return { kind: "blocked" }; }
}
export function saveAdminSpaceWrite(memberId: string, intent: AdminSpaceWriteIntent): boolean {
  try {
    if (!memberId || !validAdminSpaceWrite(intent)) return false;
    const current = loadAdminSpaceWrite(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "ready") return same(current.intent, intent);
    const store = storage();
    const key = storageKey(memberId);
    store.setItem(key, JSON.stringify({ version: 1, memberId, intent: plain(intent) }));
    const saved = loadAdminSpaceWrite(memberId);
    const ok = saved.kind === "ready" && same(saved.intent, intent);
    if (!ok) store.removeItem(key);
    return ok;
  } catch { return false; }
}
export function clearAdminSpaceWrite(memberId: string, intent: AdminSpaceWriteIntent): boolean {
  try {
    if (!memberId || !validAdminSpaceWrite(intent)) return false;
    const current = loadAdminSpaceWrite(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "empty") return true;
    if (!same(current.intent, intent)) return false;
    const store = storage();
    store.removeItem(storageKey(memberId));
    return loadAdminSpaceWrite(memberId).kind === "empty";
  } catch { return false; }
}
export function discardBlockedAdminSpaceWrite(memberId: string): boolean {
  try {
    if (!memberId || loadAdminSpaceWrite(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminSpaceWrite(memberId).kind === "empty";
  } catch { return false; }
}
