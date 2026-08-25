import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface SearchResultItem {
  id: string;
  title?: string;
  snippet?: string;
  href: string;
  matchedFields?: string[];
}

const MAX_QUERY_CODE_POINTS = 512;
const MATCHED_FIELDS = new Set(["title", "summary", "tags", "body", "code"]);

export interface SearchPageResult {
  items: SearchResultItem[];
  nextCursor: string | null;
  degraded: boolean;
}

export async function loadSearchPage({ query, cursor, requester = fetch, signal }: { query: string; cursor?: string | null; requester?: Fetcher; signal?: AbortSignal }): Promise<SearchPageResult> {
  const normalizedQuery = Array.from(typeof query === "string" ? query.trim() : "").slice(0, MAX_QUERY_CODE_POINTS).join("");
  const params = new URLSearchParams({ q: normalizedQuery, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown; degraded?: unknown }>(`/api/knowledge/search?${params.toString()}`, { requester, signal });
  return {
    items: Array.isArray(data.items) ? data.items.map(normalizeSearchItem).filter((item): item is SearchResultItem => item !== null) : [],
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor.length > 0 ? data.nextCursor : null,
    degraded: data.degraded === true,
  };
}

function normalizeSearchItem(value: unknown): SearchResultItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.knowledgeItemId !== "string" || !record.knowledgeItemId) return null;
  const citation = typeof record.citationId === "string" && record.citationId ? record.citationId : undefined;
  const matchedFields = Array.isArray(record.matchedFields)
    ? record.matchedFields.filter((field): field is string => typeof field === "string" && MATCHED_FIELDS.has(field))
    : [];
  return {
    id: citation || record.knowledgeItemId,
    title: typeof record.title === "string" ? record.title : undefined,
    snippet: typeof record.excerpt === "string" ? record.excerpt : undefined,
    href: `/knowledge/${encodeURIComponent(record.knowledgeItemId)}${citation ? `#${encodeURIComponent(citation)}` : ""}`,
    matchedFields,
  };
}

export function createSearchRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(query: string, cursor?: string | null) {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      return { generation, promise: loadSearchPage({ query, cursor, requester, signal: active.signal }).then((page) => ({ generation, page })) };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}
