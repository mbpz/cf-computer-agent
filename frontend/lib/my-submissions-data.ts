import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export type MySubmissionReviewDecision = "rejected" | "revision_requested";
export type MySubmissionReviewReasonCode = "not_relevant" | "duplicate" | "unsafe" | "needs_revision";
export interface MySubmissionReview {
  decision: MySubmissionReviewDecision;
  reasonCode: MySubmissionReviewReasonCode;
  note: string;
}
export interface MySubmissionItem { id: string; title?: string; status?: string; review?: MySubmissionReview; }
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
  return {
    id: record.id,
    title: record.title,
    status,
    ...(review ? { review } : {}),
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
