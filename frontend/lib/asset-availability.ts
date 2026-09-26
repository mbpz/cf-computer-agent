import type { AssetAvailability } from "../../shared/asset-availability";
import { apiFetch, type Fetcher } from "./api";

export async function loadAssetAvailability(options: { signal?: AbortSignal; requester?: Fetcher } = {}): Promise<AssetAvailability> {
  const payload = await apiFetch<unknown>("/api/assets/availability", { method: "GET", signal: options.signal, requester: options.requester });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid asset availability");
  const value = payload as Record<string, unknown>;
  if (typeof value.maxBytes !== "number" || !Number.isSafeInteger(value.maxBytes) || value.maxBytes <= 0) throw new Error("Invalid asset limit");
  if (value.storageEnabled === true && value.reason === null) return { storageEnabled: true, reason: null, maxBytes: value.maxBytes };
  if (value.storageEnabled === false && value.reason === "ASSET_STORAGE_NOT_CONFIGURED") return { storageEnabled: false, reason: value.reason, maxBytes: value.maxBytes };
  throw new Error("Invalid asset configuration");
}
