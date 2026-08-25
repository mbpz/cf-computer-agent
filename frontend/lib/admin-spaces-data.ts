import { apiFetch, type Fetcher } from "./api";

export interface AdminCollection { id: string; name?: string; status?: string; }
export interface AdminSpace { id: string; name?: string; slug?: string; status?: string; collections: AdminCollection[]; }

export async function loadAdminSpaces({ requester = fetch, signal }: { requester?: Fetcher; signal?: AbortSignal } = {}): Promise<AdminSpace[]> {
  const data = await apiFetch<{ items?: unknown[] }>("/api/admin/spaces?limit=50", { requester, signal });
  const spaces = Array.isArray(data.items) ? data.items.map(normalizeSpace).filter((item): item is Omit<AdminSpace, "collections"> => item !== null) : [];
  const results: AdminSpace[] = [];
  for (const space of spaces) {
    const collectionData = await apiFetch<{ items?: unknown[] }>(`/api/admin/spaces/${encodeURIComponent(space.id)}/collections?limit=50`, { requester, signal });
    results.push({ ...space, collections: Array.isArray(collectionData.items) ? collectionData.items.map(normalizeCollection).filter((item): item is AdminCollection => item !== null) : [] });
  }
  return results;
}

export async function createAdminSpace(input: { slug: string; name: string }, requester: Fetcher = fetch): Promise<AdminSpace> {
  const data = await apiFetch<{ space?: unknown }>("/api/admin/spaces", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, position: 0 }) });
  const space = normalizeSpace(data.space);
  if (!space) throw new Error("SPACE_RESPONSE_INVALID");
  return { ...space, collections: [] };
}

function normalizeSpace(value: unknown): Omit<AdminSpace, "collections"> | null { if (!value || typeof value !== "object" || Array.isArray(value)) return null; const record = value as Record<string, unknown>; if (typeof record.id !== "string" || !record.id) return null; return { id: record.id, name: typeof record.name === "string" ? record.name : undefined, slug: typeof record.slug === "string" ? record.slug : undefined, status: typeof record.status === "string" ? record.status : undefined }; }
function normalizeCollection(value: unknown): AdminCollection | null { if (!value || typeof value !== "object" || Array.isArray(value)) return null; const record = value as Record<string, unknown>; if (typeof record.id !== "string" || !record.id) return null; return { id: record.id, name: typeof record.name === "string" ? record.name : undefined, status: typeof record.status === "string" ? record.status : undefined }; }
