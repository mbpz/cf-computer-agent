// Tab-scoped, member/item-scoped identity for one reader visit.
//
// The reader records a visit when it reads a knowledge item's detail. A read
// whose response is lost must be retried with the *same* identity so the server
// does not count it twice, while a genuinely new visit gets a new identity and
// still counts. The identity is cleared once the visit has been recorded.

export type StoredReaderVisitIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; identity: string };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const key = (member: string, item: string) => `memory-garden:reader-visit-intent:v1:${encodeURIComponent(member)}:${encodeURIComponent(item)}`;
const isId = (value: unknown): value is string => typeof value === "string" && ID_PATTERN.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));

function storage(): Storage | null {
  try { return (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage ?? null; } catch { return null; }
}

export function loadReaderVisitIntent(member: string, item: string): StoredReaderVisitIntent {
  if (!isId(member) || !isId(item)) return { kind: "blocked" };
  try {
    const store = storage();
    if (!store) return { kind: "blocked" };
    const raw = store.getItem(key(member, item));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 4096) return { kind: "blocked" };
    const value: unknown = JSON.parse(raw);
    if (!object(value) || !exact(value, ["version", "member", "item", "identity"])
      || value.version !== 1 || value.member !== member || value.item !== item || !isId(value.identity)) return { kind: "blocked" };
    return { kind: "ready", identity: value.identity };
  } catch { return { kind: "blocked" }; }
}

/**
 * The identity to send for one detail read. A stored identity is reused so a
 * retried read is not counted twice; when none exists a fresh identity is
 * recorded. `null` means the read proceeds without an identity (unkeyed reads
 * still count server-side). A malformed record is treated as absent and is
 * never overwritten with a different value.
 */
export function openReaderVisitIntent(member: string, item: string, id: () => string = () => crypto.randomUUID()): string | null {
  const current = loadReaderVisitIntent(member, item);
  if (current.kind === "ready") return current.identity;
  if (current.kind === "blocked") return null;
  const identity = id();
  if (!isId(identity)) return null;
  try {
    const store = storage();
    if (!store) return null;
    store.setItem(key(member, item), JSON.stringify({ version: 1, member, item, identity }));
    const saved = loadReaderVisitIntent(member, item);
    return saved.kind === "ready" && saved.identity === identity ? identity : null;
  } catch { return null; }
}

/** Clears only the identity that was actually sent, never a newer one. */
export function clearReaderVisitIntent(member: string, item: string, identity: string): void {
  try {
    const current = loadReaderVisitIntent(member, item);
    if (current.kind !== "ready" || current.identity !== identity) return;
    storage()?.removeItem(key(member, item));
  } catch { /* A failed cleanup cannot block the read; it only risks one extra count. */ }
}
