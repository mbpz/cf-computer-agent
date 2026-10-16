import { apiFetch, type Fetcher } from "./api";

/**
 * The administrator source-reparse lifecycle: read a submission's source
 * version, run one reparse job over it, correct the candidate, then promote the
 * candidate to a submission or publish it as a revision. Every step reports the
 * job's own status; nothing here invents a progress percentage.
 */
export type ReparseJobStatus = "queued" | "processing" | "indexed" | "failed_retryable" | "failed_terminal";

export interface ReparseCandidateView {
  readonly content: string;
  readonly lineCount: number;
  readonly contentSha256: string;
}

export interface ReparseJobView {
  readonly id: string;
  readonly sourceId: string;
  readonly baseSourceVersionId: string;
  readonly submissionId: string;
  readonly status: ReparseJobStatus;
  readonly attempts: number;
  readonly lastErrorCode: string | null;
  readonly candidate: ReparseCandidateView | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReparsePromotion {
  readonly submissionId: string;
  readonly sourceId: string;
  readonly sourceVersionId: string;
}

export interface ReparsePublishResult {
  readonly promotion: ReparsePromotion;
  readonly revisionId: string;
  readonly knowledgeItemId: string;
  /** The revision's indexing state, or `null` when the server did not send one. */
  readonly searchStatus: string | null;
}

export interface SubmissionSourceVersion {
  readonly sourceVersionId: string;
  readonly title: string;
}

function invalid(): Error {
  return new Error("SOURCE_REPARSE_RESPONSE_INVALID");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isStatus(value: unknown): value is ReparseJobStatus {
  return value === "queued" || value === "processing" || value === "indexed" || value === "failed_retryable" || value === "failed_terminal";
}

export function reparseJobView(value: unknown): ReparseJobView {
  const body = record(value);
  const id = text(body.id);
  const sourceId = text(body.sourceId);
  const baseSourceVersionId = text(body.baseSourceVersionId);
  const submissionId = text(body.submissionId);
  const attempts = count(body.attempts);
  const createdAt = text(body.createdAt);
  const updatedAt = text(body.updatedAt);
  if (!id || !sourceId || !baseSourceVersionId || !submissionId || attempts === null || !isStatus(body.status) || !createdAt || !updatedAt) {
    throw invalid();
  }
  const lastErrorCode = body.lastErrorCode === null ? null : text(body.lastErrorCode);
  if (body.lastErrorCode !== null && lastErrorCode === null) throw invalid();
  let candidate: ReparseCandidateView | null = null;
  if (body.candidate !== undefined && body.candidate !== null) {
    const parsed = record(body.candidate);
    const content = typeof parsed.content === "string" ? parsed.content : null;
    const lineCount = count(parsed.lineCount);
    const contentSha256 = text(parsed.contentSha256);
    if (content === null || lineCount === null || !contentSha256) throw invalid();
    candidate = Object.freeze({ content, lineCount, contentSha256 });
  }
  return Object.freeze({
    id, sourceId, baseSourceVersionId, submissionId,
    status: body.status, attempts, lastErrorCode, candidate, createdAt, updatedAt,
  });
}

function promotionView(value: unknown): ReparsePromotion {
  const body = record(value);
  const submissionId = text(body.submissionId);
  const sourceId = text(body.sourceId);
  const sourceVersionId = text(body.sourceVersionId);
  if (!submissionId || !sourceId || !sourceVersionId) throw invalid();
  return Object.freeze({ submissionId, sourceId, sourceVersionId });
}

export async function loadSubmissionSourceVersion(submissionId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<SubmissionSourceVersion> {
  if (!/^[A-Za-z0-9_-]+$/u.test(submissionId)) throw new Error("SUBMISSION_ID_INVALID");
  const payload = await apiFetch<{ preview?: unknown }>(`/api/admin/submissions/${encodeURIComponent(submissionId)}`, { requester, signal });
  const preview = record(payload?.preview);
  const sourceVersion = record(preview.sourceVersion);
  const sourceVersionId = text(sourceVersion.id);
  if (!sourceVersionId) throw invalid();
  return Object.freeze({ sourceVersionId, title: typeof preview.title === "string" ? preview.title : "" });
}

export async function startSourceReparse(sourceVersionId: string, requester: Fetcher = fetch): Promise<ReparseJobView> {
  return reparseJobView(record(await apiFetch<unknown>(`/api/admin/source-versions/${encodeURIComponent(sourceVersionId)}/reparse`, {
    requester, method: "POST",
  })).job);
}

export async function loadReparseJob(jobId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ReparseJobView> {
  return reparseJobView(record(await apiFetch<unknown>(`/api/admin/reparse-jobs/${encodeURIComponent(jobId)}`, { requester, signal })).job);
}

export async function correctReparseCandidate(jobId: string, normalizedMarkdown: string, requester: Fetcher = fetch): Promise<ReparseJobView> {
  if (typeof normalizedMarkdown !== "string" || normalizedMarkdown.length === 0) throw new Error("SOURCE_REPARSE_INVALID");
  return reparseJobView(record(await apiFetch<unknown>(`/api/admin/reparse-jobs/${encodeURIComponent(jobId)}/candidate`, {
    requester, method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ normalizedMarkdown }),
  })).job);
}

/** Promotes the indexed candidate to a submission. The server converges a repeat. */
export async function promoteReparseJob(jobId: string, requester: Fetcher = fetch): Promise<ReparsePromotion> {
  const payload = record(await apiFetch<unknown>(`/api/admin/reparse-jobs/${encodeURIComponent(jobId)}/promote`, { requester, method: "POST" }));
  return promotionView(payload.promotion);
}

/**
 * Publishes the promoted candidate as a revision. The caller's operation number
 * is the receipt identity: a lost-response retry replays the recorded revision
 * instead of publishing the same candidate twice.
 */
export async function publishReparseJob(input: {
  readonly jobId: string;
  readonly operationId: string;
  readonly requester?: Fetcher;
}): Promise<ReparsePublishResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.operationId)) throw new Error("SOURCE_REPARSE_INVALID");
  const payload = record(await apiFetch<unknown>(`/api/admin/reparse-jobs/${encodeURIComponent(input.jobId)}/publish`, {
    requester: input.requester ?? fetch,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationId: input.operationId }),
  }));
  const revision = record(payload.revision);
  const revisionId = text(revision.id);
  const knowledgeItemId = text(revision.knowledgeItemId);
  if (!revisionId || !knowledgeItemId) throw invalid();
  return Object.freeze({
    promotion: promotionView(payload.promotion),
    revisionId,
    knowledgeItemId,
    searchStatus: text(revision.searchStatus),
  });
}
