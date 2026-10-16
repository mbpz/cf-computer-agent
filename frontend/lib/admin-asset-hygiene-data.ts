import { apiFetch, type Fetcher } from "./api";

/**
 * Administrator storage hygiene: what the server says about asset storage
 * capacity, which objects are orphaned, and reclaiming them. Nothing here
 * estimates: a value the server does not send is `null` (unavailable) and a
 * response that does not match the documented shape fails the read.
 */

/** The two prefixes the orphan scan accepts (`GET /api/admin/assets/orphans`). */
export type AdminOrphanPrefix = "staging" | "parsed";

export interface AdminAssetCapacity {
  readonly storageEnabled: boolean;
  readonly usedBytes: number | null;
  readonly maxBytes: number;
  readonly warningThresholdBytes: number;
  readonly warning: boolean;
}

export interface AdminOrphanCandidate {
  readonly key: string;
  readonly size: number;
  readonly uploadedAt: string;
}

export interface AdminOrphanPage {
  readonly items: readonly AdminOrphanCandidate[];
  readonly scanned: number;
  readonly truncated: boolean;
}

export interface AdminOrphanReclaimResult {
  readonly deleted: readonly string[];
  readonly skipped: readonly string[];
}

/** Server bounds: `limit` is 1..50 and one reclaim request carries at most 50 keys. */
export const ADMIN_ORPHAN_DEFAULT_LIMIT = 20;
export const ADMIN_ORPHAN_MAX_LIMIT = 50;

function invalid(): Error {
  return new Error("ADMIN_ASSET_HYGIENE_RESPONSE_INVALID");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function adminAssetCapacity(value: unknown): AdminAssetCapacity {
  const body = record(value);
  if (typeof body.storageEnabled !== "boolean" || typeof body.warning !== "boolean") throw invalid();
  const maxBytes = count(body.maxBytes);
  const warningThresholdBytes = count(body.warningThresholdBytes);
  if (maxBytes === null || warningThresholdBytes === null) throw invalid();
  // Storage disabled is the only documented case with no used size; an enabled
  // store that reports no usage is a malformed answer, not a zero.
  const usedBytes = body.storageEnabled ? count(body.usedBytes) : null;
  if (body.storageEnabled && usedBytes === null) throw invalid();
  if (!body.storageEnabled && body.usedBytes !== null) throw invalid();
  return Object.freeze({ storageEnabled: body.storageEnabled, usedBytes, maxBytes, warningThresholdBytes, warning: body.warning });
}

export function adminOrphanPage(value: unknown): AdminOrphanPage {
  const body = record(value);
  if (!Array.isArray(body.items)) throw invalid();
  const items: AdminOrphanCandidate[] = [];
  for (const entry of body.items as unknown[]) {
    const item = record(entry);
    const size = count(item.size);
    if (typeof item.key !== "string" || !item.key || size === null || typeof item.uploadedAt !== "string") throw invalid();
    items.push(Object.freeze({ key: item.key, size, uploadedAt: item.uploadedAt }));
  }
  const scanned = count(body.scanned);
  if (scanned === null || typeof body.truncated !== "boolean") throw invalid();
  if (new Set(items.map((item) => item.key)).size !== items.length) throw invalid();
  return Object.freeze({ items: Object.freeze(items), scanned, truncated: body.truncated });
}

export function adminOrphanReclaimResult(value: unknown): AdminOrphanReclaimResult {
  const body = record(value);
  const keys = (input: unknown): string[] => {
    if (!Array.isArray(input)) throw invalid();
    const list: string[] = [];
    for (const entry of input as unknown[]) {
      if (typeof entry !== "string") throw invalid();
      list.push(entry);
    }
    return list;
  };
  return Object.freeze({ deleted: Object.freeze(keys(body.deleted)), skipped: Object.freeze(keys(body.skipped)) });
}

export async function loadAdminAssetCapacity(requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminAssetCapacity> {
  return adminAssetCapacity(await apiFetch<unknown>("/api/admin/assets/capacity", { requester, signal }));
}

export async function loadAdminOrphans(input: {
  readonly prefix: AdminOrphanPrefix;
  readonly limit: number;
  readonly requester?: Fetcher;
  readonly signal?: AbortSignal;
}): Promise<AdminOrphanPage> {
  if (input.prefix !== "staging" && input.prefix !== "parsed") throw new Error("ADMIN_ORPHAN_REQUEST_INVALID");
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > ADMIN_ORPHAN_MAX_LIMIT) {
    throw new Error("ADMIN_ORPHAN_REQUEST_INVALID");
  }
  const params = new URLSearchParams({ prefix: input.prefix, limit: String(input.limit) });
  return adminOrphanPage(await apiFetch<unknown>(`/api/admin/assets/orphans?${params}`, {
    requester: input.requester ?? fetch,
    signal: input.signal,
  }));
}

export async function reclaimAdminOrphans(input: {
  readonly operationId: string;
  readonly keys: readonly string[];
  /** The number of objects the operator confirmed; the server refuses a mismatch. */
  readonly confirmCount: number;
  readonly requester?: Fetcher;
  readonly signal?: AbortSignal;
}): Promise<AdminOrphanReclaimResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.operationId)) throw new Error("ADMIN_ORPHAN_REQUEST_INVALID");
  if (input.keys.length < 1 || input.keys.length > ADMIN_ORPHAN_MAX_LIMIT || input.confirmCount !== input.keys.length) {
    throw new Error("ADMIN_ORPHAN_REQUEST_INVALID");
  }
  return adminOrphanReclaimResult(await apiFetch<unknown>("/api/admin/assets/orphans/reclaim", {
    requester: input.requester ?? fetch,
    signal: input.signal,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationId: input.operationId, keys: [...input.keys], confirmCount: input.confirmCount }),
  }));
}

/** Reclaimable bytes for a set of candidates, from the sizes the server reported. */
export function reclaimableBytes(items: readonly AdminOrphanCandidate[], keys: readonly string[]): number {
  const selected = new Set(keys);
  return items.reduce((total, item) => selected.has(item.key) ? total + item.size : total, 0);
}
