import { apiFetch, type Fetcher } from "./api";

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
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, filters: normalizeFilters(filters) }),
  });
  const result = normalizeSavedView(data);
  if (!result) throw new Error("SAVED_VIEW_INVALID");
  return result;
}

export async function updateSavedView(id: string, name: string, filters: Partial<SavedViewFilters>, requester: Fetcher = fetch): Promise<SavedViewItem> {
  const data = await apiFetch<unknown>(`/api/saved-views/${encodeURIComponent(id)}`, {
    requester,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, filters: normalizeFilters(filters) }),
  });
  const result = normalizeSavedView(data);
  if (!result) throw new Error("SAVED_VIEW_INVALID");
  return result;
}

export async function deleteSavedView(id: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch<void>(`/api/saved-views/${encodeURIComponent(id)}`, { requester, method: "DELETE" });
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

