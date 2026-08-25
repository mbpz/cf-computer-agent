import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface MySubmissionItem { id: string; title?: string; status?: string; }
export interface MySubmissionsPageResult { items: MySubmissionItem[]; nextCursor: string | null; }

export async function loadMySubmissionsPage({ cursor, requester = fetch, signal }: { cursor?: string | null; requester?: Fetcher; signal?: AbortSignal }): Promise<MySubmissionsPageResult> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/submissions/mine?${params.toString()}`, { requester, signal });
  return {
    items: Array.isArray(data.items) ? data.items.map(normalizeSubmission).filter((item): item is MySubmissionItem => item !== null) : [],
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor.length > 0 ? data.nextCursor : null,
  };
}

function normalizeSubmission(value: unknown): MySubmissionItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  return { id: record.id, title: typeof record.title === "string" ? record.title : undefined, status: typeof record.status === "string" ? record.status : undefined };
}

export function createMySubmissionsRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(cursor?: string | null) {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      const promise = loadMySubmissionsPage({ cursor, requester, signal: active.signal }).then((page) => ({ generation, page }));
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}
