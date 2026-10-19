import { apiFetch, parseApiError, ApiRequestError, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export type AgentScope =
  | { kind: "all" }
  | { kind: "space"; spaceId: string }
  | { kind: "collection"; collectionId: string }
  | { kind: "items"; knowledgeItemIds: string[] };

export interface AgentCitation {
  id: string;
  title?: string;
  href: string;
  spaceId?: string;
  collectionId?: string | null;
  headingPath?: readonly string[];
  startLine?: number;
  endLine?: number;
}

export interface AgentAnswer {
  answer: string;
  confidence: "high" | "medium" | "low";
  insufficientEvidence?: true;
  suggestions?: Array<"rewrite" | "sources">;
  citations: AgentCitation[];
  conversationId?: string;
  conflicts?: Array<{ text: string; citationIds: string[] }>;
}

/** A grounded answer that also names the exact turn it was persisted as, so the
 * page can terminate that turn when the reader stops waiting. */
export interface AgentSessionAnswer extends AgentAnswer {
  sessionId: string;
  turnId: string;
}

/**
 * A quota deferral and a temporarily unavailable AI backend are server answers
 * about the request, not client-side transport failures. The reader's AI
 * artifacts use the same two reasons, so both surfaces share one vocabulary
 * (`unavailable-quota` / `unavailable-degraded`) and one code list.
 */
export type AgentUnavailableReason = "quota" | "degraded";

const AGENT_QUOTA_CODES: Record<string, true> = { RESEARCH_QUOTA_DEFERRED: true, AI_QUOTA_EXHAUSTED: true, QUOTA_EXHAUSTED: true };

export function agentUnavailableReason(error: unknown): AgentUnavailableReason | null {
  if (!(error instanceof ApiRequestError)) return null;
  if (Object.hasOwn(AGENT_QUOTA_CODES, error.code)) return "quota";
  return error.code === "AI_UNAVAILABLE" ? "degraded" : null;
}

/**
 * The page's own request states. `refused` is the server's explicit
 * no-evidence answer and carries no answer body; `unavailable` is a classified
 * server availability answer, never a generic error.
 */
export type AgentTurnState =
  | { kind: "loading" }
  | { kind: "cancelled" }
  | { kind: "ready"; answer: string; confidence: AgentAnswer["confidence"]; citations: readonly AgentCitation[]; conversationId?: string; conflicts?: AgentAnswer["conflicts"] }
  | { kind: "refused"; citations: readonly AgentCitation[]; conversationId?: string; suggestions?: AgentAnswer["suggestions"] }
  | { kind: "unavailable"; reason: AgentUnavailableReason; code: string }
  | { kind: "error"; message: string };

type ChatPayload = { answer?: unknown; evidenceConfidence?: unknown; citations?: unknown[]; sources?: unknown[]; conversationId?: unknown; sessionId?: unknown; turnId?: unknown; conflicts?: unknown[]; messageKey?: unknown; suggestedActionKeys?: unknown; idempotencyKey?: unknown };

const SESSION_ID = /^[A-Za-z0-9_-]{21,128}$/u;
const TURN_ID = /^[A-Za-z0-9-]{16,128}$/u;
const MESSAGE_LIMIT_MAX = 50;

/** `conversationId` in an agent URL is the durable agent session id. It is kept
 * under the old parameter name so existing recovery links keep working. */
const resourceId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function isKeyedSource(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.citationId === "string" && record.citationId.length > 0
    && typeof record.knowledgeItemId === "string" && record.knowledgeItemId.length > 0
    && typeof record.title === "string"
    && typeof record.spaceId === "string" && record.spaceId.length > 0;
}

function isKeyedCitation(value: unknown): boolean {
  return (typeof value === "string" && value.length > 0) || isKeyedSource(value);
}

function normalizeCitation(value: unknown): AgentCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.citationId !== "string" || !record.citationId
    || typeof record.knowledgeItemId !== "string" || !record.knowledgeItemId) return null;
  const citation: AgentCitation = {
    id: record.citationId,
    title: typeof record.title === "string" ? record.title : undefined,
    href: `/knowledge/${encodeURIComponent(record.knowledgeItemId)}#${encodeURIComponent(record.citationId)}`,
  };
  if (typeof record.spaceId === "string" && record.spaceId) citation.spaceId = record.spaceId;
  if (record.collectionId === null || (typeof record.collectionId === "string" && record.collectionId)) citation.collectionId = record.collectionId as string | null;
  if (Array.isArray(record.headingPath)) citation.headingPath = record.headingPath.filter((item): item is string => typeof item === "string").slice(0, 8);
  if (Number.isSafeInteger(record.startLine) && (record.startLine as number) >= 1) citation.startLine = record.startLine as number;
  if (Number.isSafeInteger(record.endLine) && (record.endLine as number) >= (citation.startLine ?? 1)) citation.endLine = record.endLine as number;
  return citation;
}

