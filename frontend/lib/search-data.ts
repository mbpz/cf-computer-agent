import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface SearchResultItem {
  id: string;
  knowledgeItemId?: string;
  title?: string;
  snippet?: string;
  href: string;
  matchedFields?: string[];
}

const MAX_QUERY_CODE_POINTS = 512;
const MATCHED_FIELDS = new Set(["title", "summary", "tags", "body", "code"]);

export type SearchPageResult = FrontendNumberedPage<SearchResultItem> & { degraded: boolean };
export interface LoadSearchPageInput extends FrontendPageRequest {
  query: string; tagIds?: string[]; tagMode?: "and" | "or"; spaceId?: string; collectionId?: string;
  kind?: "text" | "markdown" | "code"; authorId?: string; publishedFrom?: string; publishedTo?: string; signal?: AbortSignal;
}

export async function loadSearchPage({ query, page, pageSize, tagIds = [], requester = fetch, signal, ...filters }: LoadSearchPageInput & { requester?: Fetcher }): Promise<SearchPageResult> {
  const normalizedQuery = Array.from(typeof query === "string" ? query.trim() : "").slice(0, MAX_QUERY_CODE_POINTS).join("");
  const params = new URLSearchParams({ q: normalizedQuery, page: String(page), pageSize: String(pageSize) });
  for (const tagId of tagIds) params.append("tagId", tagId);
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, value);
  const data = await apiFetch<Record<string, unknown>>(`/api/knowledge/search?${params.toString()}`, { requester, signal });
  return { ...normalizeNumberedPage(data, normalizeSearchItem), degraded: data.degraded === true };
}

function normalizeSearchItem(value: unknown): SearchResultItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SEARCH_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.knowledgeItemId !== "string" || !record.knowledgeItemId) throw new Error("SEARCH_RESPONSE_INVALID");
  const citation = typeof record.citationId === "string" && record.citationId ? record.citationId : undefined;
  const matchedFields = Array.isArray(record.matchedFields)
    ? record.matchedFields.filter((field): field is string => typeof field === "string" && MATCHED_FIELDS.has(field))
    : [];
  return {
    id: citation || record.knowledgeItemId,
    knowledgeItemId: record.knowledgeItemId,
    title: typeof record.title === "string" ? record.title : undefined,
    snippet: typeof record.excerpt === "string" ? record.excerpt : undefined,
    href: `/knowledge/${encodeURIComponent(record.knowledgeItemId)}${citation ? `#${encodeURIComponent(citation)}` : ""}`,
    matchedFields,
  };
}

export function createSearchRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadSearchPageInput, "signal">, signal) => loadSearchPage({ ...input, requester, signal }));
}
