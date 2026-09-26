import { apiFetch, ApiRequestError, type Fetcher } from "../../lib/api";
import { reviewDetailModel, type ReviewDetailModel } from "./review-detail-model";

export interface ReviewPublishInput {
  readonly title: string;
  readonly visibility: "shared" | "admin_only";
  readonly spaceId: string;
  readonly collectionId: string | null;
  readonly tagIds: readonly string[];
}

export interface ReviewDetailData {
  readonly detail: ReviewDetailModel;
  readonly publish: ReviewPublishInput;
}

export function normalizeReviewPreview(input: unknown): ReviewDetailData | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const preview = input as Record<string, unknown>;
  const sourceVersion = preview.sourceVersion && typeof preview.sourceVersion === "object" && !Array.isArray(preview.sourceVersion)
    ? preview.sourceVersion as Record<string, unknown> : {};
  const safety = preview.safety && typeof preview.safety === "object" && !Array.isArray(preview.safety)
    ? preview.safety as Record<string, unknown> : {};
  const findings = Array.isArray(safety.findings) ? safety.findings : [];
  const warnings = findings.map((finding) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return "";
    const record = finding as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const message = typeof record.message === "string" ? record.message.trim() : "";
    return code && message ? `${code}: ${message}` : code || message;
  }).filter(Boolean).slice(0, 20);
  const publish: ReviewPublishInput = {
    title: typeof preview.title === "string" ? preview.title.trim() : "",
    visibility: preview.requestedVisibility === "admin_only" ? "admin_only" : "shared",
    spaceId: typeof preview.requestedSpaceId === "string" ? preview.requestedSpaceId.trim() : "",
    collectionId: typeof preview.requestedCollectionId === "string" ? preview.requestedCollectionId.trim() : null,
    tagIds: Array.isArray(preview.tagIds) ? preview.tagIds.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim()).slice(0, 50) : [],
  };
  const detail = reviewDetailModel({
    id: preview.submissionId,
    title: preview.title,
    submitter: preview.submitterId,
    status: preview.status,
    content: typeof sourceVersion.content === "string" ? sourceVersion.content : typeof preview.rawContent === "string" ? preview.rawContent : "",
    warnings,
  });
  return detail && /^[A-Za-z0-9_-]+$/u.test(publish.spaceId) ? { detail, publish } : null;
}

export async function loadReviewDetail(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ReviewDetailData> {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("REVIEW_DETAIL_INVALID");
  const payload = await apiFetch<{ preview?: unknown }>(`/api/admin/submissions/${encodeURIComponent(id)}`, { requester, signal });
  const result = normalizeReviewPreview(payload?.preview);
  if (!result || result.detail.id !== id) throw new Error("REVIEW_DETAIL_INVALID");
  return result;
}

export type ReviewDecision = "publish" | "request_changes" | "reject";

export interface ReviewNoteInput {
  readonly reasonCode: "not_relevant" | "duplicate" | "unsafe" | "needs_revision";
  readonly note: string;
}
export type ReviewReceipt =
  | { action: "publish"; status: "published"; revisionId: string; knowledgeItemId: string; searchStatus: "pending" | "indexed" | "search_degraded" | "failed" }
  | { action: "reject"; status: "rejected"; submissionId: string }
  | { action: "request_changes"; status: "revision_requested"; submissionId: string };
export interface ReviewOperation { readonly id: string; readonly action: ReviewDecision; readonly path: string; readonly body: string }
export const MAX_REVIEW_NOTE_BYTES = 4_000;

export function validReviewNote(note: string): boolean {
  // In Unicode mode the surrogate range matches lone units, not valid emoji pairs.
  return new TextEncoder().encode(note).byteLength <= MAX_REVIEW_NOTE_BYTES
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(note) && !/[\uD800-\uDFFF]/u.test(note);
}

export function prepareReviewDecision(id: string, action: ReviewDecision, publish: ReviewPublishInput, details?: ReviewNoteInput): ReviewOperation {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("REVIEW_DETAIL_INVALID");
  const input = details ?? { reasonCode: action === "request_changes" ? "needs_revision" : "not_relevant", note: "" };
  if (action !== "publish" && (!validReviewNote(input.note) || (action === "request_changes"
    ? input.reasonCode !== "needs_revision" : !["not_relevant", "duplicate", "unsafe"].includes(input.reasonCode)))) throw new Error("REVIEW_NOTE_INVALID");
  const path = action === "request_changes" ? "request-revision" : action;
  return Object.freeze({ id, action, path: `/api/admin/submissions/${encodeURIComponent(id)}/${path}`, body: JSON.stringify(action === "publish" ? publish : input) });
}

export async function sendReviewDecision(operation: ReviewOperation, requester: Fetcher = fetch): Promise<ReviewReceipt> {
  if (!/^[A-Za-z0-9_-]+$/u.test(operation.id)
    || !["publish", "reject", "request_changes"].includes(operation.action)) throw new Error("REVIEW_OPERATION_INVALID");
  // Reconstruct only the supported targets; a replay must match its saved intent.
  const path = operation.action === "publish"
    ? `/api/admin/submissions/${encodeURIComponent(operation.id)}/publish`
    : operation.action === "reject"
      ? `/api/admin/submissions/${encodeURIComponent(operation.id)}/reject`
      : `/api/admin/submissions/${encodeURIComponent(operation.id)}/request-revision`;
  if (path !== operation.path) throw new Error("REVIEW_OPERATION_INVALID");
  const payload = await apiFetch<unknown>(path, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: operation.body,
  });
  const record = asRecord(payload);
  if (operation.action === "publish") {
    const revision = asRecord(record?.revision);
    const searchStatus = revision?.searchStatus;
    if (typeof revision?.id === "string" && /^[A-Za-z0-9_-]+$/u.test(revision.id)
      && typeof revision.knowledgeItemId === "string" && /^[A-Za-z0-9_-]+$/u.test(revision.knowledgeItemId)
      && (searchStatus === "pending" || searchStatus === "indexed" || searchStatus === "search_degraded" || searchStatus === "failed")) {
      return { action: "publish", status: "published", revisionId: revision.id, knowledgeItemId: revision.knowledgeItemId, searchStatus };
    }
  } else {
    const decision = asRecord(record?.decision);
    if (decision?.submissionId === operation.id) {
      if (operation.action === "reject" && decision.decision === "rejected") return { action: "reject", status: "rejected", submissionId: operation.id };
      if (operation.action === "request_changes" && decision.decision === "revision_requested") return { action: "request_changes", status: "revision_requested", submissionId: operation.id };
    }
  }
  throw new Error("REVIEW_RECEIPT_INVALID");
}

export function submitReviewDecision(id: string, action: ReviewDecision, publish: ReviewPublishInput, requester: Fetcher = fetch, details?: ReviewNoteInput): Promise<ReviewReceipt> {
  return sendReviewDecision(prepareReviewDecision(id, action, publish, details), requester);
}

export type ReviewRecovery = "retry" | "reload" | "edit";
export function reviewRecovery(error: unknown, previouslyUncertain = false): ReviewRecovery {
  if (error instanceof ApiRequestError) {
    if (error.status === 409 || error.status === 404) return "reload";
    // Validation of a replay cannot prove that the original attempt did not commit.
    if (error.status === 400 || error.status === 422) return previouslyUncertain ? "reload" : "edit";
  }
  return "retry";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
