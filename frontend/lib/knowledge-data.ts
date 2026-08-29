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
  const rawTags = Array.isArray(item.tags) ? item.tags : item.tagIds;
  return {
    id: item.id,
    title: typeof item.title === "string" ? item.title : undefined,
    summary: typeof item.summary === "string" ? item.summary : undefined,
    publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : undefined,
    tags: Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

export async function loadKnowledgePage({ page, pageSize, requester = fetch, signal, ...filters }: LoadKnowledgePageInput & { requester?: Fetcher }): Promise<KnowledgePageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, value);
  return normalizeNumberedPage(await apiFetch(`/api/knowledge?${params.toString()}`, { requester, signal }), normalizeItem);
}

export async function loadRecentKnowledge(requester: Fetcher = fetch, signal?: AbortSignal): Promise<RecentKnowledgeItem[]> {
  const data = await apiFetch<{ items?: unknown[] }>("/api/knowledge/recent?limit=8", { requester, signal });
  if (!Array.isArray(data.items)) return [];
  return data.items.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.knowledgeItemId !== "string" || !item.knowledgeItemId
      || typeof item.title !== "string" || typeof item.lastVisitedAt !== "string") return [];
    return [{
      id: item.knowledgeItemId,
      title: item.title,
      lastVisitedAt: item.lastVisitedAt,
      visitCount: Number.isSafeInteger(item.visitCount) && (item.visitCount as number) > 0 ? item.visitCount as number : 1,
    }];
  });
}

export async function loadFavoriteKnowledge(requester: Fetcher = fetch, signal?: AbortSignal): Promise<FavoriteKnowledgeItem[]> {
  const data = await apiFetch<{ items?: unknown[] }>("/api/knowledge/favorites?limit=20", { requester, signal });
  if (!Array.isArray(data.items)) return [];
  return data.items.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.knowledgeItemId !== "string" || !item.knowledgeItemId
      || typeof item.title !== "string" || typeof item.createdAt !== "string"
      || (item.visibility !== "shared" && item.visibility !== "admin_only") || typeof item.completed !== "boolean") return [];
    return [{ id: item.knowledgeItemId, title: item.title, createdAt: item.createdAt, completed: item.completed, visibility: item.visibility }];
  });
}

export async function loadRecentResearch(requester: Fetcher = fetch, signal?: AbortSignal): Promise<RecentResearchItem[]> {
  const data = await apiFetch<{ items?: unknown[] }>("/api/knowledge/research-runs?limit=8", { requester, signal });
  if (!Array.isArray(data.items)) return [];
  return data.items.flatMap((value) => {
    const item = normalizeRecentResearchItem(value);
    return item ? [item] : [];
  });
}

function normalizeRecentResearchItem(value: unknown): RecentResearchItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const status = item.status;
  const quotaState = item.quotaState;
  const plan = item.plan;
  const checkpoint = item.checkpoint;
  if (typeof item.id !== "string" || !item.id || typeof item.knowledgeItemId !== "string" || !item.knowledgeItemId
    || typeof item.goal !== "string" || !item.goal.trim() || !isResearchRunStatus(status) || !isResearchQuotaState(quotaState)
    || !isRecord(plan) || !isRecord(checkpoint) || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") return null;
  const sourceScope = {
    spaceIds: boundedStringArray(plan.spaceIds),
    collectionIds: boundedStringArray(plan.collectionIds),
    knowledgeItemIds: boundedStringArray(plan.knowledgeItemIds),
  };
  const completion = boundedStringArray(plan.completion);
  const steps = boundedStringArray(plan.steps);
  const subquestions = Array.isArray(plan.subquestions) ? plan.subquestions.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.question !== "string"
      || (entry.status !== "pending" && entry.status !== "completed" && entry.status !== "blocked")) return [];
    return [{ id: entry.id, question: entry.question, status: entry.status as "pending" | "completed" | "blocked" }];
  }) : [];
  if (typeof checkpoint.nextStep !== "number" || !Number.isSafeInteger(checkpoint.nextStep) || checkpoint.nextStep < 0
    || !Array.isArray(checkpoint.completedSubquestionIds) || !checkpoint.completedSubquestionIds.every((id) => typeof id === "string")) return null;
  return {
    id: item.id,
    knowledgeItemId: item.knowledgeItemId,
    goal: item.goal,
    status,
    quotaState,
    quotaDeferredUntil: typeof item.quotaDeferredUntil === "string" ? item.quotaDeferredUntil : null,
    sourceScope,
    completion,
    steps,
    subquestions,
    checkpoint: { nextStep: checkpoint.nextStep, completedSubquestionIds: checkpoint.completedSubquestionIds },
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function isResearchRunStatus(value: unknown): value is ResearchRunStatus {
  return value === "draft" || value === "running" || value === "paused" || value === "completed" || value === "cancelled";
}

function isResearchQuotaState(value: unknown): value is ResearchQuotaState {
  return value === "available" || value === "deferred_quota";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function createKnowledgeRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadKnowledgePageInput, "signal">, signal) => loadKnowledgePage({ ...input, requester, signal }));
}
