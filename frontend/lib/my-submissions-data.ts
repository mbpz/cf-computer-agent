import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";
import { validateSubmissionTarget, type SubmissionTarget } from "./submission-data";
import type { ResubmitSource } from "./submission-resubmit-data";

export type MySubmissionReviewDecision = "rejected" | "revision_requested";
export type MySubmissionReviewReasonCode = "not_relevant" | "duplicate" | "unsafe" | "needs_revision";
export interface MySubmissionReview {
  decision: MySubmissionReviewDecision;
  reasonCode: MySubmissionReviewReasonCode;
  note: string;
}
export interface MySubmissionItem {
  id: string;
  title?: string;
  status?: string;
  review?: MySubmissionReview;
  /** Set on the row a resubmission produced: the id of the submission it supersedes. */
  supersedes?: string;
  /**
   * The exact source of this row, read from the same response. Absent when any
   * field is unreadable, so the editor is only ever opened on real content.
   */
  source?: MySubmissionSource;
}
export interface MySubmissionSource {
  kind: "text" | "markdown" | "code";
  content: string;
  target: SubmissionTarget;
}
export type MySubmissionsPageResult = FrontendNumberedPage<MySubmissionItem>;
export interface LoadMySubmissionsPageInput extends FrontendPageRequest { status?: string; from?: string; to?: string; signal?: AbortSignal; }

/**
 * Stated submission-time filter. `from`/`to` are the values the location spells
 * (`YYYY-MM-DD` UTC day or a canonical ISO instant); a malformed value is
 * dropped, so the request never carries it. The interval is half-open — `from`
 * is inclusive, `to` exclusive, and a stated end day is covered entirely — so an
 * empty interval (`from >= to`) is reported as `invalid` and never requested.
 */
export interface SubmissionRangeQuery { from: string; to: string; invalid: boolean; }

export function normalizeSubmissionRange(from: string, to: string): SubmissionRangeQuery {
  const lower = from ? statedBound(from, "from") : null;
  const upper = to ? statedBound(to, "to") : null;
  return { from: lower?.value ?? "", to: upper?.value ?? "", invalid: lower !== null && upper !== null && lower.at >= upper.at };
}

export function parseSubmissionRange(search: string): SubmissionRangeQuery {
  const params = new URLSearchParams(search);
  const single = (key: string) => { const values = params.getAll(key); return values.length === 1 ? values[0]! : ""; };
  return normalizeSubmissionRange(single("from"), single("to"));
}

/** Applies a date filter at page one; the status filter and page size survive. */
export function writeSubmissionRange(search: string, next: { from: string; to: string }): string {
  const params = new URLSearchParams(search);
  params.delete("from"); params.delete("to"); params.delete("page");
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function loadMySubmissionsPage({ page, pageSize, status, from, to, requester = fetch, signal }: LoadMySubmissionsPageInput & { requester?: Fetcher }): Promise<MySubmissionsPageResult> {
  const range = normalizeSubmissionRange(from ?? "", to ?? "");
  // An empty interval can match nothing: fail before the request leaves the client.
  if (range.invalid) throw new Error("SUBMISSION_RANGE_INVALID");
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set("status", status);
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return normalizeNumberedPage(await apiFetch(`/api/submissions/mine?${params.toString()}`, { requester, signal }), normalizeSubmission);
}

const calendarDay = /^\d{4}-\d{2}-\d{2}$/u;
const dayMilliseconds = 86_400_000;

/** Mirrors the server rule in `src/submissions/created-range.ts`; `at` is the normalized instant. */
function statedBound(value: string, bound: "from" | "to"): { value: string; at: number } | null {
  if (calendarDay.test(value)) {
    const day = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value) return null;
    return { value, at: bound === "from" ? day : day + dayMilliseconds };
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) return null;
  return { value, at: instant };
}

function normalizeSubmission(value: unknown): MySubmissionItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SUBMISSION_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (typeof record.id !== "string" || !record.id || typeof record.title !== "string" || !isSubmissionStatus(status)) throw new Error("SUBMISSION_RESPONSE_INVALID");
  const review = normalizeReview(record.review);
  const supersedes = record.supersedesSubmissionId;
  const source = normalizeSource(record);
  return {
    id: record.id,
    title: record.title,
    status,
    ...(review ? { review } : {}),
    ...(typeof supersedes === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(supersedes) ? { supersedes } : {}),
    ...(source ? { source } : {}),
  };
}

/**
 * The submission's own source fields, kept only as one complete payload: a row
 * whose kind, content or target cannot be read offers no editing payload at all.
 */
function normalizeSource(record: Record<string, unknown>): MySubmissionSource | null {
  const kind = record.kind;
  const content = record.content;
  const spaceId = record.requestedSpaceId;
  const collectionId = record.requestedCollectionId ?? null;
  const visibility = record.requestedVisibility;
  if (kind !== "text" && kind !== "markdown" && kind !== "code") return null;
  if (typeof content !== "string" || new TextEncoder().encode(content).byteLength > 131072) return null;
  if (typeof spaceId !== "string") return null;
  if (collectionId !== null && typeof collectionId !== "string") return null;
  if (visibility !== "shared" && visibility !== "admin_only") return null;
  try {
    return {
      kind,
      content,
      target: validateSubmissionTarget({ requestedSpaceId: spaceId, requestedCollectionId: collectionId, requestedVisibility: visibility }),
    };
  } catch {
    return null;
  }
}

/**
 * The editing payload for a returned item, or `null` when this row is not
 * resubmittable: the server accepts a resubmission only while the prior row is
 * `revision_requested` (`src/submissions/repository.ts:findResubmittable`), and
 * an owner row without its source cannot be opened for editing.
 */
export function submissionResubmitSource(item: MySubmissionItem): ResubmitSource | null {
  if (item.status !== "revision_requested" || !item.source) return null;
  return {
    id: item.id,
    title: item.title ?? "",
    kind: item.source.kind,
    content: item.source.content,
    target: item.source.target,
    ...(item.review?.note ? { reviewNote: item.review.note } : {}),
  };
}

function isSubmissionStatus(value: unknown): value is "draft" | "review_pending" | "published" | "rejected" | "revision_requested" {
  return value === "draft" || value === "review_pending" || value === "published" || value === "rejected" || value === "revision_requested";
}

function normalizeReview(value: unknown): MySubmissionReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isReviewDecision(record.decision) || !isReviewReasonCode(record.reasonCode) || typeof record.note !== "string") return null;
  return { decision: record.decision, reasonCode: record.reasonCode, note: record.note };
}

function isReviewDecision(value: unknown): value is MySubmissionReviewDecision {
  return value === "rejected" || value === "revision_requested";
}

function isReviewReasonCode(value: unknown): value is MySubmissionReviewReasonCode {
  return value === "not_relevant" || value === "duplicate" || value === "unsafe" || value === "needs_revision";
}

export function createMySubmissionsRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadMySubmissionsPageInput, "signal">, signal) => loadMySubmissionsPage({ ...input, requester, signal }));
}
