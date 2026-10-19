import { agentLocationFromSearch, agentScopeSearch, type AgentScope } from "./agent-data";

export interface AgentSessionRecord {
  version: 1;
  memberId: string;
  sessionId: string;
  scope: AgentScope;
}

export type StoredAgentSession =
  | { kind: "empty" }
  | { kind: "ready"; session: AgentSessionRecord }
  | { kind: "blocked" };

const SESSION_ID = /^[A-Za-z0-9_-]{21,128}$/u;
const storageKey = (memberId: string) => `memory-garden:agent-session:v1:${encodeURIComponent(memberId)}`;

/**
 * The durable agent session this member last used in this browser. It is stored
 * in `localStorage` (unlike the pending-turn journal) because the whole point is
 * to survive a reload; every field is re-validated on read so a corrupt or
 * cross-member record can only fail closed.
 */
export function loadAgentSession(memberId: string): StoredAgentSession {
  try {
    const raw = browserStorage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    const value = JSON.parse(raw) as AgentSessionRecord;
    if (!value || value.version !== 1 || value.memberId !== memberId
      || typeof value.sessionId !== "string" || !SESSION_ID.test(value.sessionId)
      || Object.keys(value).some((key) => !["version", "memberId", "sessionId", "scope"].includes(key))) return { kind: "blocked" };
    const scope = agentLocationFromSearch(agentScopeSearch(value.scope)).scope;
    if (!scope || JSON.stringify(scope) !== JSON.stringify(value.scope)) return { kind: "blocked" };
    return { kind: "ready", session: value };
  } catch { return { kind: "blocked" }; }
}

export function saveAgentSession(record: AgentSessionRecord): boolean {
  try {
    const stored = loadAgentSession(record.memberId);
    if (stored.kind === "blocked") return false;
    browserStorage().setItem(storageKey(record.memberId), JSON.stringify(record));
    const saved = loadAgentSession(record.memberId);
    return saved.kind === "ready" && JSON.stringify(saved.session) === JSON.stringify(record);
  } catch { return false; }
}

/** `sessionId` omitted only for an explicit user discard (new conversation). */
export function clearAgentSession(memberId: string, sessionId?: string): boolean {
  try {
    const stored = loadAgentSession(memberId);
    if (stored.kind === "blocked") return false;
    if (sessionId && stored.kind === "ready" && stored.session.sessionId !== sessionId) return false;
    browserStorage().removeItem(storageKey(memberId));
    return browserStorage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}

function browserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const storage = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage;
  if (!storage) throw new Error("AGENT_SESSION_STORAGE_UNAVAILABLE");
  return storage;
}
