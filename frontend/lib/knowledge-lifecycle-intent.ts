/**
 * The stable client identity of one administrator knowledge write.
 *
 * A knowledge lifecycle write (trash, restore, purge, rollback) is recorded in
 * the tab before it is sent, so a lost response can resend the *same* operation
 * number and the *same* body: the server then replays its recorded result
 * instead of acting twice. The record is stored per member and per knowledge
 * item, plus one `current` pointer so a refresh can find the single unresolved
 * operation. Nothing here talks to the network; it only freezes and stores the
 * exact request a surface decided to send.
 */

export type KnowledgeLifecycleAction = "trash" | "restore" | "purge" | "rollback";

/** The exact write a surface froze: method, path and body, replayable byte for byte. */
export interface KnowledgeLifecycleOperation {
  readonly id: string;
  readonly action: KnowledgeLifecycleAction;
  readonly method: "POST";
  readonly path: string;
  readonly body: string;
}

export type StoredKnowledgeLifecycleOperation =
  | { kind: "empty" }
  | { kind: "blocked" }
  | { kind: "ready"; operation: KnowledgeLifecycleOperation };

const storageKey = (memberId: string, knowledgeItemId: string) =>
  `memory-garden:knowledge-lifecycle:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(knowledgeItemId)}`;
const currentKey = (memberId: string) =>
  `memory-garden:knowledge-lifecycle-current:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9_-]+$/u;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const actions: Record<KnowledgeLifecycleAction, true> = { trash: true, restore: true, purge: true, rollback: true };
const bodyKeys: Record<KnowledgeLifecycleAction, readonly string[]> = {
  trash: ["operationId"],
  restore: ["operationId"],
  purge: ["operationId", "confirm"],
  rollback: ["operationId", "revisionId"],
};

function isId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function isAction(value: unknown): value is KnowledgeLifecycleAction {
  return typeof value === "string" && Object.hasOwn(actions, value);
}

function expectedPath(knowledgeItemId: string, action: KnowledgeLifecycleAction): string {
  return `/api/admin/knowledge/${encodeURIComponent(knowledgeItemId)}/${action}`;
}

function newOperationId(): string {
  const available = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
  const value: string | undefined = available ? crypto.randomUUID() : undefined;
  if (typeof value !== "string" || !operationIdPattern.test(value)) throw new Error("KNOWLEDGE_LIFECYCLE_REQUEST_INVALID");
  return value;
}

function validOperationBody(action: KnowledgeLifecycleAction, body: string): boolean {
  if (body.length > 16000) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return false; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...bodyKeys[action]].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  if (typeof record.operationId !== "string" || !operationIdPattern.test(record.operationId)) return false;
  if (action === "purge") return typeof record.confirm === "string" && record.confirm.length > 0 && record.confirm.length <= 512;
  if (action === "rollback") return typeof record.revisionId === "string" && isId(record.revisionId);
  return true;
}

export function validKnowledgeLifecycleOperation(value: unknown): value is KnowledgeLifecycleOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 5 || !isId(record.id) || !isAction(record.action)) return false;
  const action = record.action;
  if (record.method !== "POST") return false;
  if (record.path !== expectedPath(record.id, action)) return false;
  return typeof record.body === "string" && validOperationBody(action, record.body);
}

/**
 * Freezes the write for one knowledge item. `operationId` is reused verbatim when
 * supplied; otherwise a fresh number is minted. This throws
 * `KNOWLEDGE_LIFECYCLE_REQUEST_INVALID` when the action's required input is
 * missing, so a purge can never be prepared without the typed identifier and a
 * rollback can never be prepared without a target revision.
 */
export function prepareKnowledgeLifecycleOperation(
  knowledgeItemId: string,
  action: KnowledgeLifecycleAction,
  input: { revisionId?: string; confirm?: string } = {},
  operationId?: string,
): KnowledgeLifecycleOperation {
  if (!isId(knowledgeItemId) || !isAction(action)) throw new Error("KNOWLEDGE_LIFECYCLE_REQUEST_INVALID");
  if (operationId !== undefined && (typeof operationId !== "string" || !operationIdPattern.test(operationId))) {
    throw new Error("KNOWLEDGE_LIFECYCLE_REQUEST_INVALID");
  }
  const id = operationId ?? newOperationId();
  let body: Record<string, unknown>;
  if (action === "purge") {
    if (typeof input.confirm !== "string" || input.confirm.length === 0 || input.confirm.length > 512) {
      throw new Error("KNOWLEDGE_LIFECYCLE_REQUEST_INVALID");
    }
    body = { operationId: id, confirm: input.confirm };
  } else if (action === "rollback") {
    if (typeof input.revisionId !== "string" || !isId(input.revisionId)) {
      throw new Error("KNOWLEDGE_LIFECYCLE_REQUEST_INVALID");
    }
    body = { operationId: id, revisionId: input.revisionId };
  } else {
    body = { operationId: id };
  }
  const operation: KnowledgeLifecycleOperation = {
    id: knowledgeItemId,
    action,
    method: "POST",
    path: expectedPath(knowledgeItemId, action),
    body: JSON.stringify(body),
  };
  if (!validKnowledgeLifecycleOperation(operation)) throw new Error("KNOWLEDGE_LIFECYCLE_REQUEST_INVALID");
  return freezeOperation(operation);
}

function same(left: KnowledgeLifecycleOperation, right: KnowledgeLifecycleOperation): boolean {
  return left.id === right.id && left.action === right.action && left.method === right.method
    && left.path === right.path && left.body === right.body;
}

function storage(): Storage {
  const value: Storage | undefined = typeof window === "undefined" ? undefined : window.sessionStorage;
  if (!value) throw new Error("KNOWLEDGE_LIFECYCLE_STORAGE_UNAVAILABLE");
  return value;
}

function freezeOperation(operation: KnowledgeLifecycleOperation): KnowledgeLifecycleOperation {
  const next: KnowledgeLifecycleOperation = {
    id: operation.id,
    action: operation.action,
    method: operation.method,
    path: operation.path,
    body: operation.body,
  };
  Object.freeze(next);
  return next;
}

export function loadKnowledgeLifecycleOperation(memberId: string, knowledgeItemId: string): StoredKnowledgeLifecycleOperation {
  try {
    if (!memberId || !isId(knowledgeItemId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, knowledgeItemId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 20000) return { kind: "blocked" };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "blocked" };
    const value = parsed as Record<string, unknown>;
    const operation = value.operation;
    if (!validKnowledgeLifecycleOperation(operation)) return { kind: "blocked" };
    if (value.version !== 1 || value.memberId !== memberId || value.knowledgeItemId !== knowledgeItemId
      || operation.id !== knowledgeItemId || Object.keys(value).length !== 4
      || Object.keys(value).some((key) => !["version", "memberId", "knowledgeItemId", "operation"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", operation: freezeOperation(operation) };
  } catch { return { kind: "blocked" }; }
}

export function saveKnowledgeLifecycleOperation(memberId: string, operation: KnowledgeLifecycleOperation): boolean {
  try {
    const stored = {
      id: operation.id,
      action: operation.action,
      method: operation.method,
      path: operation.path,
      body: operation.body,
    };
    if (!memberId || !validKnowledgeLifecycleOperation(stored)) return false;
    if (loadKnowledgeLifecycleOperation(memberId, stored.id).kind !== "empty") return false;
    const box = storage();
    box.setItem(storageKey(memberId, stored.id), JSON.stringify({ version: 1, memberId, knowledgeItemId: stored.id, operation: stored }));
    box.setItem(currentKey(memberId), stored.id);
    const saved = loadKnowledgeLifecycleOperation(memberId, stored.id);
    if (!(saved.kind === "ready" && same(saved.operation, stored) && box.getItem(currentKey(memberId)) === stored.id)) {
      box.removeItem(storageKey(memberId, stored.id));
      if (box.getItem(currentKey(memberId)) === stored.id) box.removeItem(currentKey(memberId));
      return false;
    }
    return true;
  } catch { return false; }
}

export function clearKnowledgeLifecycleOperation(memberId: string, operation: KnowledgeLifecycleOperation): boolean {
  try {
    const previous = loadKnowledgeLifecycleOperation(memberId, operation.id);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.operation, operation))) return false;
    const box = storage();
    box.removeItem(storageKey(memberId, operation.id));
    if (box.getItem(currentKey(memberId)) === operation.id) box.removeItem(currentKey(memberId));
    return box.getItem(storageKey(memberId, operation.id)) === null && box.getItem(currentKey(memberId)) !== operation.id;
  } catch { return false; }
}

export function loadCurrentKnowledgeLifecycleOperation(memberId: string): StoredKnowledgeLifecycleOperation {
  try {
    if (!memberId) return { kind: "blocked" };
    const pointer = storage().getItem(currentKey(memberId));
    if (pointer === null) return { kind: "empty" };
    if (!isId(pointer)) return { kind: "blocked" };
    const stored = loadKnowledgeLifecycleOperation(memberId, pointer);
    if (stored.kind !== "ready" || stored.operation.id !== pointer) return { kind: "blocked" };
    return stored;
  } catch { return { kind: "blocked" }; }
}

export function discardBlockedKnowledgeLifecycleOperation(memberId: string): boolean {
  try {
    if (!memberId || loadCurrentKnowledgeLifecycleOperation(memberId).kind !== "blocked") return false;
    const box = storage();
    const pointer = box.getItem(currentKey(memberId));
    box.removeItem(currentKey(memberId));
    if (pointer && isId(pointer) && loadKnowledgeLifecycleOperation(memberId, pointer).kind === "blocked") {
      box.removeItem(storageKey(memberId, pointer));
    }
    return loadCurrentKnowledgeLifecycleOperation(memberId).kind === "empty";
  } catch { return false; }
}
