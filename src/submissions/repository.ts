import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import { SourcesRepository } from "../sources/repository";
import type { Source, SourceVersion } from "../sources/types";
import type { CreateSubmission, Submission, SubmissionCreateResult, SubmissionPage } from "./types";

export type SubmissionsRepositoryConflictKind = "target_invalid" | "idempotency_conflict";
export class SubmissionsRepositoryConflictError extends Error { constructor(readonly kind: SubmissionsRepositoryConflictKind) { super(`Submission conflict: ${kind}`); } }

export interface CreateSubmissionWithSourceVersion {
  submission: Submission;
  source: Source;
  sourceVersion: SourceVersion;
  audit: CreateAuditEvent;
}

export interface SubmissionsRepositoryPort {
  createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission>;
  createWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult>;
  listOwned(submitterId: string, request: PageRequest): Promise<SubmissionPage>;
  listPending(request: PageRequest): Promise<SubmissionPage>;
}

type SubmissionRow = { id: string; submitter_id: string; requested_space_id: string; requested_collection_id: string | null; kind: Submission["kind"]; status: Submission["status"]; title: string; content: string; idempotency_key: string | null; created_at: string; updated_at: string };
type CreationRow = SubmissionRow & {
  source_id: string;
  source_owner_id: string;
  source_space_id: string;
  source_collection_id: string | null;
  source_kind: Source["kind"];
  source_title: string;
  source_created_at: string;
  source_updated_at: string;
  source_version_id: string;
  source_version_ordinal: number;
  source_version_content: string;
  content_sha256: string;
  parser_version: SourceVersion["parserVersion"];
  source_version_created_at: string;
};
const timestampCursorBounds = { minSort: 0, maxSort: 8_640_000_000_000_000 } as const;

export class SubmissionsRepository implements SubmissionsRepositoryPort {
  private readonly sources: SourcesRepository;

  constructor(private readonly db: D1Database, private readonly audit: AuditRepository) {
    this.sources = new SourcesRepository(db);
  }

  async createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission> {
    assertSubmissionAuditBinding(submission, audit);
    const results = await this.db.batch([
      this.db.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) SELECT ?, ?, ?, ?, ?, 'review_pending', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active') AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))")
        .bind(submission.id, submission.submitterId, submission.requestedSpaceId, submission.requestedCollectionId, submission.kind, submission.title, submission.content, submission.createdAt, submission.updatedAt, submission.requestedSpaceId, submission.requestedCollectionId, submission.requestedCollectionId, submission.requestedSpaceId),
      this.audit.prepareWriteAudit(audit, submission.id),
    ]);
    if (!results[0]?.meta.changes) throw new SubmissionsRepositoryConflictError("target_invalid");
    if (results[1]?.meta.changes !== 1) throw new Error("Submission audit write did not persist");
    return { ...submission, idempotencyKey: submission.idempotencyKey ?? null, status: "review_pending" };
  }

  async createWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult> {
    const { submission, source, sourceVersion, audit } = input;
    assertSourceCreationBinding(input);
    const replay = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey!);
    if (replay) return exactReplayOrThrow(replay, input);

    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, 'review_pending', ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active')
           AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))
           AND NOT EXISTS (SELECT 1 FROM source_versions WHERE content_sha256 = ?)`,
      ).bind(
        submission.id, submission.submitterId, submission.requestedSpaceId, submission.requestedCollectionId,
        submission.kind, submission.title, submission.content, submission.idempotencyKey,
        submission.createdAt, submission.updatedAt, submission.requestedSpaceId,
        submission.requestedCollectionId, submission.requestedCollectionId, submission.requestedSpaceId,
        sourceVersion.contentSha256,
      ),
      this.sources.prepareCreate(source, submission.id),
      this.sources.prepareCreateVersion(sourceVersion),
      this.audit.prepareWriteAudit(audit, submission.id),
    ]);

    if (!results[0]?.meta.changes) {
      const concurrentReplay = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey!);
      if (concurrentReplay) return exactReplayOrThrow(concurrentReplay, input);
      if (!await this.isTargetValid(submission.requestedSpaceId, submission.requestedCollectionId)) {
        throw new SubmissionsRepositoryConflictError("target_invalid");
      }
      const duplicateCandidate = await this.sources.findDuplicateCandidate(sourceVersion.contentSha256);
      if (duplicateCandidate) return { submission: null, source: null, sourceVersion: null, duplicateCandidate };
      throw new Error("Submission creation did not persist");
    }
    if (results[1]?.meta.changes !== 1 || results[2]?.meta.changes !== 1 || results[3]?.meta.changes !== 1) {
      throw new Error("Submission source creation did not fully persist");
    }
    return { submission, source, sourceVersion, duplicateCandidate: null };
  }

  async listOwned(submitterId: string, request: PageRequest): Promise<SubmissionPage> {
    return this.listPage("WHERE submitter_id = ?", [submitterId], request);
  }

  async listPending(request: PageRequest): Promise<SubmissionPage> {
    return this.listPage("WHERE status = 'review_pending'", [], request);
  }

  private async listPage(where: string, values: unknown[], request: PageRequest): Promise<SubmissionPage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor, timestampCursorBounds);
    const rows = cursor
      ? await this.db.prepare(`${submissionSelect} ${where} AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...values, timestamp(cursor.sort), timestamp(cursor.sort), cursor.id, request.limit + 1).all<SubmissionRow>()
      : await this.db.prepare(`${submissionSelect} ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...values, request.limit + 1).all<SubmissionRow>();
    return page(rows.results.map(mapSubmissionRow), request.limit);
  }

  private async findCreationByIdempotencyKey(submitterId: string, idempotencyKey: string): Promise<SubmissionCreateResult | null> {
    const row = await this.db.prepare(
      `${creationSelect} WHERE s.submitter_id = ? AND s.idempotency_key = ? LIMIT 1`,
    ).bind(submitterId, idempotencyKey).first<CreationRow>();
    return row ? mapCreationRow(row) : null;
  }

  private async isTargetValid(spaceId: string, collectionId: string | null): Promise<boolean> {
    const row = await this.db.prepare(
      `SELECT 1 AS valid FROM spaces
       WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active'
         AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))`,
    ).bind(spaceId, collectionId, collectionId, spaceId).first<{ valid: number }>();
    return row?.valid === 1;
  }
}

const submissionSelect = "SELECT id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at FROM submissions";
const creationSelect = `SELECT
  s.id, s.submitter_id, s.requested_space_id, s.requested_collection_id, s.kind, s.status, s.title, s.content, s.idempotency_key, s.created_at, s.updated_at,
  src.id AS source_id, src.owner_id AS source_owner_id, src.space_id AS source_space_id, src.collection_id AS source_collection_id,
  src.kind AS source_kind, src.title AS source_title, src.created_at AS source_created_at, src.updated_at AS source_updated_at,
  sv.id AS source_version_id, sv.ordinal AS source_version_ordinal, sv.content AS source_version_content,
  sv.content_sha256, sv.parser_version, sv.created_at AS source_version_created_at
