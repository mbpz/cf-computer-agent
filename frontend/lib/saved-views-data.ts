import { apiFetch, ApiRequestError, type Fetcher } from "./api";

export interface SavedViewFilters {
  v: 1;
  q: string;
  spaceId: string | null;
  collectionId: string | null;
  tagIds: string[];
  tagMode: "and" | "or";
}

export interface SavedViewItem {
  id: string;
  name: string;
  filters: SavedViewFilters;
  updatedAt: string;
}

export async function loadSavedViews(requester: Fetcher = fetch): Promise<SavedViewItem[]> {
  const data = await apiFetch<{ items?: unknown[] }>("/api/saved-views?limit=50", { requester });
  return Array.isArray(data.items) ? data.items.map(normalizeSavedView).filter((item): item is SavedViewItem => item !== null) : [];
}

export async function createSavedView(name: string, filters: Partial<SavedViewFilters>, requester: Fetcher = fetch): Promise<SavedViewItem> {
  const data = await apiFetch<unknown>("/api/saved-views", {
    requester: expectStatus(requester, 201),
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, filters: savedViewInputFilters(filters) }),
  });
  const result = verifiedSavedView(data);
  if (!result || result.name !== name.trim() || !sameSavedViewFilters(result.filters, canonicalSavedViewFilters(filters))) throw new Error("SAVED_VIEW_INVALID");
  return result;
}

export async function updateSavedView(id: string, name: string, filters: Partial<SavedViewFilters>, requester: Fetcher = fetch): Promise<SavedViewItem> {
  const data = await apiFetch<unknown>(`/api/saved-views/${encodeURIComponent(id)}`, {
    requester: expectStatus(requester, 200),
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, filters: savedViewInputFilters(filters) }),
  });
  const result = verifiedSavedView(data);
  if (!result || result.id !== id || result.name !== name.trim() || !sameSavedViewFilters(result.filters, canonicalSavedViewFilters(filters))) throw new Error("SAVED_VIEW_INVALID");
  return result;
}

export async function deleteSavedView(id: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch<void>(`/api/saved-views/${encodeURIComponent(id)}`, { requester: expectStatus(requester, 204), method: "DELETE" });
}

export function normalizeSavedView(value: unknown): SavedViewItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id || typeof record.name !== "string" || !record.name) return null;
  const filters = normalizeFilters(record.filters && typeof record.filters === "object" && !Array.isArray(record.filters) ? record.filters as Partial<SavedViewFilters> : {});
  return { id: record.id, name: record.name, filters, updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "" };
}

function normalizeFilters(value: Partial<SavedViewFilters>): SavedViewFilters {
  return {
    v: 1,
    q: typeof value.q === "string" ? value.q : "",
    spaceId: typeof value.spaceId === "string" ? value.spaceId : null,
    collectionId: typeof value.collectionId === "string" ? value.collectionId : null,
    tagIds: Array.isArray(value.tagIds) ? value.tagIds.filter((tag): tag is string => typeof tag === "string").slice(0, 20) : [],
    tagMode: value.tagMode === "and" ? "and" : "or",
  };
}


// Schema version belongs to stored/returned filters, not the write API input.
function savedViewInputFilters(value: Partial<SavedViewFilters>): Omit<SavedViewFilters, "v"> {
  const { v: _version, ...filters } = canonicalSavedViewFilters(value);
  return filters;
}

export function canonicalSavedViewFilters(value: Partial<SavedViewFilters>): SavedViewFilters {
  const filters = normalizeFilters(value);
  return { ...filters, q: filters.q.trim(), tagIds: [...new Set(filters.tagIds)] };
}
export function sameSavedViewFilters(left: SavedViewFilters, right: SavedViewFilters): boolean {
  return left.q === right.q && left.spaceId === right.spaceId && left.collectionId === right.collectionId
    && left.tagMode === right.tagMode && JSON.stringify([...left.tagIds].sort()) === JSON.stringify([...right.tagIds].sort());
}
export function verifiedSavedView(value: unknown): SavedViewItem | null {
  const item = normalizeSavedView(value);
  if (!item || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(item.id) || !item.name.trim()
    || item.name !== item.name.trim() || [...item.name].length > 80 || !item.updatedAt || Number.isNaN(Date.parse(item.updatedAt))) return null;
  const filters = (value as Record<string, unknown>).filters as Record<string, unknown> | undefined;
  if (!filters || filters.v !== 1 || typeof filters.q !== "string" || filters.q !== filters.q.trim()
    || !["and", "or"].includes(String(filters.tagMode)) || !Array.isArray(filters.tagIds) || filters.tagIds.length > 20
    || filters.tagIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id))
    || [filters.spaceId, filters.collectionId].some(id => id !== null && (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id)))) return null;
  return item;
}
function expectStatus(requester: Fetcher, status: number): Fetcher {
  return async (input, init) => {
    const response = await requester(input, init);
    if (response.ok && response.status !== status) throw new Error("SAVED_VIEW_INVALID");
    return response;
  };
}

/** Bounded read-only reconciliation, never a replay of a non-idempotent POST. */
export async function findSavedView(name: string, filters: Partial<SavedViewFilters>, requester: Fetcher = fetch): Promise<SavedViewItem | null> {
  const visited = new Set<string>(); let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const path = `/api/saved-views?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(path, { requester: expectStatus(requester, 200), cache: "no-store" });
    if (!data || !Array.isArray(data.items)) throw new Error("SAVED_VIEW_INVALID");
    const items = data.items.map(verifiedSavedView);
    if (items.some(item => item === null)) throw new Error("SAVED_VIEW_INVALID");
    const found = items.find(item => item?.name === name.trim() && sameSavedViewFilters(item.filters, canonicalSavedViewFilters(filters)));
    if (found) return found;
    if (data.nextCursor === undefined || data.nextCursor === null) return null;
    if (typeof data.nextCursor !== "string" || !/^[A-Za-z0-9_-]{1,512}$/u.test(data.nextCursor) || visited.has(data.nextCursor)) throw new Error("SAVED_VIEW_INVALID");
    cursor = data.nextCursor; visited.add(cursor);
  }
  // An incomplete read, including the bound, cannot prove the write failed.
  return null;
}
export async function savedViewIsAbsent(id: string, requester: Fetcher = fetch): Promise<boolean> {
  try {
    const result = await apiFetch<unknown>(`/api/saved-views/${encodeURIComponent(id)}`, { requester: expectStatus(requester, 200), cache: "no-store" });
    if (verifiedSavedView(result)?.id !== id) throw new Error("SAVED_VIEW_INVALID");
    return false;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404 && error.code === "SAVED_VIEW_NOT_FOUND") return true;
    throw error;
  }
}
