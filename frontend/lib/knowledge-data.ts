import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface KnowledgeListItem {
  id: string;
  title?: string;
  summary?: string;
  publishedAt?: string;
  tags: string[];
}

export type KnowledgePageResult = FrontendNumberedPage<KnowledgeListItem>;
export interface LoadKnowledgePageInput extends FrontendPageRequest {
  spaceId?: string; collectionId?: string; tagId?: string; kind?: "text" | "markdown" | "code";
  authorId?: string; publishedFrom?: string; publishedTo?: string; signal?: AbortSignal;
}

export interface RecentKnowledgeItem {
  id: string;
  title: string;
  lastVisitedAt: string;
  visitCount: number;
}

export interface FavoriteKnowledgeItem {
  id: string;
  title: string;
  createdAt: string;
  completed: boolean;
  visibility: "shared" | "admin_only";
}

export type ResearchRunStatus = "draft" | "running" | "paused" | "completed" | "cancelled";
export type ResearchQuotaState = "available" | "deferred_quota";
export interface RecentResearchItem {
  id: string;
  knowledgeItemId: string;
  goal: string;
  status: ResearchRunStatus;
  quotaState: ResearchQuotaState;
  quotaDeferredUntil: string | null;
  sourceScope: { spaceIds: string[]; collectionIds: string[]; knowledgeItemIds: string[] };
  completion: string[];
  steps: string[];
  subquestions: Array<{ id: string; question: string; status: "pending" | "completed" | "blocked" }>;
  checkpoint: { nextStep: number; completedSubquestionIds: string[] };
  createdAt: string;
  updatedAt: string;
}

function normalizeItem(value: unknown): KnowledgeListItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("KNOWLEDGE_RESPONSE_INVALID");
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length === 0) throw new Error("KNOWLEDGE_RESPONSE_INVALID");
  if (typeof item.title !== "string" || typeof item.publishedAt !== "string") throw new Error("KNOWLEDGE_RESPONSE_INVALID");
  const rawTags = item.tags === undefined ? item.tagIds : item.tags;
  if (!Array.isArray(rawTags) || !rawTags.every((tag): tag is string => typeof tag === "string")) throw new Error("KNOWLEDGE_RESPONSE_INVALID");
  return {
    id: item.id,
    title: item.title,
    summary: typeof item.summary === "string" ? item.summary : undefined,
    publishedAt: item.publishedAt,
    tags: [...rawTags],
  };
}

export async function loadKnowledgePage({ page, pageSize, requester = fetch, signal, ...filters }: LoadKnowledgePageInput & { requester?: Fetcher }): Promise<KnowledgePageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, value);
  return normalizeNumberedPage(await apiFetch(`/api/knowledge?${params.toString()}`, { requester, signal }), normalizeItem);
}

export function createKnowledgeRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadKnowledgePageInput, "signal">, signal) => loadKnowledgePage({ ...input, requester, signal }));
}