/**
 * Presentation mapping shared by both grounded transports. It never decides
 * whether a payload is acceptable; the session transport validates the whole
 * terminal frame before calling this.
 */
function normalizeChatPayload(data: ChatPayload): AgentAnswer {
  const confidence = typeof data.evidenceConfidence === "number" && data.evidenceConfidence >= 0.8
    ? "high"
    : typeof data.evidenceConfidence === "number" && data.evidenceConfidence >= 0.5 ? "medium" : "low";
  const citationObjects = Array.isArray(data.citations)
    ? data.citations.map(normalizeCitation).filter((citation): citation is AgentCitation => citation !== null)
    : [];
  const citationIds = new Set(Array.isArray(data.citations) ? data.citations.filter((value): value is string => typeof value === "string") : []);
  const citations = citationObjects.length > 0
    ? citationObjects
    : (Array.isArray(data.sources) ? data.sources.map(normalizeCitation).filter((citation): citation is AgentCitation => citation !== null && citationIds.has(citation.id)) : []);
  const conflicts = Array.isArray(data.conflicts) ? data.conflicts.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (typeof record.text !== "string" || !Array.isArray(record.citationIds) || !record.citationIds.every((id) => typeof id === "string")) return [];
    return [{ text: record.text, citationIds: record.citationIds as string[] }];
  }) : [];
  const insufficient = data.messageKey === "KNOWLEDGE_EVIDENCE_INSUFFICIENT";
  const suggestions: Array<"rewrite" | "sources"> = [];
  if (insufficient && Array.isArray(data.suggestedActionKeys)) {
    if (data.suggestedActionKeys.includes("KNOWLEDGE_CHAT_REWRITE_QUESTION")) suggestions.push("rewrite");
    if (data.suggestedActionKeys.includes("KNOWLEDGE_CHAT_EXPAND_SCOPE")) suggestions.push("sources");
  }
  return { ...(insufficient ? { insufficientEvidence: true as const, suggestions } : {}), answer: typeof data.answer === "string" ? data.answer : "", confidence, citations, ...(conflicts.length > 0 ? { conflicts } : {}), ...(typeof data.conversationId === "string" ? { conversationId: data.conversationId } : {}) };
}

/** Real milestones the server reports while a grounded answer is produced. */
export type ChatStage = "retrieving" | "evidence" | "generating" | "validating";

const CHAT_STAGES: readonly string[] = ["retrieving", "evidence", "generating", "validating"];

// --- AgentSession transport ------------------------------------------------

interface AgentSessionPayload {
  session?: { id?: unknown; memberId?: unknown; createdAt?: unknown; lastSeenAt?: unknown };
}

/** Create a fresh member-bound session. The server chooses the id; the client
 * validates it strictly before using it in any path. */
export async function createAgentSession(requester: Fetcher = fetch): Promise<string> {
  const data = await apiFetch<AgentSessionPayload>("/api/agent/sessions", { requester, method: "POST" });
  const id = data?.session?.id;
  if (typeof id !== "string" || !SESSION_ID.test(id)) throw new Error("AGENT_SESSION_INVALID");
  return id;
}

/** Read-only existence/ownership probe used when restoring a stored session. */
export async function loadAgentSession(sessionId: string, { requester = fetch, signal }: { requester?: Fetcher; signal?: AbortSignal } = {}): Promise<{ id: string }> {
  if (!SESSION_ID.test(sessionId)) throw new Error("AGENT_SESSION_INVALID");
  const data = await apiFetch<AgentSessionPayload>(`/api/agent/sessions/${encodeURIComponent(sessionId)}`, { method: "GET", requester, signal });
  const id = data?.session?.id;
  if (typeof id !== "string" || id !== sessionId) throw new Error("AGENT_SESSION_INVALID");
  return { id };
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  citations: AgentCitation[];
}

interface AgentMessagePagePayload {
  messages?: { items?: unknown; truncated?: unknown };
}

