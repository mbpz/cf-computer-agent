import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import type { CreateSubmission, Submission, SubmissionPage } from "./types";

export type SubmissionsRepositoryConflictKind = "target_invalid";
export class SubmissionsRepositoryConflictError extends Error { constructor(readonly kind: SubmissionsRepositoryConflictKind) { super(`Submission conflict: ${kind}`); } }

export interface SubmissionsRepositoryPort {
  createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission>;
  listOwned(submitterId: string, request: PageRequest): Promise<SubmissionPage>;
  listPending(request: PageRequest): Promise<SubmissionPage>;
}

type SubmissionRow = { id: string; submitter_id: string; requested_space_id: string; requested_collection_id: string | null; kind: Submission["kind"]; status: Submission["status"]; title: string; content: string; created_at: string; updated_at: string };

export class SubmissionsRepository implements SubmissionsRepositoryPort {
  constructor(private readonly db: D1Database, private readonly audit: AuditRepository) {}

  async createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission> {
    assertSubmissionAuditBinding(submission, audit);
    const results = await this.db.batch([
      this.db.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) SELECT ?, ?, ?, ?, ?, 'review_pending', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active') AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))")
        .bind(submission.id, submission.submitterId, submission.requestedSpaceId, submission.requestedCollectionId, submission.kind, submission.title, submission.content, submission.createdAt, submission.updatedAt, submission.requestedSpaceId, submission.requestedCollectionId, submission.requestedCollectionId, submission.requestedSpaceId),
      this.audit.prepareWriteAudit(audit, submission.id),
    ]);
    if (!results[0]?.meta.changes) throw new SubmissionsRepositoryConflictError("target_invalid");
    if (results[1]?.meta.changes !== 1) throw new Error("Submission audit write did not persist");
    return { ...submission, status: "review_pending" };
  }

  async listOwned(submitterId: string, request: PageRequest): Promise<SubmissionPage> {
    return this.listPage("WHERE submitter_id = ?", [submitterId], request);
  }

  async listPending(request: PageRequest): Promise<SubmissionPage> {
    return this.listPage("WHERE status = 'review_pending'", [], request);
  }

  private async listPage(where: string, values: unknown[], request: PageRequest): Promise<SubmissionPage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor);
    const rows = cursor
      ? await this.db.prepare(`${submissionSelect} ${where} AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...values, timestamp(cursor.sort), timestamp(cursor.sort), cursor.id, request.limit + 1).all<SubmissionRow>()
      : await this.db.prepare(`${submissionSelect} ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...values, request.limit + 1).all<SubmissionRow>();
    return page(rows.results.map(mapSubmissionRow), request.limit);
  }
}

const submissionSelect = "SELECT id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at FROM submissions";
function timestamp(sort: number): string { return new Date(sort).toISOString(); }
function page(items: Submission[], limit: number): SubmissionPage { const result = items.slice(0, limit); return { items: result, ...(items.length > limit ? { nextCursor: encodePageCursor({ sort: Date.parse(result.at(-1)!.createdAt), id: result.at(-1)!.id }) } : {}) }; }
function mapSubmissionRow(row: SubmissionRow): Submission { return { id: row.id, submitterId: row.submitter_id, requestedSpaceId: row.requested_space_id, requestedCollectionId: row.requested_collection_id, kind: row.kind, status: row.status, title: row.title, content: row.content, createdAt: row.created_at, updatedAt: row.updated_at }; }
function assertSubmissionAuditBinding(submission: CreateSubmission, audit: CreateAuditEvent): void {
  if (audit.actorKind !== "member" || audit.actorId !== submission.submitterId || audit.action !== "submission.created" || audit.resourceType !== "submission" || audit.resourceId !== submission.id || audit.metadata.kind !== submission.kind || audit.metadata.requestedSpaceId !== submission.requestedSpaceId || audit.metadata.requestedCollectionId !== (submission.requestedCollectionId ?? undefined)) {
    throw new TypeError("Submission audit binding is invalid");
  }
}
