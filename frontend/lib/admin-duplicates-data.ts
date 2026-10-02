import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export type DuplicateDecision = "associate" | "keep_separate" | "reject";
export interface AdminDuplicateCandidate { submissionId: string; canonicalSubmissionId: string; canonicalSourceId: string; canonicalSourceVersionId: string; submissionTitle: string; canonicalTitle: string; decision: "pending" | DuplicateDecision; }
export interface LoadAdminDuplicatesInput extends FrontendPageRequest { signal?: AbortSignal; }
export type AdminDuplicatePageResult = FrontendNumberedPage<AdminDuplicateCandidate>;
export async function loadAdminDuplicatePage({ page, pageSize, requester = fetch, signal }: LoadAdminDuplicatesInput & { requester?: Fetcher }): Promise<AdminDuplicatePageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const data = normalizeNumberedPage(await apiFetch(`/api/admin/duplicates?${params}`, { requester, signal }), normalizeCandidate);
  if (data.pagination.page !== page || data.pagination.pageSize !== pageSize || data.items.some((item) => item.decision !== "pending") || new Set(data.items.map((item) => item.submissionId)).size !== data.items.length) throw new Error("DUPLICATE_RESPONSE_INVALID");
  return data;
}
export async function loadAdminDuplicate(submissionId: string, requester: Fetcher = fetch): Promise<AdminDuplicateCandidate> {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(submissionId)) throw new Error("DUPLICATE_REQUEST_INVALID");
  const data = await apiFetch<{ candidate?: unknown }>(`/api/admin/duplicates/${encodeURIComponent(submissionId)}`, { requester });
  const candidate = normalizeCandidate(data?.candidate);
  if (candidate.submissionId !== submissionId) throw new Error("DUPLICATE_RESPONSE_INVALID");
  return candidate;
}
export async function decideAdminDuplicate(submissionId: string, decision: DuplicateDecision, requester: Fetcher = fetch): Promise<AdminDuplicateCandidate> {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(submissionId)) throw new Error("DUPLICATE_REQUEST_INVALID");
  const data = await apiFetch<{ candidate?: unknown }>(`/api/admin/duplicates/${encodeURIComponent(submissionId)}/decision`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
  const candidate = normalizeCandidate(data?.candidate);
  if (candidate.submissionId !== submissionId || candidate.decision !== decision) throw new Error("DUPLICATE_RESPONSE_INVALID");
  return candidate;
}
export function createAdminDuplicateRequestController(requester: Fetcher = fetch) { return createNumberedRequestController((input: Omit<LoadAdminDuplicatesInput, "signal">, signal) => loadAdminDuplicatePage({ ...input, requester, signal })); }
function normalizeCandidate(value: unknown): AdminDuplicateCandidate { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DUPLICATE_RESPONSE_INVALID"); const record = value as Record<string, unknown>; const strings = ["submissionId", "canonicalSubmissionId", "canonicalSourceId", "canonicalSourceVersionId", "submissionTitle", "canonicalTitle"]; if (strings.some((key) => typeof record[key] !== "string" || !(record[key] as string).trim())) throw new Error("DUPLICATE_RESPONSE_INVALID"); if (record.decision !== "pending" && record.decision !== "associate" && record.decision !== "keep_separate" && record.decision !== "reject") throw new Error("DUPLICATE_RESPONSE_INVALID"); return { submissionId: record.submissionId as string, canonicalSubmissionId: record.canonicalSubmissionId as string, canonicalSourceId: record.canonicalSourceId as string, canonicalSourceVersionId: record.canonicalSourceVersionId as string, submissionTitle: record.submissionTitle as string, canonicalTitle: record.canonicalTitle as string, decision: record.decision }; }
