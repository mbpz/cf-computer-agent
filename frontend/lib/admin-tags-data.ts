import { apiFetch, type Fetcher } from "./api";

/**
 * Tag administration for one space.
 *
 * The server exposes exactly two tag operations to an administrator: list the
 * active tags of a space and create one. There is no rename, no status change
 * and no delete for tags anywhere in the admin API, so the surface offers only
 * those two and says so; it never renders a disabled control that pretends the
 * rest exists.
 */
export interface AdminTag {
  readonly id: string;
  readonly spaceId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: "active";
}

export interface AdminTagPage {
  readonly items: readonly AdminTag[];
  readonly nextCursor: string | null;
}

function invalid(): Error {
  return new Error("TAG_RESPONSE_INVALID");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function adminTag(value: unknown): AdminTag {
  const body = record(value);
  const id = text(body.id);
  const spaceId = text(body.spaceId);
  const slug = text(body.slug);
  const name = text(body.name);
  if (!id || !spaceId || !slug || !name || body.status !== "active") throw invalid();
  return Object.freeze({ id, spaceId, slug, name, status: "active" });
}

export function adminTagPage(value: unknown): AdminTagPage {
  const body = record(value);
  if (!Array.isArray(body.items)) throw invalid();
  const items = (body.items as unknown[]).map(adminTag);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw invalid();
  const nextCursor = body.nextCursor === undefined || body.nextCursor === null ? null : text(body.nextCursor);
  if (body.nextCursor !== undefined && body.nextCursor !== null && nextCursor === null) throw invalid();
  return Object.freeze({ items: Object.freeze(items), nextCursor });
}

export async function loadAdminTags(input: {
  readonly spaceId: string;
  readonly limit: number;
  readonly cursor: string | null;
  readonly requester?: Fetcher;
  readonly signal?: AbortSignal;
}): Promise<AdminTagPage> {
  if (!input.spaceId || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) {
    throw new Error("TAG_REQUEST_INVALID");
  }
  const params = new URLSearchParams({ spaceId: input.spaceId, limit: String(input.limit) });
  if (input.cursor !== null && input.cursor.length > 0) params.set("cursor", input.cursor);
  return adminTagPage(await apiFetch<unknown>(`/api/admin/tags?${params}`, {
    requester: input.requester ?? fetch,
    signal: input.signal,
  }));
}

/** Creates one tag. The server rejects a slug that already exists in the space. */
export async function createAdminTag(input: {
  readonly spaceId: string;
  readonly slug: string;
  readonly name: string;
  readonly requester?: Fetcher;
}): Promise<AdminTag> {
  const slug = input.slug.trim();
  const name = input.name.trim();
  if (!input.spaceId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 80 || !name || [...name].length > 120) {
    throw new Error("TAG_REQUEST_INVALID");
  }
  const payload = record(await apiFetch<unknown>("/api/admin/tags", {
    requester: input.requester ?? fetch,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spaceId: input.spaceId, slug, name }),
  }));
  return adminTag(payload.tag);
}
