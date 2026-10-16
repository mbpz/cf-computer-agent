import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";
import { isCanonicalTimestamp } from "../components/review/review-detail-data";

export interface ReviewQueueItem { id: string; title?: string; submitter?: string; status?: string; updatedAt?: string; }
export interface LoadReviewQueueInput extends FrontendPageRequest { signal?: AbortSignal; }
export type ReviewQueuePageResult = FrontendNumberedPage<ReviewQueueItem>;

export async function loadReviewQueuePage({ page, pageSize, requester = fetch, signal }: LoadReviewQueueInput & { requester?: Fetcher }): Promise<ReviewQueuePageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: "review_pending" });
  return normalizeNumberedPage(await apiFetch(`/api/admin/submissions?${params}`, { requester, signal }), normalizeReview);
}
function normalizeReview(value: unknown): ReviewQueueItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("REVIEW_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id || typeof record.title !== "string" || typeof record.submitterId !== "string" || record.submitterId.length === 0 || record.status !== "review_pending") throw new Error("REVIEW_RESPONSE_INVALID");
  // The submission version is the decision precondition; a malformed version
  // must fail the read rather than let the queue send an unprotected decision.
  if (record.updatedAt !== undefined && !isCanonicalTimestamp(record.updatedAt)) throw new Error("REVIEW_RESPONSE_INVALID");
  return {
    id: record.id,
    title: record.title,
    submitter: record.submitterId,
    status: "review_pending",
    ...(record.updatedAt === undefined ? {} : { updatedAt: record.updatedAt }),
  };
}
export function createReviewQueueRequestController(requester: Fetcher = fetch) { return createNumberedRequestController((input: Omit<LoadReviewQueueInput, "signal">, signal) => loadReviewQueuePage({ ...input, requester, signal })); }
