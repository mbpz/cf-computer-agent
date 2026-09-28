import { apiFetch, type Fetcher } from "./api";
import type { Space, Collection } from "../../src/spaces/types";

export type AdminCollection = Collection;
export interface AdminSpace extends Space { collections: AdminCollection[]; collectionsCursor?: string; }
export interface AdminSpacesPage { items: AdminSpace[]; nextCursor?: string; }
type ReadOptions = { requester?: Fetcher; signal?: AbortSignal; cursor?: string };

export async function loadAdminSpaces(options: ReadOptions = {}): Promise<AdminSpace[]> {
  return (await loadAdminSpacesPage(options)).items;
}
export async function loadAdminSpacesPage({ requester = fetch, signal, cursor }: ReadOptions = {}): Promise<AdminSpacesPage> {
  const data = page(await apiFetch<unknown>(pageUrl("/api/admin/spaces", cursor), { requester, signal }), normalizeSpace);
  const items: AdminSpace[] = [];
  for (const space of data.items) {
    const collections = await loadAdminCollections(space.id, { requester, signal });
    items.push({ ...space, collections: collections.items, collectionsCursor: collections.nextCursor });
  }
  return { items, nextCursor: data.nextCursor };
}
export async function loadAdminCollections(spaceId: string, { requester = fetch, signal, cursor }: ReadOptions = {}) {
  return page(await apiFetch<unknown>(pageUrl(`/api/admin/spaces/${encodeURIComponent(spaceId)}/collections`, cursor), { requester, signal }), (value) => normalizeCollection(value, spaceId));
}
export async function createAdminSpace(input: { slug: string; name: string }, requester: Fetcher = fetch): Promise<AdminSpace> {
  const data = record(await apiFetch<unknown>("/api/admin/spaces", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, position: 0 }) }));
  const space = normalizeSpace(data.space);
  if (space.name !== input.name || space.slug !== input.slug || space.kind !== "shared" || space.readOnly || space.status !== "active" || space.position !== 0) invalid();
  return { ...space, collections: [] };
}
function pageUrl(path: string, cursor?: string) { const params = new URLSearchParams({ limit: "50" }); if (cursor) params.set("cursor", cursor); return `${path}?${params}`; }
function invalid(): never { throw new Error("SPACE_RESPONSE_INVALID"); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function text(value: unknown, max = 1000): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function normalizeBase(value: unknown) {
  const r = record(value);
  if (!text(r.id) || !text(r.name, 120) || typeof r.description !== "string" || r.description.length > 1000 || !["active", "disabled"].includes(String(r.status)) || !Number.isSafeInteger(r.position) || Number(r.position) < 0 || Number(r.position) > 1_000_000 || !text(r.createdAt) || !Number.isFinite(Date.parse(r.createdAt)) || !text(r.updatedAt) || !Number.isFinite(Date.parse(r.updatedAt))) invalid();
  return r;
}
function normalizeSpace(value: unknown): Space {
  const r = normalizeBase(value);
  if (!text(r.slug, 80) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug) || !["shared", "legacy"].includes(String(r.kind)) || typeof r.readOnly !== "boolean" || (r.kind === "legacy" && !r.readOnly)) invalid();
  return r as unknown as Space;
}
function normalizeCollection(value: unknown, spaceId: string): Collection {
  const r = normalizeBase(value);
  if (r.spaceId !== spaceId || (r.parentId !== null && !text(r.parentId))) invalid();
  return r as unknown as Collection;
}
function page<T extends { id: string }>(value: unknown, normalize: (value: unknown) => T): { items: T[]; nextCursor?: string } {
  const r = record(value);
  if (!Array.isArray(r.items) || r.items.length > 50 || (r.nextCursor !== undefined && !text(r.nextCursor, 4096))) invalid();
  const items = (r.items as unknown[]).map(normalize);
  if (new Set(items.map(item => item.id)).size !== items.length || (!items.length && r.nextCursor !== undefined)) invalid();
  return { items, nextCursor: r.nextCursor as string | undefined };
}
