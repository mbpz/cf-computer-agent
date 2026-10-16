import { apiFetch, type Fetcher } from "./api";
import { assetPreviewModel, type AssetPreviewModel } from "../components/assets/asset-preview-model";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export type AdminAssetStatus = "queued" | "processing" | "succeeded" | "failed_retryable" | "failed_terminal";
export interface AdminAsset { id: string; name?: string; status?: string; warnings?: string[]; attempts?: number; lastErrorCode?: string; }
export interface LoadAdminAssetsInput extends FrontendPageRequest { status?: AdminAssetStatus; signal?: AbortSignal; }
export type AdminAssetsPage = FrontendNumberedPage<AdminAsset>;
export async function loadAdminAssets({ page, pageSize, status, requester = fetch, signal }: LoadAdminAssetsInput & { requester?: Fetcher }): Promise<AdminAssetsPage> { const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }); if (status) params.set("status", status); return normalizeNumberedPage(await apiFetch(`/api/admin/assets?${params}`, { requester, signal }), normalize); }
export async function retryAdminAsset(id: string, requester: Fetcher = fetch): Promise<void> { await apiFetch(`/api/admin/assets/${encodeURIComponent(id)}/retry`, { requester, method: "POST" }); }
export async function loadAdminAssetPreview(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<AssetPreviewModel> { const data = await apiFetch<unknown>(`/api/admin/assets/${encodeURIComponent(id)}/preview`, { requester, signal }); const preview = assetPreviewModel(data); if (!preview || preview.assetId !== id) throw new Error("ASSET_PREVIEW_INVALID"); return preview; }
const ASSET_STATUSES = new Set(["queued", "processing", "succeeded", "failed_retryable", "failed_terminal"]);
function normalize(value: unknown): AdminAsset {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ASSET_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const asset = record.asset;
  const job = record.job;
  if (!asset || typeof asset !== "object" || Array.isArray(asset) || !job || typeof job !== "object" || Array.isArray(job)) throw new Error("ASSET_RESPONSE_INVALID");
  const a = asset as Record<string, unknown>;
  const j = job as Record<string, unknown>;
  const status = j.status;
  if (typeof a.id !== "string" || !a.id || typeof a.originalName !== "string" || a.originalName.length === 0 || typeof status !== "string" || !ASSET_STATUSES.has(status)) throw new Error("ASSET_RESPONSE_INVALID");
  // The job row is the only progress the server reports: an attempt counter and
  // the most recent error code. Both are optional and never defaulted, so the
  // page cannot show progress or an error the server did not send.
  const attempts = Number.isSafeInteger(j.attempts) && (j.attempts as number) >= 0 ? (j.attempts as number) : undefined;
  const lastErrorCode = typeof j.lastErrorCode === "string" && j.lastErrorCode ? j.lastErrorCode : undefined;
  return { id: a.id, name: a.originalName, status, warnings: [], ...(attempts === undefined ? {} : { attempts }), ...(lastErrorCode === undefined ? {} : { lastErrorCode }) };
}
export function createAdminAssetsRequestController(requester: Fetcher = fetch) { return createNumberedRequestController((input: Omit<LoadAdminAssetsInput, "signal">, signal) => loadAdminAssets({ ...input, requester, signal })); }
