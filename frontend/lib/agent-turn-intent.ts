import { agentLocationFromSearch, agentScopeSearch, type AgentScope } from "./agent-data";

export interface AgentTurnIntent {
  version: 1;
  memberId: string;
  key: string;
  question: string;
  scope: AgentScope;
  conversationId?: string;
}
export type StoredAgentIntent = { kind: "empty" } | { kind: "ready"; intent: AgentTurnIntent } | { kind: "blocked" };
const storageKey = (memberId: string) => `memory-garden:agent-turn:v1:${encodeURIComponent(memberId)}`;

export function loadAgentIntent(memberId: string): StoredAgentIntent {
  try {
    const raw = browserStorage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    const value = JSON.parse(raw) as AgentTurnIntent;
    if (!value || value.version !== 1 || value.memberId !== memberId || typeof value.key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(value.key)
      || typeof value.question !== "string" || !value.question.trim() || value.question !== value.question.trim()
      || (value.conversationId !== undefined && (typeof value.conversationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.conversationId)))
      || Object.keys(value).some((key) => !["version", "memberId", "key", "question", "scope", "conversationId"].includes(key))) return { kind: "blocked" };
    const scope = agentLocationFromSearch(agentScopeSearch(value.scope)).scope;
    if (!scope || JSON.stringify(scope) !== JSON.stringify(value.scope)) return { kind: "blocked" };
    return { kind: "ready", intent: value };
  } catch { return { kind: "blocked" }; }
}

export function createAgentIntent(memberId: string, question: string, scope: AgentScope, conversationId?: string): AgentTurnIntent {
  return { version: 1, memberId, key: crypto.randomUUID(), question: question.trim(), scope, ...(conversationId ? { conversationId } : {}) };
}

export function saveAgentIntent(intent: AgentTurnIntent): boolean {
  try {
    const stored = loadAgentIntent(intent.memberId);
    if (stored.kind === "blocked" || (stored.kind === "ready" && JSON.stringify(stored.intent) !== JSON.stringify(intent))) return false;
    browserStorage().setItem(storageKey(intent.memberId), JSON.stringify(intent));
    const saved = loadAgentIntent(intent.memberId);
    return saved.kind === "ready" && JSON.stringify(saved.intent) === JSON.stringify(intent);
  } catch { return false; }
}

/** key omitted only for an explicit user discard of an unreadable stored intent. */
export function clearAgentIntent(memberId: string, key?: string): boolean {
  try {
    const stored = loadAgentIntent(memberId);
    if (key && (stored.kind === "blocked" || (stored.kind === "ready" && stored.intent.key !== key))) return false;
    browserStorage().removeItem(storageKey(memberId));
    return browserStorage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}

function browserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const storage = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!storage) throw new Error("CHAT_INTENT_STORAGE_UNAVAILABLE");
  return storage;
}
