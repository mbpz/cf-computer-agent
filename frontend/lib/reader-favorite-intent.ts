/**
 * Member+target scoped intent record, shared across every tab of the same
 * origin through localStorage. Its `id` is transmitted to the server as the
 * operation number: the same number is retried without a second effect, and the
 * exact recorded result is queried back by number. The record is still not a
 * cross-device backup and still not a lock; it is a durable hint that this
 * origin has an unresolved write for this member+target.
 *
 * The medium changed from sessionStorage to localStorage in the
 * cross-refresh/cross-tab slice (2026-10-11). Pre-existing sessionStorage-only
 * records are NOT migrated, so a pending record written before the change
 * becomes invisible in the new store. Deliberate: there are no releases yet,
 * so no legacy fallback is built.
 */
export interface ReaderFavoriteIntent { id: string; desired: boolean }
export type StoredFavoriteIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: ReaderFavoriteIntent };
export type FavoriteWritePhase = "idle" | "saving" | "checking" | "unknown" | "blocked";
type FavoriteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const validId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const valid = (v: unknown): v is ReaderFavoriteIntent => object(v) && exact(v, ["id", "desired"]) && validId(v.id) && typeof v.desired === "boolean";
export const favoriteIntentKey = (member: string, item: string) => `memory-garden:reader-favorite-intent:v1:${encodeURIComponent(member)}:${encodeURIComponent(item)}`;
const defaultStorage = (): FavoriteStorage => {
  // The DOM `window` global is absent from the Worker lib set, so read the host
  // global at runtime; Storage is declared for both libs but localStorage is not.
  const host = globalThis as { window?: { localStorage?: Storage } };
  if (!host.window?.localStorage) throw new Error("FAVORITE_INTENT_STORAGE_FAILED");
  return host.window.localStorage;
};
export function loadFavoriteIntent(member: string, item: string, storage?: FavoriteStorage): StoredFavoriteIntent {
  try {
    if (!validId(member) || !validId(item)) return { kind: "blocked" };
    const raw = (storage ?? defaultStorage()).getItem(favoriteIntentKey(member, item));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 2048) return { kind: "blocked" };
    const v: unknown = JSON.parse(raw);
    if (!object(v) || !exact(v, ["v", "member", "item", "intent"]) || v.v !== 1 || v.member !== member || v.item !== item || !valid(v.intent)) return { kind: "blocked" };
    return { kind: "ready", intent: v.intent };
  } catch { return { kind: "blocked" }; }
}
const same = (a: ReaderFavoriteIntent, b: ReaderFavoriteIntent) => a.id === b.id && a.desired === b.desired;
export function prepareFavoriteIntent(member: string, item: string, intent: ReaderFavoriteIntent, storage?: FavoriteStorage) {
  const target = storage ?? defaultStorage();
  if (!valid(intent) || loadFavoriteIntent(member, item, target).kind !== "empty") throw new Error("FAVORITE_INTENT_BLOCKED");
  target.setItem(favoriteIntentKey(member, item), JSON.stringify({ v: 1, member, item, intent }));
  const saved = loadFavoriteIntent(member, item, target);
  if (saved.kind !== "ready" || !same(saved.intent, intent)) throw new Error("FAVORITE_INTENT_STORAGE_FAILED");
}
/** Caller must hold the server's receipt for this exact operation number. */
export function finishFavoriteIntent(member: string, item: string, intent: ReaderFavoriteIntent, storage?: FavoriteStorage) {
  const target = storage ?? defaultStorage();
  const saved = loadFavoriteIntent(member, item, target);
  // A prior successful removal's verification may have thrown. Fresh proof is
  // still required at the caller before clearing its retained in-memory intent.
  if (saved.kind === "empty") return;
  if (saved.kind !== "ready" || !same(saved.intent, intent)) throw new Error("FAVORITE_INTENT_CHANGED");
  target.removeItem(favoriteIntentKey(member, item));
  if (target.getItem(favoriteIntentKey(member, item)) !== null) throw new Error("FAVORITE_INTENT_STORAGE_FAILED");
}
