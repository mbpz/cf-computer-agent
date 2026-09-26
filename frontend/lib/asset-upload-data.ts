import { apiFetch, type Fetcher } from "./api";
import type { AssetIntent } from "./asset-upload-intent";
export type AssetResult = { asset: { id: string; ownerId: string; originalName: string; byteSize: number; contentType: string; contentSha256: string; idempotencyKey: string; submissionId?: string | null }; job: { assetId: string; status: "queued" | "processing" | "succeeded" | "failed_retryable" | "failed_terminal" } };
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
export function validateAssetResult(value: unknown, memberId: string, intent: AssetIntent): AssetResult {
  const r = value as AssetResult | undefined;
  if (!r?.asset || !r.job || !id(r.asset.id) || r.job.assetId !== r.asset.id || r.asset.ownerId !== memberId || r.asset.idempotencyKey !== intent.key
    || r.asset.originalName !== intent.file.name.trim() || r.asset.byteSize !== intent.file.size || r.asset.contentType !== intent.file.type || r.asset.contentSha256 !== intent.file.sha256
    || !["queued", "processing", "succeeded", "failed_retryable", "failed_terminal"].includes(r.job.status)) throw Error("ASSET_RESPONSE_INVALID");
  return r;
}
export function uploadAsset(file: File, intent: AssetIntent, requester: Fetcher, signal: AbortSignal) {
  return apiFetch<unknown>("/api/assets", { method: "POST", requester, signal, body: file, headers: { "idempotency-key": intent.key, "x-asset-name": encodeURIComponent(intent.file.name), "x-asset-name-encoding": "uri-component", "content-type": intent.file.type } });
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
export async function submitAsset(assetId: string, review: NonNullable<AssetIntent["review"]>, requester: Fetcher, signal: AbortSignal): Promise<string> {
  const result = await apiFetch<{ submission: { id: string } }>(`/api/assets/${assetId}/submit`, { method: "POST", requester, signal, headers: { "content-type": "application/json", "idempotency-key": review.key }, body: JSON.stringify({ requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared", title: review.title }) });
  if (!id(result?.submission?.id)) throw Error("ASSET_SUBMISSION_RESPONSE_INVALID"); return result.submission.id;
}
export function assetContentType(file: File): string {
  const types: Record<string, string> = { txt: "text/plain", md: "text/markdown", csv: "text/csv", html: "text/html", xml: "application/xml", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  return file.type.trim().toLowerCase().split(";")[0] || types[file.name.split(".").at(-1)!.toLowerCase()] || "application/octet-stream";
}
