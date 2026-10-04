import { canonicalSavedViewFilters, type SavedViewFilters } from "./saved-views-data";

export type SavedViewWriteIntent =
  | { kind: "create"; name: string; filters: SavedViewFilters }
  | { kind: "delete"; id: string };
export type StoredSavedViewWrite = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: SavedViewWriteIntent };
const storageKey = (memberId: string) => `memory-garden:saved-view:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
const isName = (value: unknown): value is string => typeof value === "string" && value === value.trim() && [...value].length >= 1 && [...value].length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
function validFilters(value: unknown): value is SavedViewFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const filters = value as Record<string, unknown>;
  if (Object.keys(filters).length !== 6 || filters.v !== 1 || typeof filters.q !== "string" || filters.q !== filters.q.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(filters.q)) return false;
  if (filters.tagMode !== "and" && filters.tagMode !== "or") return false;
  if (!Array.isArray(filters.tagIds) || filters.tagIds.length > 20 || filters.tagIds.some(id => !isId(id))) return false;
  return [filters.spaceId, filters.collectionId].every(id => id === null || isId(id));
}
export function validSavedViewWrite(value: unknown): value is SavedViewWriteIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.kind === "create") return Object.keys(record).length === 3 && isName(record.name) && validFilters(record.filters);
  if (record.kind === "delete") return Object.keys(record).length === 2 && isId(record.id);
  return false;
}
function same(left: SavedViewWriteIntent, right: SavedViewWriteIntent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("SAVED_VIEW_STORAGE_UNAVAILABLE");
  return value;
}
function freezeIntent(intent: SavedViewWriteIntent): SavedViewWriteIntent {
  if (intent.kind === "delete") {
    const next: SavedViewWriteIntent = { kind: "delete", id: intent.id };
    Object.freeze(next);
    return next;
  }
  const next: SavedViewWriteIntent = { kind: "create", name: intent.name, filters: { ...intent.filters, tagIds: [...intent.filters.tagIds] } };
  Object.freeze(next.filters.tagIds); Object.freeze(next.filters); Object.freeze(next);
  return next;
}
export function loadSavedViewWrite(memberId: string): StoredSavedViewWrite {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || !validSavedViewWrite(value.intent)
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: freezeIntent(value.intent) };
  } catch { return { kind: "blocked" }; }
}
export function saveSavedViewWrite(memberId: string, intent: SavedViewWriteIntent): boolean {
  try {
    const stored = intent.kind === "delete"
      ? { kind: "delete" as const, id: intent.id }
      : { kind: "create" as const, name: intent.name.trim(), filters: canonicalSavedViewFilters(intent.filters) };
    if (!validSavedViewWrite(stored) || loadSavedViewWrite(memberId).kind !== "empty") return false;
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent: stored }));
    const saved = loadSavedViewWrite(memberId);
    return saved.kind === "ready" && same(saved.intent, freezeIntent(stored));
  } catch { return false; }
}
export function clearSavedViewWrite(memberId: string, intent: SavedViewWriteIntent): boolean {
  try {
    const previous = loadSavedViewWrite(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, freezeIntent(intent.kind === "delete" ? intent : { kind: "create", name: intent.name.trim(), filters: canonicalSavedViewFilters(intent.filters) })))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
export function discardBlockedSavedViewWrite(memberId: string): boolean {
  try {
    if (!memberId || loadSavedViewWrite(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
