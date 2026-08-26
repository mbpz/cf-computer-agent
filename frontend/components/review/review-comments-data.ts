import { apiFetch, type Fetcher } from "../../lib/api";

export interface ReviewCommentItem {
  id: string;
  submissionId: string;
  authorRole: "admin" | "owner";
  authorId?: string;
  body: string;
  createdAt: string;
  supersedesCommentId?: string;
}

export async function loadReviewComments(submissionId: string, requester: Fetcher = fetch): Promise<ReviewCommentItem[]> {
  const id = assertId(submissionId);
  const payload = await apiFetch<{ comments?: unknown }>(`/api/admin/submissions/${encodeURIComponent(id)}/comments`, { requester });
  return Array.isArray(payload.comments) ? payload.comments.map(normalizeComment).filter((item): item is ReviewCommentItem => item !== null) : [];
}

export async function createReviewComment(submissionId: string, body: string, requester: Fetcher = fetch): Promise<ReviewCommentItem> {
  const id = assertId(submissionId);
  const payload = await apiFetch<{ comment?: unknown }>(`/api/admin/submissions/${encodeURIComponent(id)}/comments`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }),
  });
  const comment = normalizeComment(payload.comment);
  if (!comment) throw new Error("REVIEW_COMMENT_INVALID");
  return comment;
}

function normalizeComment(value: unknown): ReviewCommentItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!validId(record.id) || !validId(record.submissionId) || (record.authorRole !== "admin" && record.authorRole !== "owner") || typeof record.body !== "string" || typeof record.createdAt !== "string") return null;
  return {
    id: record.id,
    submissionId: record.submissionId,
    authorRole: record.authorRole,
    ...(typeof record.authorId === "string" && validId(record.authorId) ? { authorId: record.authorId } : {}),
    body: record.body,
    createdAt: record.createdAt,
    ...(typeof record.supersedesCommentId === "string" && validId(record.supersedesCommentId) ? { supersedesCommentId: record.supersedesCommentId } : {}),
  };
}

function validId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value); }
function assertId(value: string): string { if (!validId(value)) throw new Error("REVIEW_COMMENT_INVALID"); return value; }
