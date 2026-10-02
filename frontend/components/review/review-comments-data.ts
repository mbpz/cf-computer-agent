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
  if (!Array.isArray(payload?.comments)) throw new Error("REVIEW_COMMENTS_INVALID");
  return payload.comments.map(normalizeComment).filter((item): item is ReviewCommentItem => item !== null && item.submissionId === id);
}

export async function createReviewComment(submissionId: string, body: string, requester: Fetcher = fetch): Promise<ReviewCommentItem> {
  const id = assertId(submissionId);
  const payload = await apiFetch<{ comment?: unknown }>(`/api/admin/submissions/${encodeURIComponent(id)}/comments`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }),
  });
  const comment = normalizeComment(payload?.comment);
  if (!comment || comment.submissionId !== id || comment.body !== body.trim() || comment.supersedesCommentId) throw new Error("REVIEW_COMMENT_INVALID");
  return comment;
}

/** A separate endpoint prevents an older server from silently ignoring keys. */
export async function writeReviewCommentOperation(submissionId: string, operationId: string, body: string, requester: Fetcher = fetch): Promise<ReviewCommentItem> {
  const comment = await commentOperation(submissionId, operationId, body, true, requester);
  if (!comment) throw new Error("REVIEW_COMMENT_RECEIPT_INVALID");
  return comment;
}

export function readReviewCommentOperation(submissionId: string, operationId: string, body: string, requester: Fetcher = fetch): Promise<ReviewCommentItem | null> {
  return commentOperation(submissionId, operationId, body, false, requester);
}

async function commentOperation(submissionId: string, operationId: string, body: string, write: boolean, requester: Fetcher): Promise<ReviewCommentItem | null> {
  const id = assertId(submissionId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)) throw new Error("REVIEW_COMMENT_OPERATION_INVALID");
  const payload = await apiFetch<{ operation?: { version?: unknown; operationId?: unknown; submissionId?: unknown; comment?: unknown } }>(
    `/api/admin/submissions/${encodeURIComponent(id)}/comments/requests/${operationId}`, {
      requester: async (path, init) => {
        const response = await requester(path, init);
        if (response.ok && response.status !== 200) throw new Error("REVIEW_COMMENT_RECEIPT_INVALID");
        return response;
      },
      method: write ? "PUT" : "GET",
      cache: "no-store",
      ...(write ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) } : {}),
    });
  const receipt = payload?.operation;
  if (!receipt || receipt.version !== 1 || receipt.operationId !== operationId || receipt.submissionId !== id) throw new Error("REVIEW_COMMENT_RECEIPT_INVALID");
  if (!write && receipt.comment === null) return null;
  const comment = normalizeComment(receipt.comment);
  const raw = receipt.comment as Record<string, unknown> | undefined;
  if (!comment || comment.submissionId !== id || comment.body !== body.trim() || raw?.supersedesCommentId != null || !Number.isFinite(Date.parse(comment.createdAt))) throw new Error("REVIEW_COMMENT_RECEIPT_INVALID");
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
