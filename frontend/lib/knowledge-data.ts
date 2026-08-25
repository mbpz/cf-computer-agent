import { apiFetch, type Fetcher } from "./api";

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

export function createKnowledgeRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  let generation = 0;
  return {
    request(cursor: string | null) {
      active?.abort();
      active = new AbortController();
      const requestGeneration = ++generation;
      const promise = loadKnowledgePage({ cursor, requester, signal: active.signal }).then((page) => ({ generation: requestGeneration, page }));
      return { generation: requestGeneration, promise };
    },
    isCurrent(requestGeneration: number) {
      return requestGeneration === generation;
    },
    cancel() {
      generation += 1;
      active?.abort();
      active = null;
    },
  };
}
