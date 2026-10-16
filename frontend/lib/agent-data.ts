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

/**
 * A quota deferral and a temporarily unavailable AI backend are server answers
 * about the request, not client-side transport failures. The reader's AI
 * artifacts use the same two reasons, so both surfaces share one vocabulary
 * (`unavailable-quota` / `unavailable-degraded`) and one code list.
 */
export type AgentUnavailableReason = "quota" | "degraded";

const AGENT_QUOTA_CODES: Record<string, true> = { RESEARCH_QUOTA_DEFERRED: true, AI_QUOTA_EXHAUSTED: true, QUOTA_EXHAUSTED: true };

/** Null means the failure is neither a quota deferral nor a degraded backend. */
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

type ChatPayload = { answer?: unknown; evidenceConfidence?: unknown; citations?: unknown[]; sources?: unknown[]; conversationId?: unknown; conflicts?: unknown[]; messageKey?: unknown; suggestedActionKeys?: unknown; idempotencyKey?: unknown };

/**
 * Receipt validation and normalization shared by both transports: the JSON
 * response and the terminal frame of the stream carry the same payload, so a
 * streamed answer is accepted under exactly the same rules.
 */
function normalizeChatPayload(data: ChatPayload, receipt: { idempotencyKey?: string; conversationId?: string }): AgentAnswer {
  const { idempotencyKey, conversationId } = receipt;
  if (idempotencyKey && (data.idempotencyKey !== idempotencyKey || (conversationId !== undefined && data.conversationId !== conversationId) || typeof data.answer !== "string" || typeof data.conversationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(data.conversationId) || typeof data.evidenceConfidence !== "number" || !Number.isFinite(data.evidenceConfidence) || data.evidenceConfidence < 0 || data.evidenceConfidence > 1 || !Array.isArray(data.citations) || !data.citations.every(isKeyedCitation) || !Array.isArray(data.sources) || !data.sources.every(isKeyedSource))) throw new Error("CHAT_RECEIPT_UNKNOWN");
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

export async function updateAgentConversationScope(conversationId: string, scope: AgentScope, requester: Fetcher = fetch): Promise<void> {
  await apiFetch(`/api/knowledge/chat/conversations/${encodeURIComponent(conversationId)}/scope`, {
    requester,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope }),
  });
}

export async function cancelAgentConversation(conversationId: string, requester: Fetcher = fetch): Promise<boolean> {
  const data = await apiFetch<{ cancelled?: unknown }>(`/api/knowledge/chat/conversations/${encodeURIComponent(conversationId)}/cancel`, {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  return data.cancelled === true;
}

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

/** Real milestones the server reports while a grounded answer is produced. */
export type ChatStage = "retrieving" | "evidence" | "generating" | "validating";

const CHAT_STAGES: readonly string[] = ["retrieving", "evidence", "generating", "validating"];

/**
 * Streaming transport for the same grounded turn. Stage frames are progress
 * only; the answer arrives in one terminal frame and goes through the shared
 * receipt validation, so no unvalidated prose is ever rendered. A stream that
 * ends without a terminal frame is an unconfirmed write, not a plain failure.
 */
export async function askAgentStream({ question, scope, conversationId, idempotencyKey, requester = fetch, signal, onStage }: {
  question: string;
  scope: AgentScope;
  conversationId?: string;
  idempotencyKey?: string;
  requester?: Fetcher;
  signal?: AbortSignal;
  onStage?: (stage: ChatStage) => void;
}): Promise<AgentAnswer> {
  const response = await requester("/api/knowledge/chat/stream", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    body: JSON.stringify({ question: question.trim(), scope, ...(conversationId ? { conversationId } : {}) }),
  });
  if (!response.ok) throw await parseApiError(response);
  if (!response.body) throw new ApiRequestError("CHAT_STREAM_UNAVAILABLE", "The answer stream is unavailable", 503, true);
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
  if (!payload) throw new ApiRequestError("CHAT_STREAM_INTERRUPTED", "The answer stream ended before a result was confirmed", 503, true);
  return normalizeChatPayload(payload, { idempotencyKey, conversationId });
}

export function createAgentRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(question: string, scope: AgentScope, conversationId?: string, idempotencyKey?: string, onStage?: (stage: ChatStage) => void) {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      const promise = askAgentStream({ question, scope, conversationId, idempotencyKey, requester, signal: active.signal, onStage: onStage && ((stage) => { if (owner.isCurrent(generation)) onStage(stage); }) }).then((answer) => ({ generation, answer })).finally(() => { if (owner.isCurrent(generation)) active = null; });
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel(conversationId?: string) {
      if (active && conversationId) void cancelAgentConversation(conversationId, requester).catch(() => undefined);
      owner.invalidate(); active?.abort(); active = null;
    },
  };
}

