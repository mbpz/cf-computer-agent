import { apiFetch, type Fetcher } from "./api";

export interface AssetResumeState {
  assetId: string;
  originalName: string;
  assetStatus: "ready" | "quarantined" | "failed";
  jobStatus: "queued" | "processing" | "succeeded" | "failed_retryable" | "failed_terminal";
  attempts: number;
}

export async function loadAssetResume(
  idempotencyKey: string,
  requester: Fetcher = fetch,
): Promise<AssetResumeState> {
  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0 || idempotencyKey.length > 200
    || /[\u0000-\u001f\u007f]/u.test(idempotencyKey)) {
    throw new Error("ASSET_RESUME_INVALID");
  }
  const value = await apiFetch<unknown>("/api/assets/resume", {
    requester,
    headers: { "idempotency-key": idempotencyKey },
  });
  const state = parseAssetResumeState(value);
  if (!state) throw new Error("ASSET_RESUME_INVALID");
  return state;
}

function parseAssetResumeState(value: unknown): AssetResumeState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const asset = record.asset;
  const job = record.job;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)
    || !job || typeof job !== "object" || Array.isArray(job)) return null;
  const assetRecord = asset as Record<string, unknown>;
  const jobRecord = job as Record<string, unknown>;
  const assetId = assetRecord.id;
  const originalName = assetRecord.originalName;
  const assetStatus = assetRecord.status;
  const jobStatus = jobRecord.status;
  const attempts = jobRecord.attempts;
  if (typeof assetId !== "string" || assetId.length === 0
    || typeof originalName !== "string" || originalName.length === 0
    || (assetStatus !== "ready" && assetStatus !== "quarantined" && assetStatus !== "failed")
    || (jobStatus !== "queued" && jobStatus !== "processing" && jobStatus !== "succeeded"
      && jobStatus !== "failed_retryable" && jobStatus !== "failed_terminal")
    || typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 0) return null;
  return { assetId, originalName, assetStatus, jobStatus, attempts };
}
