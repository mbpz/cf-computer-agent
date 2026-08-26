import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface KnowledgeListItem {
  id: string;
  title?: string;
  summary?: string;
  publishedAt?: string;
  tags: string[];
}

export interface KnowledgePageResult {
  items: KnowledgeListItem[];
  nextCursor: string | null;
}

export interface RecentKnowledgeItem {
  id: string;
  title: string;
  lastVisitedAt: string;
  visitCount: number;
}

function normalizeItem(value: unknown): KnowledgeListItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length === 0) return null;
  return {
    id: item.id,
    title: typeof item.title === "string" ? item.title : undefined,
    summary: typeof item.summary === "string" ? item.summary : undefined,
    publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : undefined,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

export async function loadKnowledgePage({ cursor, requester = fetch, signal }: { cursor: string | null; requester?: Fetcher; signal?: AbortSignal }): Promise<KnowledgePageResult> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/knowledge?${params.toString()}`, { requester, signal });
  return {
    items: Array.isArray(data.items) ? data.items.map(normalizeItem).filter((item): item is KnowledgeListItem => item !== null) : [],
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor.length > 0 ? data.nextCursor : null,
  };
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

export function createKnowledgeRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(cursor: string | null) {
      active?.abort();
      active = new AbortController();
      const requestGeneration = owner.claim();
      const promise = loadKnowledgePage({ cursor, requester, signal: active.signal }).then((page) => ({ generation: requestGeneration, page }));
      return { generation: requestGeneration, promise };
    },
    isCurrent(requestGeneration: number) {
      return owner.isCurrent(requestGeneration);
    },
    cancel() {
      owner.invalidate();
      active?.abort();
      active = null;
    },
  };
}