/** The server returns newest-first pages; the transcript renders oldest-first.
 * Stored assistant prose has no persisted citation ids, so it carries none. */
export async function loadAgentMessages(sessionId: string, limit = 20, { requester = fetch, signal }: { requester?: Fetcher; signal?: AbortSignal } = {}): Promise<{ messages: AgentMessage[]; truncated: boolean }> {
  if (!SESSION_ID.test(sessionId) || !Number.isSafeInteger(limit) || limit < 1 || limit > MESSAGE_LIMIT_MAX) throw new Error("AGENT_SESSION_INVALID");
  const data = await apiFetch<AgentMessagePagePayload>(`/api/agent/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}`, { method: "GET", requester, signal });
  const page = data?.messages;
  if (!page || !Array.isArray(page.items) || page.items.length > limit || typeof page.truncated !== "boolean") throw new Error("AGENT_SESSION_INVALID");
  const seen = new Set<string>();
  const messages = page.items.map((value): AgentMessage => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AGENT_SESSION_INVALID");
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id || seen.has(record.id)
      || (record.role !== "user" && record.role !== "assistant")
      || typeof record.content !== "string" || !record.content.trim()) throw new Error("AGENT_SESSION_INVALID");
    seen.add(record.id);
    return { role: record.role, content: record.content, citations: [] };
  });
  return { messages: messages.reverse(), truncated: page.truncated };
}

/** Owner-only termination of one turn. Accepts an already-finished turn as a
 * verified no-op; anything else is an unconfirmed receipt. */
export async function terminateAgentTurn(sessionId: string, turnId: string, requester: Fetcher = fetch): Promise<void> {
  if (!SESSION_ID.test(sessionId) || !TURN_ID.test(turnId)) throw new Error("AGENT_SESSION_INVALID");
  const data = await apiFetch<{ turn?: { turnId?: unknown; status?: unknown } }>(`/api/agent/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/terminate`, {
    requester,
    method: "POST",
  });
  const turn = data?.turn;
  if (!turn || turn.turnId !== turnId || (turn.status !== "terminated" && turn.status !== "completed")) throw new Error("AGENT_TURN_RECEIPT_UNKNOWN");
}

/**
 * Streaming transport for one grounded session turn. The stream frames are the
 * same as the knowledge chat's; the terminal frame is validated more strictly
 * because the session identity and turn id are part of the receipt. A stream
 * that ends without a terminal frame is an unconfirmed write, never a plain
 * failure, so the caller keeps its recovery intent.
 */
export async function askAgentSessionStream({ sessionId, question, scope, requester = fetch, signal, onStage, onTurn }: {
  sessionId: string;
  question: string;
  scope: AgentScope;
  requester?: Fetcher;
  signal?: AbortSignal;
  onStage?: (stage: ChatStage) => void;
  onTurn?: (turnId: string) => void;
}): Promise<AgentSessionAnswer> {
  if (!SESSION_ID.test(sessionId)) throw new Error("AGENT_SESSION_INVALID");
  const response = await requester(`/api/agent/sessions/${encodeURIComponent(sessionId)}/stream`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: question.trim(), scope }),
  });
  if (!response.ok) throw await parseApiError(response);
  const turnId = response.headers.get("x-agent-turn-id");
  if (typeof turnId !== "string" || !TURN_ID.test(turnId)) throw new ApiRequestError("AGENT_STREAM_UNAVAILABLE", "The answer stream is unavailable", 503, true);
  onTurn?.(turnId);
  if (!response.body) throw new ApiRequestError("AGENT_STREAM_UNAVAILABLE", "The answer stream is unavailable", 503, true);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let payload: ChatPayload | undefined;
  let failure: { code: string; message: string; status: number; retryable: boolean } | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const raw = buffer.slice(0, separator).trim();
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
      if (!raw.startsWith("data:")) continue;
      let frame: { stage?: unknown; body?: unknown; error?: unknown };
      try { frame = JSON.parse(raw.slice(5).trim()) as typeof frame; } catch { continue; }
      if (frame.stage === "answer") payload = frame.body as ChatPayload;
      else if (frame.stage === "error") failure = frame.error as typeof failure;
      else if (typeof frame.stage === "string" && CHAT_STAGES.includes(frame.stage)) onStage?.(frame.stage as ChatStage);
    }
  }
  if (failure) throw new ApiRequestError(failure.code, failure.message, failure.status, failure.retryable);
  if (!payload) throw new ApiRequestError("AGENT_STREAM_INTERRUPTED", "The answer stream ended before a result was confirmed", 503, true);
  validateSessionAnswer(payload, sessionId, turnId);
  return { ...normalizeChatPayload(payload), sessionId, turnId };
}

