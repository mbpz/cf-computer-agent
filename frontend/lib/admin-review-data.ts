import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface ReviewQueueItem { id: string; title?: string; submitter?: string; status?: string; }
export interface LoadReviewQueueInput extends FrontendPageRequest { signal?: AbortSignal; }
export type ReviewQueuePageResult = FrontendNumberedPage<ReviewQueueItem>;

export async function loadReviewQueuePage({ page, pageSize, requester = fetch, signal }: LoadReviewQueueInput & { requester?: Fetcher }): Promise<ReviewQueuePageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: "review_pending" });
  return normalizeNumberedPage(await apiFetch(`/api/admin/submissions?${params}`, { requester, signal }), normalizeReview);
}
function normalizeReview(value: unknown): ReviewQueueItem { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("REVIEW_RESPONSE_INVALID"); const record = value as Record<string, unknown>; if (typeof record.id !== "string" || !record.id) throw new Error("REVIEW_RESPONSE_INVALID"); return { id: record.id, title: typeof record.title === "string" ? record.title : undefined, submitter: typeof record.submitterId === "string" ? record.submitterId : undefined, status: typeof record.status === "string" ? record.status : undefined }; }
export function createReviewQueueRequestController(requester: Fetcher = fetch) { return createNumberedRequestController((input: Omit<LoadReviewQueueInput, "signal">, signal) => loadReviewQueuePage({ ...input, requester, signal })); }
