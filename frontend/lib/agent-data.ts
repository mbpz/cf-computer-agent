import { apiFetch, type Fetcher } from "./api";
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
  citations: AgentCitation[];
  conversationId?: string;
}

export async function askAgent({ question, scope, conversationId, requester = fetch, signal }: {
  question: string;
  scope: AgentScope;
  conversationId?: string;
  requester?: Fetcher;
  signal?: AbortSignal;
}): Promise<AgentAnswer> {
  const data = await apiFetch<{ answer?: unknown; evidenceConfidence?: unknown; citations?: unknown[]; sources?: unknown[]; conversationId?: unknown }>("/api/knowledge/chat", {
    requester,
    signal,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: question.trim(), scope, ...(conversationId ? { conversationId } : {}) }),
  });
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
  return { answer: typeof data.answer === "string" ? data.answer : "", confidence, citations, ...(typeof data.conversationId === "string" ? { conversationId: data.conversationId } : {}) };
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

export function createAgentRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(question: string, scope: AgentScope, conversationId?: string) {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      const promise = askAgent({ question, scope, conversationId, requester, signal: active.signal }).then((answer) => ({ generation, answer }));
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}