/** Equivalent to the knowledge chat's keyed-receipt rules, minus the idempotency
 * key the agent transport does not use: every terminal frame must name this
 * exact session and turn and carry a complete, well-formed grounded answer. */
function validateSessionAnswer(data: ChatPayload, sessionId: string, turnId: string): void {
  if (data.sessionId !== sessionId || data.conversationId !== sessionId || data.turnId !== turnId
    || typeof data.answer !== "string"
    || typeof data.evidenceConfidence !== "number" || !Number.isFinite(data.evidenceConfidence) || data.evidenceConfidence < 0 || data.evidenceConfidence > 1
    || !Array.isArray(data.citations) || !data.citations.every(isKeyedCitation)
    || !Array.isArray(data.sources) || !data.sources.every(isKeyedSource)) throw new Error("AGENT_RECEIPT_UNKNOWN");
}

export function createAgentRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  let activeTurn: { sessionId: string; turnId: string } | null = null;
  const owner = createAsyncOwner();
  return {
    request(sessionId: string, question: string, scope: AgentScope, onStage?: (stage: ChatStage) => void) {
      active?.abort();
      active = new AbortController();
      activeTurn = null;
      const generation = owner.claim();
      const promise = askAgentSessionStream({
        sessionId,
        question,
        scope,
        requester,
        signal: active.signal,
        onStage: onStage && ((stage) => { if (owner.isCurrent(generation)) onStage(stage); }),
        onTurn: (turnId) => { if (owner.isCurrent(generation)) activeTurn = { sessionId, turnId }; },
      }).then((answer) => ({ generation, answer })).finally(() => { if (owner.isCurrent(generation)) { active = null; activeTurn = null; } });
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    /** Abort this tab's stream and ask the server to terminate exactly the turn
     * it had observed. A completed turn is accepted as a verified no-op. */
    cancel() {
      const turn = activeTurn;
      activeTurn = null;
      owner.invalidate();
      active?.abort();
      active = null;
      if (turn) void terminateAgentTurn(turn.sessionId, turn.turnId, requester).catch(() => undefined);
    },
  };
}

// --- URL scope -------------------------------------------------------------

function invalidConversation(): never { throw new Error("Invalid agent conversation or scope"); }

export function agentLocationFromSearch(search: string): { scope?: AgentScope; conversationId?: string } {
  const params = new URLSearchParams(search);
  const sourceKeys = ["scope", "spaceId", "collectionId", "knowledgeItemId"];
  if (params.has("conversationId")) {
    const ids = params.getAll("conversationId");
    if (ids.length !== 1 || !resourceId.test(ids[0]!) || sourceKeys.some((key) => params.has(key))) return invalidConversation();
    return { conversationId: ids[0]! };
  }
  const kinds = params.getAll("scope");
  const kind = kinds[0] ?? "all";
  if (kinds.length > 1) return invalidConversation();
  const allowed = kind === "space" ? "spaceId" : kind === "collection" ? "collectionId" : kind === "items" ? "knowledgeItemId" : undefined;
  if (sourceKeys.slice(1).some((key) => key !== allowed && params.has(key))) return invalidConversation();
  if (kind === "all") return { scope: { kind: "all" } };
  const ids = allowed ? params.getAll(allowed) : [];
  if (!ids.length || ids.some((id) => !resourceId.test(id)) || new Set(ids).size !== ids.length) return invalidConversation();
  if (kind === "items" && ids.length <= 8) return { scope: { kind, knowledgeItemIds: ids } };
  if (ids.length !== 1) return invalidConversation();
  if (kind === "space") return { scope: { kind, spaceId: ids[0]! } };
  if (kind === "collection") return { scope: { kind, collectionId: ids[0]! } };
  return invalidConversation();
}

export function agentScopeSearch(scope: AgentScope): string {
  const params = new URLSearchParams({ scope: scope.kind });
  if (scope.kind === "space") params.set("spaceId", scope.spaceId);
  if (scope.kind === "collection") params.set("collectionId", scope.collectionId);
  if (scope.kind === "items") for (const id of scope.knowledgeItemIds) params.append("knowledgeItemId", id);
  return `?${params}`;
}
