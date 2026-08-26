import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export type DuplicateDecision = "associate" | "keep_separate" | "reject";
export interface AdminDuplicateCandidate {
  submissionId: string;
  canonicalSubmissionId: string;
  canonicalSourceId: string;
  canonicalSourceVersionId: string;
  submissionTitle: string;
  canonicalTitle: string;
  decision: "pending" | DuplicateDecision;
}
export interface AdminDuplicatePageResult { items: AdminDuplicateCandidate[]; nextCursor: string | null; }

export async function loadAdminDuplicatePage({ cursor, requester = fetch, signal }: { cursor?: string | null; requester?: Fetcher; signal?: AbortSignal }): Promise<AdminDuplicatePageResult> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/admin/duplicates?${params.toString()}`, { requester, signal });
  return {
    items: Array.isArray(data.items) ? data.items.map(normalizeCandidate).filter((item): item is AdminDuplicateCandidate => item !== null) : [],
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null,
  };
}

export async function decideAdminDuplicate(submissionId: string, decision: DuplicateDecision, requester: Fetcher = fetch): Promise<AdminDuplicateCandidate> {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(submissionId)) throw new Error("DUPLICATE_REQUEST_INVALID");
  const data = await apiFetch<{ candidate?: unknown }>(`/api/admin/duplicates/${encodeURIComponent(submissionId)}/decision`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }),
  });
  const candidate = normalizeCandidate(data.candidate);
  if (!candidate) throw new Error("DUPLICATE_RESPONSE_INVALID");
  return candidate;
}

export function createAdminDuplicateRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(cursor?: string | null) {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      const promise = loadAdminDuplicatePage({ cursor, requester, signal: active.signal }).then((page) => ({ generation, page }));
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}

function normalizeCandidate(value: unknown): AdminDuplicateCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const strings = ["submissionId", "canonicalSubmissionId", "canonicalSourceId", "canonicalSourceVersionId", "submissionTitle", "canonicalTitle"];
  if (strings.some((key) => typeof record[key] !== "string" || !(record[key] as string).trim())) return null;
  if (record.decision !== "pending" && record.decision !== "associate" && record.decision !== "keep_separate" && record.decision !== "reject") return null;
  return {
    submissionId: record.submissionId as string,
    canonicalSubmissionId: record.canonicalSubmissionId as string,
    canonicalSourceId: record.canonicalSourceId as string,
    canonicalSourceVersionId: record.canonicalSourceVersionId as string,
    submissionTitle: record.submissionTitle as string,
    canonicalTitle: record.canonicalTitle as string,
    decision: record.decision,
  };
}
