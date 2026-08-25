import { apiFetch, type Fetcher } from "../../lib/api";
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

export async function loadReviewDetail(id: string, requester: Fetcher = fetch): Promise<ReviewDetailData> {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("REVIEW_DETAIL_INVALID");
  const payload = await apiFetch<{ preview?: unknown }>(`/api/admin/submissions/${encodeURIComponent(id)}`, { requester });
  const result = normalizeReviewPreview(payload.preview);
  if (!result) throw new Error("REVIEW_DETAIL_INVALID");
  return result;
}

export type ReviewDecision = "publish" | "request_changes" | "reject";

export async function submitReviewDecision(id: string, action: ReviewDecision, publish: ReviewPublishInput, requester: Fetcher = fetch): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("REVIEW_DETAIL_INVALID");
  const encodedId = encodeURIComponent(id);
  if (action === "publish") {
    await apiFetch(`/api/admin/submissions/${encodedId}/publish`, {
      requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(publish),
    });
    return;
  }
  const path = action === "request_changes" ? "request-revision" : "reject";
  const body = action === "request_changes"
    ? { reasonCode: "needs_revision", note: "" }
    : { reasonCode: "not_relevant", note: "" };
  await apiFetch(`/api/admin/submissions/${encodedId}/${path}`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
