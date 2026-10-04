import type { AgentFeedbackRating } from "./agent-data";

export interface AgentFeedbackIntent {
  readonly conversationId: string;
  readonly rating: AgentFeedbackRating;
  readonly citationIds: readonly string[];
}
export type StoredAgentFeedback = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: AgentFeedbackIntent };
const storageKey = (memberId: string) => `memory-garden:agent-feedback:v1:${encodeURIComponent(memberId)}`;
const conversationId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const citationId = /^[A-Za-z0-9:_-]{1,256}$/u;
const ratings = new Set<AgentFeedbackRating>(["useful", "not_useful", "citation_error"]);
export function validAgentFeedback(value: unknown): value is AgentFeedbackIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3
    && typeof record.conversationId === "string" && conversationId.test(record.conversationId)
    && typeof record.rating === "string" && ratings.has(record.rating as AgentFeedbackRating)
    && Array.isArray(record.citationIds) && record.citationIds.length <= 8 && record.citationIds.every((id) => typeof id === "string" && citationId.test(id));
}
function same(left: AgentFeedbackIntent, right: AgentFeedbackIntent): boolean {
  return left.conversationId === right.conversationId && left.rating === right.rating
    && left.citationIds.length === right.citationIds.length && left.citationIds.every((id, index) => id === right.citationIds[index]);
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("AGENT_FEEDBACK_STORAGE_UNAVAILABLE");
  return value;
}
function freezeIntent(intent: AgentFeedbackIntent): AgentFeedbackIntent {
  const next: AgentFeedbackIntent = { conversationId: intent.conversationId, rating: intent.rating, citationIds: [...intent.citationIds] };
  Object.freeze(next.citationIds); Object.freeze(next);
  return next;
}
export function loadAgentFeedback(memberId: string): StoredAgentFeedback {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || !validAgentFeedback(value.intent)
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: freezeIntent(value.intent) };
  } catch { return { kind: "blocked" }; }
}
export function saveAgentFeedback(memberId: string, intent: AgentFeedbackIntent): boolean {
  try {
    const stored = { conversationId: intent.conversationId, rating: intent.rating, citationIds: [...intent.citationIds] };
    if (!validAgentFeedback(stored) || loadAgentFeedback(memberId).kind !== "empty") return false;
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent: stored }));
    const saved = loadAgentFeedback(memberId);
    return saved.kind === "ready" && same(saved.intent, stored);
  } catch { return false; }
}
export function clearAgentFeedback(memberId: string, intent: AgentFeedbackIntent): boolean {
  try {
    const previous = loadAgentFeedback(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
export function discardBlockedAgentFeedback(memberId: string): boolean {
  try {
    if (!memberId || loadAgentFeedback(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
