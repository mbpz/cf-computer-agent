import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface ReviewQueueItem { id: string; title?: string; submitter?: string; status?: string; }
export interface ReviewQueuePageResult { items: ReviewQueueItem[]; nextCursor: string | null; }

export async function loadReviewQueuePage({ cursor, requester = fetch, signal }: { cursor?: string | null; requester?: Fetcher; signal?: AbortSignal }): Promise<ReviewQueuePageResult> {
  const params = new URLSearchParams({ limit: "20", status: "review_pending" });
  if (cursor) params.set("cursor", cursor);
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/admin/submissions?${params.toString()}`, { requester, signal });
  return { items: Array.isArray(data.items) ? data.items.map(normalizeReview).filter((item): item is ReviewQueueItem => item !== null) : [], nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null };
}

function normalizeReview(value: unknown): ReviewQueueItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  return { id: record.id, title: typeof record.title === "string" ? record.title : undefined, submitter: typeof record.submitterId === "string" ? record.submitterId : undefined, status: typeof record.status === "string" ? record.status : undefined };
}

export function createReviewQueueRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(cursor?: string | null) { active?.abort(); active = new AbortController(); const generation = owner.claim(); const promise = loadReviewQueuePage({ cursor, requester, signal: active.signal }).then((page) => ({ generation, page })); return { generation, promise }; },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}
