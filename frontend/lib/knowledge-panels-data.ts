import { apiFetch, type Fetcher } from "./api";
// The item shapes stay with the numbered list module: these reads only page them.
import type { FavoriteKnowledgeItem, RecentKnowledgeItem, RecentResearchItem, ResearchQuotaState, ResearchRunStatus } from "./knowledge-data";

/**
 * Cursor/keyset reads for the dashboard surfaces that are not formal numbered pages:
 * the home recent list and the knowledge side panels (favorites, research runs).
 * The formal page modules stay on numbered pagination; see
 * `test/unit/frontend-contract.test.ts` for the documented split.
 */

/** One cursor-paged section read: the server omits its cursor at the end of the list. */
export interface KnowledgeSectionPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface KnowledgeSectionPageRequest {
  cursor?: string | null;
  limit?: number;
  requester?: Fetcher;
  signal?: AbortSignal;
}

function sectionParams({ cursor, limit }: KnowledgeSectionPageRequest, fallbackLimit: number): string {
  const params = new URLSearchParams({ limit: String(limit ?? fallbackLimit) });
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export type RecentKnowledgePage = KnowledgeSectionPage<RecentKnowledgeItem>;

export async function loadRecentKnowledgePage({ cursor, requester = fetch, signal }: { cursor?: string | null; requester?: Fetcher; signal?: AbortSignal } = {}): Promise<RecentKnowledgePage> {
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/knowledge/recent?${sectionParams({ cursor }, 8)}`, { requester, signal });
  if (!Array.isArray(data?.items)) throw new Error("RECENT_KNOWLEDGE_INVALID");
  return {
    items: data.items.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RECENT_KNOWLEDGE_INVALID");
      const item = value as Record<string, unknown>;
      if (typeof item.knowledgeItemId !== "string" || !item.knowledgeItemId
        || typeof item.title !== "string" || typeof item.lastVisitedAt !== "string") throw new Error("RECENT_KNOWLEDGE_INVALID");
      if (typeof item.visitCount !== "number" || !Number.isSafeInteger(item.visitCount) || item.visitCount < 1) throw new Error("RECENT_KNOWLEDGE_INVALID");
      return [{
        id: item.knowledgeItemId,
        title: item.title,
        lastVisitedAt: item.lastVisitedAt,
        visitCount: item.visitCount,
      }];
    }),
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null,
  };
}

export async function loadFavoriteKnowledgePage({ cursor, limit, requester = fetch, signal }: KnowledgeSectionPageRequest = {}): Promise<KnowledgeSectionPage<FavoriteKnowledgeItem>> {
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/knowledge/favorites?${sectionParams({ cursor, limit }, 20)}`, { requester, signal });
  if (!Array.isArray(data?.items)) throw new Error("FAVORITE_KNOWLEDGE_INVALID");
  return {
    items: data.items.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const item = value as Record<string, unknown>;
      if (typeof item.knowledgeItemId !== "string" || !item.knowledgeItemId
        || typeof item.title !== "string" || typeof item.createdAt !== "string"
        || (item.visibility !== "shared" && item.visibility !== "admin_only") || typeof item.completed !== "boolean") return [];
      return [{ id: item.knowledgeItemId, title: item.title, createdAt: item.createdAt, completed: item.completed, visibility: item.visibility }];
    }),
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null,
  };
}

export async function loadRecentResearchPage({ cursor, limit, requester = fetch, signal }: KnowledgeSectionPageRequest = {}): Promise<KnowledgeSectionPage<RecentResearchItem>> {
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/knowledge/research-runs?${sectionParams({ cursor, limit }, 8)}`, { requester, signal });
  if (!Array.isArray(data?.items)) throw new Error("RESEARCH_RUNS_INVALID");
  return {
    items: data.items.flatMap((value) => {
      const item = normalizeRecentResearchItem(value);
      return item ? [item] : [];
    }),
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null,
  };
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
  if (!Array.isArray(plan.spaceIds) || !Array.isArray(plan.collectionIds) || !Array.isArray(plan.knowledgeItemIds)) throw new Error("RESEARCH_RUNS_INVALID");
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
  }) : null;
  if (!subquestions || subquestions.length < 1) throw new Error("RESEARCH_RUNS_INVALID");
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
