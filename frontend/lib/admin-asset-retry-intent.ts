export type AdminAssetRetryIntent = { readonly id: string };
export type StoredAdminAssetRetry = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intents: readonly AdminAssetRetryIntent[] };
const storageKey = (memberId: string) => `memory-garden:admin-asset-retry:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
function isId(value: unknown): value is string { return typeof value === "string" && idPattern.test(value); }
export function validAdminAssetRetry(value: unknown): value is AdminAssetRetryIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && isId(record.id);
}
function plain(intent: AdminAssetRetryIntent): AdminAssetRetryIntent { return { id: intent.id }; }
function freeze(intent: AdminAssetRetryIntent): AdminAssetRetryIntent { return Object.freeze(plain(intent)); }
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("ASSET_RETRY_STORAGE_UNAVAILABLE");
  return value;
}
function parseIntents(value: unknown): AdminAssetRetryIntent[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 || !value.every(validAdminAssetRetry)) return null;
  if (new Set(value.map((item) => item.id)).size !== value.length) return null;
  return value.map(freeze);
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the retry is sent. A later queue read that shows the row clears it; the POST is not replayed.
export function loadAdminAssetRetries(memberId: string): StoredAdminAssetRetry {
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
export function saveAdminAssetRetry(memberId: string, intent: AdminAssetRetryIntent): boolean {
  try {
    if (!memberId || !validAdminAssetRetry(intent)) return false;
    const current = loadAdminAssetRetries(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "ready" && current.intents.some((item) => item.id === intent.id)) return true;
    if (current.kind === "ready" && current.intents.length >= 20) return false;
    const intents = [...(current.kind === "ready" ? current.intents.map(plain) : []), plain(intent)];
    const store = storage();
    const key = storageKey(memberId);
    const previous = store.getItem(key);
    store.setItem(key, JSON.stringify({ version: 1, memberId, intents }));
    const saved = loadAdminAssetRetries(memberId);
    const ok = saved.kind === "ready" && saved.intents.some((item) => item.id === intent.id);
    if (!ok) {
      if (previous === null) store.removeItem(key);
      else store.setItem(key, previous);
    }
    return ok;
  } catch { return false; }
}
export function clearAdminAssetRetry(memberId: string, id: string): boolean {
  try {
    if (!memberId || !isId(id)) return false;
    const current = loadAdminAssetRetries(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "empty") return true;
    if (!current.intents.some((item) => item.id === id)) return true;
    const intents = current.intents.filter((item) => item.id !== id).map(plain);
    const store = storage();
    const key = storageKey(memberId);
    if (intents.length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify({ version: 1, memberId, intents }));
    const saved = loadAdminAssetRetries(memberId);
    return saved.kind === "empty" || (saved.kind === "ready" && saved.intents.every((item) => item.id !== id));
  } catch { return false; }
}
export function discardBlockedAdminAssetRetry(memberId: string): boolean {
  try {
    if (!memberId || loadAdminAssetRetries(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminAssetRetries(memberId).kind === "empty";
  } catch { return false; }
}
