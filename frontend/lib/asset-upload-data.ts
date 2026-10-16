import { validateSubmissionTarget, type SubmissionTarget } from "./submission-data";
import { apiFetch, type Fetcher } from "./api";
import type { AssetFileDescription, AssetIntent, AssetReview } from "./asset-upload-intent";
export type AssetResult = { asset: { id: string; ownerId: string; originalName: string; byteSize: number; contentType: string; contentSha256: string; idempotencyKey: string; submissionId?: string | null }; job: { assetId: string; status: "queued" | "processing" | "succeeded" | "failed_retryable" | "failed_terminal" } };
/** Alternative text always carries content; a file review does not. */
export type AssetAlternativeReview = { key: string; title: string; content: string; target?: SubmissionTarget };
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
/** A URL intent has no local bytes, so its description is only comparable once the server returned one. */
export function validateAssetResult(value: unknown, memberId: string, intent: AssetIntent): AssetResult {
  const r = value as AssetResult | undefined;
  const local = intent.file;
  if (!r?.asset || !r.job || !id(r.asset.id) || r.job.assetId !== r.asset.id || r.asset.ownerId !== memberId || r.asset.idempotencyKey !== intent.key
    || !["queued", "processing", "succeeded", "failed_retryable", "failed_terminal"].includes(r.job.status)) throw Error("ASSET_RESPONSE_INVALID");
  if (local && (r.asset.originalName !== local.name.trim() || r.asset.byteSize !== local.size || r.asset.contentType !== local.type || r.asset.contentSha256 !== local.sha256)) throw Error("ASSET_RESPONSE_INVALID");
  return r;
}
export function assetResultFile(result: AssetResult): AssetFileDescription {
  return { name: result.asset.originalName, size: result.asset.byteSize, type: result.asset.contentType, sha256: result.asset.contentSha256 };
}
export function uploadAsset(file: File, intent: AssetIntent & { file: AssetFileDescription }, requester: Fetcher, signal: AbortSignal) {
  return apiFetch<unknown>("/api/assets", { method: "POST", requester, signal, body: file, headers: { "idempotency-key": intent.key, "x-asset-name": encodeURIComponent(intent.file.name), "x-asset-name-encoding": "uri-component", "content-type": intent.file.type } });
}
/** Snapshot a remote URL server-side; the same idempotency key replays the same asset, never a second fetch. */
export function loadAssetFromUrl(url: string, key: string, requester: Fetcher, signal: AbortSignal) {
  return apiFetch<unknown>("/api/assets/from-url", { method: "POST", requester, signal, headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ url }) });
}
export function resumeAsset(key: string, requester: Fetcher, signal: AbortSignal) {
  return apiFetch<unknown>("/api/assets/resume", { method: "GET", requester, signal, headers: { "idempotency-key": key } });
}
export function parseAsset(assetId: string, requester: Fetcher, signal: AbortSignal) {
  return apiFetch<unknown>(`/api/assets/${assetId}`, { method: "POST", requester, signal });
}
export function cancelAsset(assetId: string, requester: Fetcher, signal: AbortSignal) {
  return apiFetch<void>(`/api/assets/${assetId}/cancel`, { method: "POST", requester, signal });
}
export function assetDownloadHref(assetId: string, variant: "original" | "parsed"): string {
  return `/api/assets/${encodeURIComponent(assetId)}/${variant}`;
}
export async function submitAsset(assetId: string, review: AssetReview, requester: Fetcher, signal: AbortSignal): Promise<string> {
  const result = await apiFetch<{ submission: { id: string } }>(`/api/assets/${assetId}/submit`, { method: "POST", requester, signal, headers: { "content-type": "application/json", "idempotency-key": review.key }, body: JSON.stringify({ ...validateSubmissionTarget(review.target ?? { requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" }), title: review.title }) });
  if (!id(result?.submission?.id)) throw Error("ASSET_SUBMISSION_RESPONSE_INVALID"); return result.submission.id;
}
/** The member's own text replaces an unparseable snapshot; the asset itself is never paired with the submission. */
export async function submitAssetAlternative(assetId: string, review: AssetAlternativeReview, requester: Fetcher, signal: AbortSignal): Promise<string> {
  const result = await apiFetch<{ submission: { id: string } }>(`/api/assets/${assetId}/alternative`, { method: "POST", requester, signal, headers: { "content-type": "application/json", "idempotency-key": review.key }, body: JSON.stringify({ ...validateSubmissionTarget(review.target ?? { requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" }), title: review.title, content: review.content }) });
  if (!id(result?.submission?.id)) throw Error("ASSET_SUBMISSION_RESPONSE_INVALID"); return result.submission.id;
}
export function assetContentType(file: File): string {
  const types: Record<string, string> = { txt: "text/plain", md: "text/markdown", csv: "text/csv", html: "text/html", xml: "application/xml", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  return file.type.trim().toLowerCase().split(";")[0] || types[file.name.split(".").at(-1)!.toLowerCase()] || "application/octet-stream";
}
