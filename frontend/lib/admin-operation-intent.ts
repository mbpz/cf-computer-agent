/**
 * The two destructive administrator operations (reclaiming orphaned asset
 * objects, closing/reopening admission for maintenance) are recorded server-side
 * under a client operation number: a retry under the same number replays the
 * recorded result instead of acting twice. This module keeps that number, with
 * the exact confirmed intent, in tab-scoped session storage so an unknown
 * outcome survives a refresh in the same tab and can be retried unchanged.
 */
export type AdminOperationIntent =
  | { readonly op: "reclaim"; readonly operationId: string; readonly keys: readonly string[] }
  | { readonly op: "drain" | "resume"; readonly operationId: string; readonly window: string; readonly epoch: number };

export type StoredAdminOperation = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: AdminOperationIntent };

const storageKey = (memberId: string) => `memory-garden:admin-operation:v1:${encodeURIComponent(memberId)}`;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const windowPattern = /^[A-Za-z0-9_-]{1,128}$/u;
/** The server's own bound on one reclamation request. */
const MAX_RECLAIM_KEYS = 50;
const MAX_KEY_LENGTH = 512;
const fields: Record<AdminOperationIntent["op"], readonly string[]> = {
  reclaim: ["op", "operationId", "keys"],
  drain: ["op", "operationId", "window", "epoch"],
  resume: ["op", "operationId", "window", "epoch"],
};

function plain(intent: AdminOperationIntent): AdminOperationIntent {
  return intent.op === "reclaim"
    ? { op: "reclaim", operationId: intent.operationId, keys: [...intent.keys] }
    : { op: intent.op, operationId: intent.operationId, window: intent.window, epoch: intent.epoch };
}

function freeze(intent: AdminOperationIntent): AdminOperationIntent {
  return Object.freeze(plain(intent));
}

function storage(): Storage {
  const host: unknown = Reflect.get(globalThis, "window");
  const candidate: unknown = host === null || typeof host !== "object" ? undefined : Reflect.get(host, "sessionStorage");
  if (candidate === null || typeof candidate !== "object"
    || typeof Reflect.get(candidate, "getItem") !== "function"
    || typeof Reflect.get(candidate, "setItem") !== "function"
    || typeof Reflect.get(candidate, "removeItem") !== "function") {
    throw new Error("ADMIN_OPERATION_STORAGE_UNAVAILABLE");
  }
  // Web Storage is a well-known host object; the surface above is checked at runtime.
  return candidate as Storage;
}

function isOrphanKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY_LENGTH
    && (value.startsWith("staging/") || value.startsWith("parsed/"))
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function validAdminOperationIntent(value: unknown): value is AdminOperationIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const op = record.op;
  if (op !== "reclaim" && op !== "drain" && op !== "resume") return false;
  const allowed = fields[op];
  const keys = Object.keys(record);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return false;
  if (typeof record.operationId !== "string" || !operationIdPattern.test(record.operationId)) return false;
  if (op === "reclaim") {
    const list = record.keys;
    return Array.isArray(list) && list.length > 0 && list.length <= MAX_RECLAIM_KEYS
      && list.every(isOrphanKey) && new Set(list).size === list.length;
  }
  return typeof record.window === "string" && windowPattern.test(record.window)
    && Number.isSafeInteger(record.epoch) && Number(record.epoch) >= 0;
}

function parse(value: unknown): AdminOperationIntent | null {
  return validAdminOperationIntent(value) ? freeze(value) : null;
}

// Tab-scoped and member-scoped, like the other intent records: a different member
// in the same tab, or a closed tab, must never inherit a pending destructive write.
export function loadAdminOperation(memberId: string): StoredAdminOperation {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 16_384) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) {
      return { kind: "blocked" };
    }
    const intent = parse(value.intent);
    return intent ? { kind: "ready", intent } : { kind: "blocked" };
  } catch { return { kind: "blocked" }; }
}

/**
 * Records (or reuses) the identity of one operation. The same intent keeps the
 * operation number it was first recorded with, so a retry replays that attempt;
 * changing the intent mints a new number.
 */
export function saveAdminOperation(memberId: string, intent: AdminOperationIntent): AdminOperationIntent | null {
  try {
    if (!memberId || !validAdminOperationIntent(intent)) return null;
    const current = loadAdminOperation(memberId);
    if (current.kind === "blocked") return null;
    const record = plain(intent);
    if (current.kind === "ready" && sameIntent(current.intent, record)) return current.intent;
    const store = storage();
    const key = storageKey(memberId);
    const previous = store.getItem(key);
    store.setItem(key, JSON.stringify({ version: 1, memberId, intent: record }));
    const saved = loadAdminOperation(memberId);
    const ok = saved.kind === "ready" && sameIntent(saved.intent, record);
    if (!ok) {
      if (previous === null) store.removeItem(key);
      else store.setItem(key, previous);
      return null;
    }
    return saved.intent;
  } catch { return null; }
}

export function sameIntent(left: AdminOperationIntent, right: AdminOperationIntent): boolean {
  if (left.op !== right.op || left.operationId !== right.operationId) return false;
  if (left.op === "reclaim" && right.op === "reclaim") {
    return left.keys.length === right.keys.length && left.keys.every((key, index) => key === right.keys[index]);
  }
  if (left.op !== "reclaim" && right.op !== "reclaim") {
    return left.window === right.window && left.epoch === right.epoch;
  }
  return false;
}

export function clearAdminOperation(memberId: string, operationId: string): boolean {
  try {
    if (!memberId || !operationIdPattern.test(operationId)) return false;
    const current = loadAdminOperation(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "empty") return true;
    if (current.intent.operationId !== operationId) return true;
    storage().removeItem(storageKey(memberId));
    return loadAdminOperation(memberId).kind === "empty";
  } catch { return false; }
}

export function discardBlockedAdminOperation(memberId: string): boolean {
  try {
    if (!memberId || loadAdminOperation(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminOperation(memberId).kind === "empty";
  } catch { return false; }
}

export function newAdminOperationId(): string {
  return crypto.randomUUID();
}
