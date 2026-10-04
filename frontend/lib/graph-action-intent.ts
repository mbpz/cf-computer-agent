import type { GraphNode } from "./graph-data";

export interface GraphActionIntent {
  readonly clientKey: string;
  readonly node: GraphNode;
}
export type StoredGraphAction = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: GraphActionIntent };
const storageKey = (memberId: string) => `memory-garden:graph-action:v1:${encodeURIComponent(memberId)}`;
const kinds = new Set(["knowledge", "task", "project", "decision"]);
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
export function validGraphAction(value: unknown): value is GraphActionIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !isText(record.clientKey, 180)) return false;
  const node = record.node;
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const fields = node as Record<string, unknown>;
  return Object.keys(fields).length === 5
    && isText(fields.id, 128)
    && typeof fields.kind === "string" && kinds.has(fields.kind)
    && isText(fields.label, 500)
    && (fields.status === null || isText(fields.status, 64))
    && (fields.href === null || isText(fields.href, 256));
}
function same(left: GraphActionIntent, right: GraphActionIntent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("GRAPH_STORAGE_UNAVAILABLE");
  return value;
}
function freezeIntent(intent: GraphActionIntent): GraphActionIntent {
  return Object.freeze({
    clientKey: intent.clientKey,
    node: Object.freeze({ ...intent.node, metadata: {} }),
  });
}
export function loadGraphAction(memberId: string): StoredGraphAction {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || !validGraphAction(value.intent)
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: freezeIntent(value.intent) };
  } catch { return { kind: "blocked" }; }
}
export function saveGraphAction(memberId: string, intent: GraphActionIntent): boolean {
  try {
    const stored = { clientKey: intent.clientKey, node: { id: intent.node.id, kind: intent.node.kind, label: intent.node.label, status: intent.node.status, href: intent.node.href } };
    if (!validGraphAction(stored) || loadGraphAction(memberId).kind !== "empty") return false;
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent: stored }));
    const saved = loadGraphAction(memberId);
    return saved.kind === "ready" && same(saved.intent, freezeIntent(stored));
  } catch { return false; }
}
export function clearGraphAction(memberId: string, intent: GraphActionIntent): boolean {
  try {
    const previous = loadGraphAction(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, freezeIntent(intent)))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
export function discardBlockedGraphAction(memberId: string): boolean {
  try {
    if (!memberId || loadGraphAction(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
