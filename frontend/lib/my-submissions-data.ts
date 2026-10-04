import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export type MySubmissionReviewDecision = "rejected" | "revision_requested";
export type MySubmissionReviewReasonCode = "not_relevant" | "duplicate" | "unsafe" | "needs_revision";
export interface MySubmissionReview {
  decision: MySubmissionReviewDecision;
  reasonCode: MySubmissionReviewReasonCode;
  note: string;
}
export interface MySubmissionItem { id: string; title?: string; status?: string; review?: MySubmissionReview; }
export type MySubmissionsPageResult = FrontendNumberedPage<MySubmissionItem>;
export interface LoadMySubmissionsPageInput extends FrontendPageRequest { status?: string; signal?: AbortSignal; }

export async function loadMySubmissionsPage({ page, pageSize, status, requester = fetch, signal }: LoadMySubmissionsPageInput & { requester?: Fetcher }): Promise<MySubmissionsPageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set("status", status);
  return normalizeNumberedPage(await apiFetch(`/api/submissions/mine?${params.toString()}`, { requester, signal }), normalizeSubmission);
}

function normalizeSubmission(value: unknown): MySubmissionItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SUBMISSION_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (typeof record.id !== "string" || !record.id || typeof record.title !== "string" || !isSubmissionStatus(status)) throw new Error("SUBMISSION_RESPONSE_INVALID");
  const review = normalizeReview(record.review);
  return {
    id: record.id,
    title: record.title,
    status,
    ...(review ? { review } : {}),
  };
}

function isSubmissionStatus(value: unknown): value is "draft" | "review_pending" | "published" | "rejected" | "revision_requested" {
  return value === "draft" || value === "review_pending" || value === "published" || value === "rejected" || value === "revision_requested";
}

function normalizeReview(value: unknown): MySubmissionReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isReviewDecision(record.decision) || !isReviewReasonCode(record.reasonCode) || typeof record.note !== "string") return null;
  return { decision: record.decision, reasonCode: record.reasonCode, note: record.note };
}

function isReviewDecision(value: unknown): value is MySubmissionReviewDecision {
  return value === "rejected" || value === "revision_requested";
}

function isReviewReasonCode(value: unknown): value is MySubmissionReviewReasonCode {
  return value === "not_relevant" || value === "duplicate" || value === "unsafe" || value === "needs_revision";
}

export function createMySubmissionsRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadMySubmissionsPageInput, "signal">, signal) => loadMySubmissionsPage({ ...input, requester, signal }));
}
