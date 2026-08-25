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
}

export interface AgentAnswer {
  answer: string;
  confidence: "high" | "medium" | "low";
  citations: AgentCitation[];
}

export async function askAgent({ question, scope, requester = fetch, signal }: {
  question: string;
  scope: AgentScope;
  requester?: Fetcher;
  signal?: AbortSignal;
}): Promise<AgentAnswer> {
  const data = await apiFetch<{ answer?: unknown; evidenceConfidence?: unknown; citations?: unknown[] }>("/api/knowledge/chat", {
    requester,
    signal,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: question.trim(), scope }),
  });
  const confidence = typeof data.evidenceConfidence === "number" && data.evidenceConfidence >= 0.8
    ? "high"
    : typeof data.evidenceConfidence === "number" && data.evidenceConfidence >= 0.5 ? "medium" : "low";
  const citations = Array.isArray(data.citations)
    ? data.citations.map(normalizeCitation).filter((citation): citation is AgentCitation => citation !== null)
    : [];
  return { answer: typeof data.answer === "string" ? data.answer : "", confidence, citations };
}

function normalizeCitation(value: unknown): AgentCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.citationId !== "string" || !record.citationId
    || typeof record.knowledgeItemId !== "string" || !record.knowledgeItemId) return null;
  return {
    id: record.citationId,
    title: typeof record.title === "string" ? record.title : undefined,
    href: `/knowledge/${encodeURIComponent(record.knowledgeItemId)}#${encodeURIComponent(record.citationId)}`,
  };
}

export function createAgentRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(question: string, scope: AgentScope) {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      const promise = askAgent({ question, scope, requester, signal: active.signal }).then((answer) => ({ generation, answer }));
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}
