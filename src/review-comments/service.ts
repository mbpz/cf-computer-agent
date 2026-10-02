import { AppError } from "../http";
import type { ReviewCommentsRepositoryPort } from "./repository";
import type { ReviewComment, ReviewCommentRecord, ReviewCommentViewer } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_BODY_BYTES = 16 * 1024;

export interface ReviewCommentsServiceOptions {
  id?: () => string;
  now?: () => Date;
}

export class ReviewCommentsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: ReviewCommentsRepositoryPort, options: ReviewCommentsServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async list(viewer: ReviewCommentViewer, submissionId: string): Promise<ReviewComment[]> {
    const id = assertId(submissionId);
    const ownerId = await this.repository.findSubmissionOwner(id);
    requireAccess(viewer, ownerId);
    return (await this.repository.list(id)).map((comment) => toPublic(comment, viewer));
  }

  async create(viewer: ReviewCommentViewer, submissionId: string, body: unknown): Promise<ReviewComment> {
    const id = assertId(submissionId);
    const ownerId = await this.repository.findSubmissionOwner(id);
    requireAccess(viewer, ownerId);
    const input = normalizeBody(body);
    const created = await this.repository.create({
      id: this.id(), submissionId: id, authorId: viewer.memberId, body: input, createdAt: this.now().toISOString(),
    });
    return toPublic(created, viewer);
  }

  async findOperation(viewer: ReviewCommentViewer, submissionId: string, operationId: string) {
    const id = await this.operationRecordId(viewer, submissionId, operationId);
    const comment = await this.repository.find(id);
    if (comment) assertOperationScope(comment, viewer, submissionId);
    return { version: 1 as const, operationId, submissionId, comment: comment ? toPublic(comment, viewer) : null };
  }

  async createOperation(viewer: ReviewCommentViewer, submissionId: string, operationId: string, body: unknown) {
    const id = await this.operationRecordId(viewer, submissionId, operationId);
    const input = normalizeBody(body);
    // Match SQLite's code-point length constraint before attempting a write.
    if ([...input].length > 4000) throw invalid();
    const comment = await this.repository.createOnce({ id, submissionId, authorId: viewer.memberId, body: input, createdAt: this.now().toISOString() });
    assertOperationScope(comment, viewer, submissionId);
    if (comment.body !== input) throw operationConflict();
    return { version: 1 as const, operationId, submissionId, comment: toPublic(comment, viewer) };
  }

  private async operationRecordId(viewer: ReviewCommentViewer, submissionId: string, operationId: string): Promise<string> {
    const ownerId = await this.repository.findSubmissionOwner(assertId(submissionId));
    requireAccess(viewer, ownerId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)) throw invalid();
    // Separate actors and targets even when they supply the same UUID. Existing
    // random legacy IDs cannot collide with this versioned namespace.
    const bytes = new TextEncoder().encode(JSON.stringify(["review-comment-v1", viewer.memberId, submissionId, operationId]));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return "rc1_" + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async edit(viewer: ReviewCommentViewer, commentId: string, body: unknown): Promise<ReviewComment> {
    const id = assertId(commentId);
    const current = await this.repository.find(id);
    if (!current) throw notFound();
    requireAccess(viewer, current.ownerId);
    if (current.authorId !== viewer.memberId) throw new AppError("REVIEW_COMMENT_EDIT_FORBIDDEN", "Only the comment author may edit it", 403);
    const created = await this.repository.create({
      id: this.id(), submissionId: current.submissionId, authorId: viewer.memberId,
      body: normalizeBody(body), createdAt: this.now().toISOString(), supersedesCommentId: current.id,
    });
    return toPublic(created, viewer);
  }
}

function toPublic(comment: ReviewCommentRecord, viewer: ReviewCommentViewer): ReviewComment {
  return {
    id: comment.id,
    submissionId: comment.submissionId,
    authorRole: comment.authorId === comment.ownerId ? "owner" : "admin",
    ...(viewer.role === "admin" ? { authorId: comment.authorId } : {}),
    body: comment.body,
    createdAt: comment.createdAt,
    ...(comment.supersedesCommentId ? { supersedesCommentId: comment.supersedesCommentId } : {}),
  };
}

function requireAccess(viewer: ReviewCommentViewer, ownerId: string | null): asserts ownerId is string {
  if (!ownerId || (viewer.role !== "admin" && viewer.memberId !== ownerId)) throw notFound();
}

function assertId(value: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw notFound();
  return value;
}

function normalizeBody(value: unknown): string {
  if (typeof value !== "string") throw invalid();
  const body = value.trim();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES || /[\u0000-\u001f\u007f-\u009f]/u.test(body)) throw invalid();
  return body;
}

function invalid(): AppError { return new AppError("REVIEW_COMMENT_INVALID", "Review comment is invalid", 400); }
function notFound(): AppError { return new AppError("REVIEW_COMMENT_NOT_FOUND", "Review comment is unavailable", 404); }

function assertOperationScope(comment: ReviewCommentRecord, viewer: ReviewCommentViewer, submissionId: string): void {
  if (comment.authorId !== viewer.memberId || comment.submissionId !== submissionId || comment.supersedesCommentId) throw operationConflict();
}
function operationConflict(): AppError { return new AppError("REVIEW_COMMENT_OPERATION_CONFLICT", "Comment operation does not match its original request", 409); }