FROM submissions s
JOIN source_versions sv ON sv.submission_id = s.id
JOIN sources src ON src.id = sv.source_id`;
function timestamp(sort: number): string { return new Date(sort).toISOString(); }
function page(items: Submission[], limit: number): SubmissionPage { const result = items.slice(0, limit); return { items: result, ...(items.length > limit ? { nextCursor: encodePageCursor({ sort: Date.parse(result.at(-1)!.createdAt), id: result.at(-1)!.id }) } : {}) }; }
function mapSubmissionRow(row: SubmissionRow): Submission { return { id: row.id, submitterId: row.submitter_id, requestedSpaceId: row.requested_space_id, requestedCollectionId: row.requested_collection_id, kind: row.kind, status: row.status, title: row.title, content: row.content, idempotencyKey: row.idempotency_key, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapCreationRow(row: CreationRow): SubmissionCreateResult {
  const submission = mapSubmissionRow(row);
  const source: Source = {
    id: row.source_id, ownerId: row.source_owner_id, spaceId: row.source_space_id,
    collectionId: row.source_collection_id, kind: row.source_kind, title: row.source_title,
    createdAt: row.source_created_at, updatedAt: row.source_updated_at,
  };
  const sourceVersion: SourceVersion = {
    id: row.source_version_id, sourceId: row.source_id, submissionId: row.id,
    ordinal: row.source_version_ordinal, content: row.source_version_content,
    contentSha256: row.content_sha256, parserVersion: row.parser_version, createdAt: row.source_version_created_at,
  };
  return { submission, source, sourceVersion, duplicateCandidate: null };
}
function exactReplayOrThrow(existing: SubmissionCreateResult, input: CreateSubmissionWithSourceVersion): SubmissionCreateResult {
  if (!existing.submission || !existing.sourceVersion
    || existing.sourceVersion.contentSha256 !== input.sourceVersion.contentSha256
    || existing.submission.requestedSpaceId !== input.submission.requestedSpaceId
    || existing.submission.requestedCollectionId !== input.submission.requestedCollectionId) {
    throw new SubmissionsRepositoryConflictError("idempotency_conflict");
  }
  return existing;
}
function assertSourceCreationBinding(input: CreateSubmissionWithSourceVersion): void {
  const { submission, source, sourceVersion, audit } = input;
  assertSubmissionAuditBinding(submission, audit);
  if (!submission.idempotencyKey || source.ownerId !== submission.submitterId
    || source.spaceId !== submission.requestedSpaceId || source.collectionId !== submission.requestedCollectionId
    || source.kind !== submission.kind || source.title !== submission.title
    || sourceVersion.sourceId !== source.id || sourceVersion.submissionId !== submission.id
    || sourceVersion.ordinal !== 1 || sourceVersion.parserVersion !== "m1-v1") {
    throw new TypeError("Submission source binding is invalid");
  }
}
function assertSubmissionAuditBinding(submission: CreateSubmission, audit: CreateAuditEvent): void {
  if (audit.actorKind !== "member" || audit.actorId !== submission.submitterId || audit.action !== "submission.created" || audit.resourceType !== "submission" || audit.resourceId !== submission.id || audit.metadata.kind !== submission.kind || audit.metadata.requestedSpaceId !== submission.requestedSpaceId || audit.metadata.requestedCollectionId !== (submission.requestedCollectionId ?? undefined)) {
    throw new TypeError("Submission audit binding is invalid");
  }
}