export interface AgentConversation {
  id: string;
  scope: AgentScope;
  messages: Array<{ role: "user" | "assistant"; content: string; citations: AgentCitation[] }>;
}

const resourceId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
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

export async function loadAgentConversation(id: string, { requester = fetch, signal }: { requester?: Fetcher; signal?: AbortSignal } = {}): Promise<AgentConversation> {
  if (!resourceId.test(id)) return invalidConversation();
  const data = await apiFetch<unknown>(`/api/knowledge/chat/conversations/${encodeURIComponent(id)}`, { method: "GET", requester, signal });
  if (!data || typeof data !== "object") return invalidConversation();
  const record = data as Record<string, unknown>;
  const conversation = record.conversation as { id?: unknown; scope?: AgentScope } | undefined;
  if (!conversation || conversation.id !== id || !conversation.scope || typeof conversation.scope !== "object") return invalidConversation();
  const scope = conversation.scope;
  if (!["all", "space", "collection", "items"].includes(scope.kind) || (scope.kind === "items" && !Array.isArray(scope.knowledgeItemIds))) return invalidConversation();
  // Reuse URL scope validation so malformed recovery cannot expand the source set.
  const parsedScope = agentLocationFromSearch(agentScopeSearch(scope)).scope;
  if (!parsedScope || Object.keys(parsedScope).length !== Object.keys(scope).length
    || Object.entries(parsedScope).some(([key, value]) => JSON.stringify(value) !== JSON.stringify((scope as unknown as Record<string, unknown>)[key]))) return invalidConversation();
  if (!Array.isArray(record.messages) || record.messages.length > 8 || !Array.isArray(record.sources)) return invalidConversation();
  const citations = record.sources.map(normalizeCitation);
  if (citations.some((citation) => citation === null)) return invalidConversation();
  const byId = new Map(citations.map((citation) => [citation!.id, citation!]));
  const messages = record.messages.map((value): AgentConversation["messages"][number] => {
    if (!value || typeof value !== "object") return invalidConversation();
    const message = value as Record<string, unknown>;
    if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string" || !Array.isArray(message.citationIds)) return invalidConversation();
    const sources = message.citationIds.map((citationId) => typeof citationId === "string" ? byId.get(citationId) : undefined);
    if (sources.some((source) => !source)) return invalidConversation();
    return { role: message.role, content: message.content, citations: sources as AgentCitation[] };
  });
  return { id, scope: parsedScope, messages };
}

export type AgentFeedbackRating = "useful" | "not_useful" | "citation_error";

export async function submitAgentFeedback(conversationId: string, rating: AgentFeedbackRating, citationIds: readonly string[], requester: Fetcher = fetch): Promise<void> {
  if (!resourceId.test(conversationId) || !["useful", "not_useful", "citation_error"].includes(rating) || citationIds.length > 8 || citationIds.some((id) => !/^[A-Za-z0-9:_-]{1,256}$/u.test(id))) return invalidConversation();
  const data = await apiFetch<{ feedback?: { conversationId?: unknown; rating?: unknown; citationIds?: unknown } }>(`/api/knowledge/chat/conversations/${encodeURIComponent(conversationId)}/feedback`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating, citationIds }),
  });
  const receipt = data?.feedback;
  if (!receipt || receipt.conversationId !== conversationId || receipt.rating !== rating || !Array.isArray(receipt.citationIds) || receipt.citationIds.length !== citationIds.length || receipt.citationIds.some((id, index) => id !== citationIds[index])) return invalidConversation();
}


export interface AgentConversationList {
  items: Array<{ id: string; createdAt: string }>;
  nextCursor?: string;
}

export async function loadAgentConversations({ cursor, requester = fetch, signal }: { cursor?: string; requester?: Fetcher; signal?: AbortSignal } = {}): Promise<AgentConversationList> {
  const validCursor = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/u.test(value);
  if (cursor !== undefined && !validCursor(cursor)) return invalidConversation();
  const params = new URLSearchParams({ limit: "20" });
  if (cursor !== undefined) params.set("cursor", cursor);
  const data = await apiFetch<unknown>(`/api/knowledge/chat/conversations?${params}`, { method: "GET", requester, signal });
  if (!data || typeof data !== "object") return invalidConversation();
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.items) || record.items.length > 20 || (record.nextCursor !== undefined && (!validCursor(record.nextCursor) || record.nextCursor === cursor || !record.items.length))) return invalidConversation();
  const seen = new Set<string>();
  const items = record.items.map((value) => {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || !resourceId.test(value.id) || seen.has(value.id)
      || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) return invalidConversation();
    seen.add(value.id);
    return { id: value.id, createdAt: value.createdAt };
  });
  return { items, ...(record.nextCursor === undefined ? {} : { nextCursor: record.nextCursor as string }) };
}
