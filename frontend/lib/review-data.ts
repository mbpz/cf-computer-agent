import { apiFetch, type Fetcher } from "./api";

export type ReviewPeriod = "daily" | "weekly";

export interface ReviewItem {
  knowledgeItemId: string;
  revisionId: string;
  title: string;
  publishedAt: string;
  lastVisitedAt: string | null;
  reason: "new" | "to_read";
  favorite: boolean;
}

export interface ReviewResult {
  period: ReviewPeriod;
  from: string;
  to: string;
  items: ReviewItem[];
}

export async function loadKnowledgeReview(period: ReviewPeriod, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ReviewResult> {
  const data = await apiFetch<unknown>(`/api/knowledge/review?period=${period}`, { requester, signal });
  return normalizeReview(data, period);
}

function normalizeReview(input: unknown, fallbackPeriod: ReviewPeriod): ReviewResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { period: fallbackPeriod, from: "", to: "", items: [] };
  const value = input as Record<string, unknown>;
  const period = value.period === "weekly" ? "weekly" : value.period === "daily" ? "daily" : fallbackPeriod;
  const from = typeof value.from === "string" ? value.from : "";
  const to = typeof value.to === "string" ? value.to : "";
  const items = Array.isArray(value.items) ? value.items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.knowledgeItemId !== "string" || !record.knowledgeItemId
      || typeof record.revisionId !== "string" || !record.revisionId
      || typeof record.title !== "string" || !record.title.trim()
      || typeof record.publishedAt !== "string"
      || (record.lastVisitedAt !== null && typeof record.lastVisitedAt !== "string")
      || (record.reason !== "new" && record.reason !== "to_read")
      || typeof record.favorite !== "boolean") return [];
    return [{
      knowledgeItemId: record.knowledgeItemId,
      revisionId: record.revisionId,
      title: record.title,
      publishedAt: record.publishedAt,
      lastVisitedAt: record.lastVisitedAt as string | null,
      reason: record.reason as "new" | "to_read",
      favorite: record.favorite,
    }];
  }) : [];
  return { period, from, to, items };
}
