import { apiFetch, type Fetcher } from "./api";

/**
 * The member-readable comment thread of one of the member's own submissions
 * (`GET /api/submissions/:id/comments`, `src/routes/member.ts:310`).
 *
 * The server projects the same rows for both roles but only tells a member
 * whether a comment came from the submission owner or from an administrator
 * (`src/review-comments/service.ts:toPublic`), so that is all this module
 * reads: no reviewer identity, no admin-only field.
 */

export interface MemberSubmissionComment {
  id: string;
  authorRole: "owner" | "admin";
  body: string;
  createdAt: string;
}

const MAX_BODY_BYTES = 16384;

export async function loadSubmissionComments(
  submissionId: string,
  options: { requester?: Fetcher; signal?: AbortSignal } = {},
): Promise<MemberSubmissionComment[]> {
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(submissionId)) throw new Error("SUBMISSION_ID_INVALID");
  const { requester = fetch, signal } = options;
  const payload = await apiFetch<unknown>(`/api/submissions/${encodeURIComponent(submissionId)}/comments`, { requester, signal });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("SUBMISSION_COMMENTS_INVALID");
  const comments = (payload as Record<string, unknown>).comments;
  if (!Array.isArray(comments)) throw new Error("SUBMISSION_COMMENTS_INVALID");
  const normalized: MemberSubmissionComment[] = [];
  const replaced = new Set<string>();
  for (const value of comments) {
    const comment = normalizeComment(value, submissionId);
    if (!comment) throw new Error("SUBMISSION_COMMENTS_INVALID");
    if (comment.superseded) replaced.add(comment.superseded);
    normalized.push(comment.comment);
  }
  // An edited comment is a new row that supersedes the old one; only the
  // surviving text is part of the thread the member reads.
  return normalized.filter((comment) => !replaced.has(comment.id));
}

function normalizeComment(
  value: unknown,
  submissionId: string,
): { comment: MemberSubmissionComment; superseded?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(row.id) || row.submissionId !== submissionId) return null;
  if (row.authorRole !== "owner" && row.authorRole !== "admin") return null;
  if (typeof row.body !== "string" || !row.body.trim() || new TextEncoder().encode(row.body).byteLength > MAX_BODY_BYTES) return null;
  if (typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) return null;
  const supersedes = row.supersedesCommentId;
  if (supersedes !== undefined && (typeof supersedes !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(supersedes))) return null;
  return {
    comment: { id: row.id, authorRole: row.authorRole, body: row.body, createdAt: row.createdAt },
    ...(typeof supersedes === "string" ? { superseded: supersedes } : {}),
  };
}
