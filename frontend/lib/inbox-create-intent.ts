export interface InboxCreateIntent { readonly id: string; readonly clientKey: string; readonly kind: "text" | "link"; readonly content: string; readonly sourceUrl: string | null; }
export type StoredInboxIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: InboxCreateIntent; acknowledged: boolean };
const storageKey = (memberId: string) => `memory-garden:inbox-create:v1:${encodeURIComponent(memberId)}`;
const same = (a: InboxCreateIntent, b: InboxCreateIntent) => a.id === b.id && a.clientKey === b.clientKey && a.kind === b.kind && a.content === b.content && a.sourceUrl === b.sourceUrl;
export function validInboxIntent(value: unknown): value is InboxCreateIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as InboxCreateIntent;
  return Object.keys(v).length === 5 && Object.keys(v).every(key => ["id", "clientKey", "kind", "content", "sourceUrl"].includes(key))
    && [v.id, v.clientKey].every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id))
    && typeof v.content === "string" && !!v.content.trim() && v.content === v.content.trim() && v.content.length <= 200000
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v.content)
    && ((v.kind === "text" && v.sourceUrl === null) || (v.kind === "link" && validSource(v.sourceUrl)));
}
function validSource(value: unknown): boolean {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2048 || !/^https?:\/\//u.test(value)) return false;
  try { const url = new URL(value); return !!url.hostname && ["http:", "https:"].includes(url.protocol); } catch { return false; }
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("INBOX_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Never silently replace a malformed record or a different unresolved creation.
export function loadInboxIntent(memberId: string): StoredInboxIntent {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 2_500_000) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || typeof v.acknowledged !== "boolean" || !validInboxIntent(v.intent)
      || Object.keys(v).length !== 4 || Object.keys(v).some(key => !["version", "memberId", "intent", "acknowledged"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent), acknowledged: v.acknowledged };
  } catch { return { kind: "blocked" }; }
}
function persist(memberId: string, intent: InboxCreateIntent, acknowledge: boolean): boolean {
  try {
    if (!validInboxIntent(intent)) return false;
    const previous = loadInboxIntent(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent)) || (acknowledge && previous.kind !== "ready")) return false;
    const acknowledged = acknowledge || (previous.kind === "ready" && previous.acknowledged);
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent, acknowledged }));
    const saved = loadInboxIntent(memberId);
    return saved.kind === "ready" && same(saved.intent, intent) && saved.acknowledged === acknowledged;
  } catch { return false; }
}
export function saveInboxIntent(memberId: string, intent: InboxCreateIntent): boolean { return persist(memberId, intent, false); }
export function acknowledgeInboxIntent(memberId: string, intent: InboxCreateIntent): boolean { return persist(memberId, intent, true); }
export function clearInboxIntent(memberId: string, intent: InboxCreateIntent): boolean {
  try {
    const previous = loadInboxIntent(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
