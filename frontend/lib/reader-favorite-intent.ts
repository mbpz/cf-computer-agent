/** Tab/member/item scoped intent, not a server operation receipt or cross-tab lock. */
export interface ReaderFavoriteIntent { id: string; desired: boolean }
export type StoredFavoriteIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: ReaderFavoriteIntent };
export type FavoriteWritePhase = "idle" | "saving" | "checking" | "unknown" | "blocked";
const validId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const valid = (v: unknown): v is ReaderFavoriteIntent => object(v) && exact(v, ["id", "desired"]) && validId(v.id) && typeof v.desired === "boolean";
const key = (member: string, item: string) => `memory-garden:reader-favorite-intent:v1:${encodeURIComponent(member)}:${encodeURIComponent(item)}`;
const storage = () => window.sessionStorage;
export function loadFavoriteIntent(member: string, item: string): StoredFavoriteIntent {
  try {
    if (!validId(member) || !validId(item)) return { kind: "blocked" };
    const raw = storage().getItem(key(member, item));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 2048) return { kind: "blocked" };
    const v: unknown = JSON.parse(raw);
    if (!object(v) || !exact(v, ["v", "member", "item", "intent"]) || v.v !== 1 || v.member !== member || v.item !== item || !valid(v.intent)) return { kind: "blocked" };
    return { kind: "ready", intent: v.intent };
  } catch { return { kind: "blocked" }; }
}
const same = (a: ReaderFavoriteIntent, b: ReaderFavoriteIntent) => a.id === b.id && a.desired === b.desired;
export function prepareFavoriteIntent(member: string, item: string, intent: ReaderFavoriteIntent) {
  if (!valid(intent) || loadFavoriteIntent(member, item).kind !== "empty") throw new Error("FAVORITE_INTENT_BLOCKED");
  storage().setItem(key(member, item), JSON.stringify({ v: 1, member, item, intent }));
  const saved = loadFavoriteIntent(member, item);
  if (saved.kind !== "ready" || !same(saved.intent, intent)) throw new Error("FAVORITE_INTENT_STORAGE_FAILED");
}
/** Caller must have a validated success or a fresh read equal to the desired state. */
export function finishFavoriteIntent(member: string, item: string, intent: ReaderFavoriteIntent) {
  const saved = loadFavoriteIntent(member, item);
  // A prior successful removal's verification may have thrown. Fresh proof is
  // still required at the caller before clearing its retained in-memory intent.
  if (saved.kind === "empty") return;
  if (saved.kind !== "ready" || !same(saved.intent, intent)) throw new Error("FAVORITE_INTENT_CHANGED");
  storage().removeItem(key(member, item));
  if (storage().getItem(key(member, item)) !== null) throw new Error("FAVORITE_INTENT_STORAGE_FAILED");
}
