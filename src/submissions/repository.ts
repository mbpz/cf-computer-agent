import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { AppError } from "../http";
import { decodeOpaqueCursor, decodePageCursor, encodeOpaqueCursor, type PageRequest } from "../pagination";
import { SourcesRepository } from "../sources/repository";
import type { Source, SourceVersion } from "../sources/types";
import type {
  CreateSubmission,
  Submission,
  SubmissionCreateResult,
  SubmissionPage,
  SubmissionPageRepositoryRequest,
  SubmissionReview,
} from "./types";

export type SubmissionsRepositoryConflictKind = "target_invalid" | "idempotency_conflict" | "resubmission_conflict";
export class SubmissionsRepositoryConflictError extends Error { constructor(readonly kind: SubmissionsRepositoryConflictKind) { super(`Submission conflict: ${kind}`); } }

export interface PersistedSubmission extends Submission { idempotencyKey: string; }

export interface CreateSubmissionWithSourceVersion {
  submission: PersistedSubmission;
  source: Source;
  sourceVersion: SourceVersion;
  audit: CreateAuditEvent;
}

export interface SubmissionsRepositoryPort {
  createDraft(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission>;
  findOwnedDraft(submitterId: string, submissionId: string): Promise<Submission | null>;
  updateDraft(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission | null>;
  createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission>;
  createWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult>;
  findResubmittable(memberId: string, priorSubmissionId: string): Promise<Submission | null>;
  createResubmissionWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult>;
  listOwned(submitterId: string, request: SubmissionPageRepositoryRequest): Promise<SubmissionPage>;
  listPending(request: PageRequest): Promise<SubmissionPage>;
}

type SubmissionRow = {
  id: string;
  submitter_id: string;
  requested_space_id: string;
  requested_collection_id: string | null;
  requested_visibility: Submission["requestedVisibility"];
  supersedes_submission_id: string | null;
  kind: Submission["kind"];
  status: Submission["status"];
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  review_decision: SubmissionReview["decision"] | null;
  review_reason_code: SubmissionReview["reasonCode"] | null;
  review_note: string | null;
  review_created_at: string | null;
};
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
  parser_schema_version: NonNullable<SourceVersion["parserSchemaVersion"]>;
  source_identity_sha256: string | null;
  code_language: string | null;
  file_label: string | null;
  line_baseline: number;
  source_version_created_at: string;
};
const timestampCursorBounds = { minSort: 0, maxSort: 8_640_000_000_000_000 } as const;

export class SubmissionsRepository implements SubmissionsRepositoryPort {
  private readonly sources: SourcesRepository;

  constructor(private readonly db: D1Database, private readonly audit: AuditRepository) {
    this.sources = new SourcesRepository(db);
  }

  async createDraft(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission> {
    const results = await this.db.batch([
      this.db.prepare(
      `INSERT INTO submissions (
        id, submitter_id, requested_space_id, requested_collection_id, requested_visibility,
        kind, status, title, content, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active'
      )
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'
      ))`,
      ).bind(
      submission.id, submission.submitterId, submission.requestedSpaceId, submission.requestedCollectionId,
      submission.requestedVisibility, submission.kind, submission.title, submission.content,
      submission.createdAt, submission.updatedAt, submission.requestedSpaceId,
      submission.requestedCollectionId, submission.requestedCollectionId, submission.requestedSpaceId,
      ),
      this.audit.prepareDraftAudit(audit, submission.id),
    ]);
    if (results[0]?.meta.changes !== 1) throw new SubmissionsRepositoryConflictError("target_invalid");
    if (results[1]?.meta.changes !== 1) throw new Error("Draft audit write did not persist");
    return { ...submission, status: "draft" };
  }

  async findOwnedDraft(submitterId: string, submissionId: string): Promise<Submission | null> {
    const row = await this.db.prepare(
      `${submissionSelect} WHERE s.id = ? AND s.submitter_id = ? AND s.status = 'draft' LIMIT 1`,
    ).bind(submissionId, submitterId).first<SubmissionRow>();
    return row ? mapSubmissionRow(row) : null;
  }

  async updateDraft(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission | null> {
    const results = await this.db.batch([
      this.db.prepare(
      `UPDATE submissions
       SET requested_space_id = ?, requested_collection_id = ?, requested_visibility = ?,
           kind = ?, title = ?, content = ?, updated_at = ?
       WHERE id = ? AND submitter_id = ? AND status = 'draft'`,
      ).bind(
      submission.requestedSpaceId, submission.requestedCollectionId, submission.requestedVisibility,
      submission.kind, submission.title, submission.content, submission.updatedAt,
      submission.id, submission.submitterId,
      ),
      this.audit.prepareDraftAudit(audit, submission.id),
    ]);
    if (results[0]?.meta.changes !== 1) return null;
    if (results[1]?.meta.changes !== 1) throw new Error("Draft audit write did not persist");
    return { ...submission, status: "draft" };
  }

  async createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission> {
    assertSubmissionAuditBinding(submission, audit);
    const results = await this.db.batch([
      this.db.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, requested_visibility, kind, status, title, content, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, 'review_pending', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active') AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))")
        .bind(submission.id, submission.submitterId, submission.requestedSpaceId, submission.requestedCollectionId, submission.requestedVisibility, submission.kind, submission.title, submission.content, submission.createdAt, submission.updatedAt, submission.requestedSpaceId, submission.requestedCollectionId, submission.requestedCollectionId, submission.requestedSpaceId),
      this.audit.prepareWriteAudit(audit, submission.id),
    ]);
    if (!results[0]?.meta.changes) throw new SubmissionsRepositoryConflictError("target_invalid");
    if (results[1]?.meta.changes !== 1) throw new Error("Submission audit write did not persist");
    return { ...submission, status: "review_pending" };
  }

  async createWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult> {
    const { submission, source, sourceVersion, audit } = input;
    assertSourceCreationBinding(input);
    const rejectedReplay = await this.findRejectedByIdempotencyKey(submission.submitterId, submission.idempotencyKey!);
    if (rejectedReplay) {
      const candidate = await this.sources.findDuplicateCandidate(
        sourceVersion.contentSha256, submission.submitterId, submission.requestedSpaceId,
      );
      if (candidate && sameDuplicateSubmission(rejectedReplay, input)) {
        return { submission: rejectedReplay, source: null, sourceVersion: null, duplicateCandidate: candidate };
      }
      throw new SubmissionsRepositoryConflictError("idempotency_conflict");
    }
    const replay = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey!);
    if (replay) return exactReplayOrThrow(replay, input);

    let results: D1Result[];
    try {
      results = await this.db.batch([
        this.db.prepare(
          `INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, requested_visibility, kind, status, title, content, idempotency_key, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, 'review_pending', ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active')
             AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))
             AND NOT EXISTS (
               SELECT 1 FROM source_versions existing_version
               JOIN sources existing_source ON existing_source.id = existing_version.source_id
               WHERE existing_version.content_sha256 = ? AND existing_source.owner_id = ? AND existing_source.space_id = ?
             )`,
        ).bind(
          submission.id, submission.submitterId, submission.requestedSpaceId, submission.requestedCollectionId,
          submission.requestedVisibility, submission.kind, submission.title, submission.content, submission.idempotencyKey,
          submission.createdAt, submission.updatedAt, submission.requestedSpaceId,
          submission.requestedCollectionId, submission.requestedCollectionId, submission.requestedSpaceId,
          sourceVersion.contentSha256, submission.submitterId, submission.requestedSpaceId,
        ),
        this.sources.prepareCreate(source, submission.id),
        this.sources.prepareCreateVersion(sourceVersion),
        this.audit.prepareWriteAudit(audit, submission.id),
      ]);
    } catch (error) {
      const concurrentReplay = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey);
      if (concurrentReplay) return exactReplayOrThrow(concurrentReplay, input);
      throw error;
    }

    if (!results[0]?.meta.changes) {
      const concurrentReplay = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey);
      if (concurrentReplay) return exactReplayOrThrow(concurrentReplay, input);
      if (!await this.isTargetValid(submission.requestedSpaceId, submission.requestedCollectionId)) {
        throw new SubmissionsRepositoryConflictError("target_invalid");
      }
      const duplicateCandidate = await this.sources.findDuplicateCandidate(
        sourceVersion.contentSha256, submission.submitterId, submission.requestedSpaceId,
      );
      if (duplicateCandidate) {
        const rejected: PersistedSubmission = { ...submission, status: "rejected" };
        const duplicateAudit: CreateAuditEvent = {
          id: this.auditId(), actorKind: "member", actorId: submission.submitterId,
          action: "submission.rejected", resourceType: "submission", resourceId: submission.id,
          metadata: { reasonCode: "duplicate" }, createdAt: submission.updatedAt,
        };
        assertSubmissionAuditBinding(rejected, duplicateAudit);
        let duplicateWrites: D1Result[];
        try {
          duplicateWrites = await this.db.batch([
            this.db.prepare(
              `INSERT INTO submissions (
                id, submitter_id, requested_space_id, requested_collection_id, requested_visibility,
                kind, status, title, content, idempotency_key, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?)`,
            ).bind(
              rejected.id, rejected.submitterId, rejected.requestedSpaceId, rejected.requestedCollectionId,
              rejected.requestedVisibility, rejected.kind, rejected.title, rejected.content,
              rejected.idempotencyKey, rejected.createdAt, rejected.updatedAt,
            ),
            this.audit.prepareWriteAudit(duplicateAudit),
          ]);
        } catch (error) {
          const winner = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey!);
          if (winner) return exactReplayOrThrow(winner, input);
          const rejectedReplay = await this.findRejectedByIdempotencyKey(submission.submitterId, submission.idempotencyKey!);
          if (rejectedReplay && sameDuplicateSubmission(rejectedReplay, input)) {
            return { submission: rejectedReplay, source: null, sourceVersion: null, duplicateCandidate };
          }
          throw error;
        }
        if (duplicateWrites[0]?.meta.changes !== 1 || duplicateWrites[1]?.meta.changes !== 1) {
          throw new Error("Duplicate submission audit did not persist");
        }
        return { submission: publicSubmission(rejected), source: null, sourceVersion: null, duplicateCandidate };
      }
      throw new Error("Submission creation did not persist");
    }
    if (results[1]?.meta.changes !== 1 || results[2]?.meta.changes !== 1 || results[3]?.meta.changes !== 1) {
      throw new Error("Submission source creation did not fully persist");
    }
    return { submission: publicSubmission(submission), source, sourceVersion, duplicateCandidate: null };
  }

  async findResubmittable(memberId: string, priorSubmissionId: string): Promise<Submission | null> {
    const row = await this.db.prepare(
      `${submissionSelect} WHERE s.id = ? AND s.submitter_id = ? AND s.status = 'revision_requested' LIMIT 1`,
    ).bind(priorSubmissionId, memberId).first<SubmissionRow>();
    return row ? mapSubmissionRow(row) : null;
  }

  async createResubmissionWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult> {
    const { submission, source, sourceVersion, audit } = input;
    if (!submission.supersedesSubmissionId) throw new TypeError("Resubmission binding is invalid");
    assertSourceCreationBinding(input);
    const replay = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey);
    if (replay) return exactReplayOrThrow(replay, input);
    let results: D1Result[];
    try {
      results = await this.db.batch([
        this.db.prepare(
          `INSERT INTO submissions (
             id, submitter_id, requested_space_id, requested_collection_id, requested_visibility,
             kind, status, title, content, idempotency_key, created_at, updated_at, supersedes_submission_id
           )
           SELECT ?, ?, ?, ?, ?, ?, 'review_pending', ?, ?, ?, ?, ?, prior.id
           FROM submissions prior
           WHERE prior.id = ? AND prior.submitter_id = ? AND prior.status = 'revision_requested'
             AND (prior.idempotency_key IS NULL OR prior.idempotency_key != ?)
             AND (prior.requested_visibility = 'shared' OR ? = 'admin_only')
             AND EXISTS (
               SELECT 1 FROM spaces target
               WHERE target.id = ? AND target.kind != 'legacy' AND target.read_only = 0 AND target.status = 'active'
             )
             AND (? IS NULL OR EXISTS (
               SELECT 1 FROM collections target_collection
               WHERE target_collection.id = ? AND target_collection.space_id = ? AND target_collection.status = 'active'
             ))`,
        ).bind(
          submission.id, submission.submitterId, submission.requestedSpaceId, submission.requestedCollectionId,
          submission.requestedVisibility, submission.kind, submission.title, submission.content,
          submission.idempotencyKey, submission.createdAt, submission.updatedAt,
          submission.supersedesSubmissionId, submission.submitterId, submission.idempotencyKey,
          submission.requestedVisibility,
          submission.requestedSpaceId, submission.requestedCollectionId,
          submission.requestedCollectionId, submission.requestedSpaceId,
        ),
        this.sources.prepareCreate(source, submission.id),
        this.sources.prepareCreateVersion(sourceVersion),
        this.audit.prepareResubmissionAudit(
          audit,
          submission.id,
          submission.supersedesSubmissionId,
        ),
        this.changeGuard(),
      ]);
    } catch (error) {
      const concurrent = await this.findCreationByIdempotencyKey(submission.submitterId, submission.idempotencyKey);
      if (concurrent) return exactReplayOrThrow(concurrent, input);
      throw error;
    }
    if (!results[0]?.meta.changes) {
      if (!await this.isTargetValid(submission.requestedSpaceId, submission.requestedCollectionId)) {
        throw new SubmissionsRepositoryConflictError("target_invalid");
      }
      throw new SubmissionsRepositoryConflictError("resubmission_conflict");
    }
    if (results[1]?.meta.changes !== 1 || results[2]?.meta.changes !== 1 || results[3]?.meta.changes !== 1) {
      throw new Error("Resubmission source creation did not fully persist");
    }
    return { submission: publicSubmission(submission), source, sourceVersion, duplicateCandidate: null };
  }

  async listOwned(submitterId: string, request: SubmissionPageRepositoryRequest): Promise<SubmissionPage> {
    assertCursorKey(request.cursorKey);
    const cursor = request.cursor === undefined
      ? undefined
      : decodeOwnedSubmissionCursor(request.cursor, request.cursorKey);
    const statusSql = request.status === undefined ? "" : " AND s.status = ?";
    const cursorSql = cursor === undefined
      ? ""
      : " AND (s.created_at < ? OR (s.created_at = ? AND s.id < ?))";
    const cursorBindings = cursor === undefined
      ? []
      : [timestamp(cursor.sort), timestamp(cursor.sort), cursor.id];
    const rows = await this.db.prepare(
      `${submissionSelect} WHERE s.submitter_id = ?${statusSql}${cursorSql}
       ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    ).bind(
      submitterId,
      ...(request.status === undefined ? [] : [request.status]),
      ...cursorBindings,
      request.limit + 1,
    ).all<SubmissionRow>();
    return ownedPage(rows.results.map(mapSubmissionRow), request.limit, request.cursorKey);
  }

  async listPending(request: PageRequest): Promise<SubmissionPage> {
    return this.listPage("WHERE s.status = 'review_pending'", [], request);
  }

  private async listPage(where: string, values: unknown[], request: PageRequest): Promise<SubmissionPage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor, timestampCursorBounds);
    const rows = cursor
      ? await this.db.prepare(`${submissionSelect} ${where} AND (s.created_at < ? OR (s.created_at = ? AND s.id < ?)) ORDER BY s.created_at DESC, s.id DESC LIMIT ?`).bind(...values, timestamp(cursor.sort), timestamp(cursor.sort), cursor.id, request.limit + 1).all<SubmissionRow>()
      : await this.db.prepare(`${submissionSelect} ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT ?`).bind(...values, request.limit + 1).all<SubmissionRow>();
    return page(rows.results.map(mapSubmissionRow), request.limit);
  }

  private async findCreationByIdempotencyKey(submitterId: string, idempotencyKey: string): Promise<SubmissionCreateResult | null> {
    const row = await this.db.prepare(
      `${creationSelect} WHERE s.submitter_id = ? AND s.idempotency_key = ? LIMIT 1`,
    ).bind(submitterId, idempotencyKey).first<CreationRow>();
    return row ? mapCreationRow(row) : null;
  }

  private async findRejectedByIdempotencyKey(submitterId: string, idempotencyKey: string): Promise<Submission | null> {
    const row = await this.db.prepare(
      `${submissionSelect} WHERE s.submitter_id = ? AND s.idempotency_key = ? AND s.status = 'rejected' LIMIT 1`,
    ).bind(submitterId, idempotencyKey).first<SubmissionRow>();
    return row ? mapSubmissionRow(row) : null;
  }

  private auditId(): string { return crypto.randomUUID(); }

  private async isTargetValid(spaceId: string, collectionId: string | null): Promise<boolean> {
    const row = await this.db.prepare(
      `SELECT 1 AS valid FROM spaces
       WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND status = 'active'
         AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))`,
    ).bind(spaceId, collectionId, collectionId, spaceId).first<{ valid: number }>();
    return row?.valid === 1;
  }

  private changeGuard(): D1PreparedStatement {
    return this.db.prepare(
      "SELECT CASE WHEN changes() = 1 THEN 1 ELSE json_extract('submission-change-guard', '$') END AS ok",
    );
  }
}

const submissionSelect = `SELECT
  s.id, s.submitter_id, s.requested_space_id, s.requested_collection_id, s.requested_visibility,
  s.supersedes_submission_id, s.kind, s.status, s.title, s.content, s.created_at, s.updated_at,
  r.decision AS review_decision, r.reason_code AS review_reason_code,
  r.reason AS review_note, r.created_at AS review_created_at
FROM submissions s
LEFT JOIN reviews r ON r.submission_id = s.id
  AND r.decision IN ('rejected', 'revision_requested')`;
const creationSelect = `SELECT
  s.id, s.submitter_id, s.requested_space_id, s.requested_collection_id, s.requested_visibility,
  s.supersedes_submission_id, s.kind, s.status, s.title, s.content, s.created_at, s.updated_at,
  src.id AS source_id, src.owner_id AS source_owner_id, src.space_id AS source_space_id, src.collection_id AS source_collection_id,
  src.kind AS source_kind, src.title AS source_title, src.created_at AS source_created_at, src.updated_at AS source_updated_at,
  sv.id AS source_version_id, sv.ordinal AS source_version_ordinal, sv.content AS source_version_content,
  sv.content_sha256, sv.parser_version, sv.parser_schema_version, sv.source_identity_sha256,
  sv.code_language, sv.file_label, sv.line_baseline, sv.created_at AS source_version_created_at
FROM submissions s
JOIN source_versions sv ON sv.submission_id = s.id
JOIN sources src ON src.id = sv.source_id`;
function timestamp(sort: number): string { return new Date(sort).toISOString(); }
function page(items: Submission[], limit: number): SubmissionPage {
  const result = items.slice(0, limit);
  return {
    items: result,
    ...(items.length > limit ? {
      nextCursor: encodeOpaqueCursor({
        v: 1, sort: Date.parse(result.at(-1)!.createdAt), id: result.at(-1)!.id,
      }),
    } : {}),
  };
}
function ownedPage(items: Submission[], limit: number, cursorKey: string): SubmissionPage {
  const result = items.slice(0, limit);
  const last = result.at(-1);
  return {
    items: result,
    ...(items.length > limit && last ? {
      nextCursor: encodeOpaqueCursor({
        v: 2, sort: Date.parse(last.createdAt), id: last.id, key: cursorKey,
      }),
    } : {}),
  };
}
function decodeOwnedSubmissionCursor(cursor: string, cursorKey: string): { sort: number; id: string } {
  let record: Record<string, unknown>;
  try {
    const decoded = decodeOpaqueCursor(cursor);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 4 || record.v !== 2
      || typeof record.sort !== "number" || !Number.isSafeInteger(record.sort)
      || record.sort < timestampCursorBounds.minSort || record.sort > timestampCursorBounds.maxSort
      || typeof record.id !== "string" || record.id.length === 0
      || typeof record.key !== "string" || !/^[a-f0-9]{64}$/u.test(record.key)) throw new Error();
  } catch {
    throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  }
  if (record.key !== cursorKey) {
    throw new AppError("PAGE_INVALID", "Page cursor does not match the requested scope", 400);
  }
  return { sort: record.sort as number, id: record.id as string };
}
function assertCursorKey(cursorKey: string): void {
  if (!/^[a-f0-9]{64}$/u.test(cursorKey)) {
    throw new AppError("PAGE_INVALID", "Page request is invalid", 400);
  }
}
function mapSubmissionRow(row: SubmissionRow): Submission {
  const review = row.review_decision && row.review_reason_code && row.review_created_at
    ? {
      decision: row.review_decision,
      reasonCode: row.review_reason_code,
      note: row.review_note || "",
      createdAt: row.review_created_at,
    }
    : undefined;
  return {
    id: row.id,
    submitterId: row.submitter_id,
    requestedSpaceId: row.requested_space_id,
    requestedCollectionId: row.requested_collection_id,
    requestedVisibility: row.requested_visibility,
    ...(row.supersedes_submission_id === null ? {} : { supersedesSubmissionId: row.supersedes_submission_id }),
    kind: row.kind,
    status: row.status,
    title: row.title,
    content: row.content,
    ...(review ? { review } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
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
    contentSha256: row.content_sha256, parserVersion: row.parser_version,
    parserSchemaVersion: row.parser_schema_version,
    sourceIdentitySha256: row.source_identity_sha256,
    codeMetadata: row.code_language === null || row.file_label === null
      ? null
      : { language: row.code_language, fileLabel: row.file_label, lineBaseline: row.line_baseline },
    createdAt: row.source_version_created_at,
  };
  return { submission, source, sourceVersion, duplicateCandidate: null };
}
function publicSubmission(submission: PersistedSubmission): Submission {
  const { idempotencyKey: _idempotencyKey, ...result } = submission;
  return result;
}
function exactReplayOrThrow(existing: SubmissionCreateResult, input: CreateSubmissionWithSourceVersion): SubmissionCreateResult {
  if (!existing.submission || !existing.sourceVersion
    || existing.sourceVersion.contentSha256 !== input.sourceVersion.contentSha256
    || existing.sourceVersion.sourceIdentitySha256 !== input.sourceVersion.sourceIdentitySha256
    || existing.submission.requestedSpaceId !== input.submission.requestedSpaceId
    || existing.submission.requestedCollectionId !== input.submission.requestedCollectionId
    || existing.submission.requestedVisibility !== input.submission.requestedVisibility
    || (existing.submission.supersedesSubmissionId ?? null) !== (input.submission.supersedesSubmissionId ?? null)
    || existing.submission.kind !== input.submission.kind
    || existing.submission.title !== input.submission.title) {
    throw new SubmissionsRepositoryConflictError("idempotency_conflict");
  }
  return existing;
}
function sameDuplicateSubmission(existing: Submission, input: CreateSubmissionWithSourceVersion): boolean {
  return existing.submitterId === input.submission.submitterId
    && existing.requestedSpaceId === input.submission.requestedSpaceId
    && existing.requestedCollectionId === input.submission.requestedCollectionId
    && existing.requestedVisibility === input.submission.requestedVisibility
    && existing.kind === input.submission.kind
    && existing.title === input.submission.title
    && existing.content === input.submission.content;
}
function assertSourceCreationBinding(input: CreateSubmissionWithSourceVersion): void {
  const { submission, source, sourceVersion, audit } = input;
  assertSubmissionAuditBinding(submission, audit);
  if (!submission.idempotencyKey || source.ownerId !== submission.submitterId
    || source.spaceId !== submission.requestedSpaceId || source.collectionId !== submission.requestedCollectionId
    || source.kind !== submission.kind || source.title !== submission.title
    || sourceVersion.sourceId !== source.id || sourceVersion.submissionId !== submission.id
    || sourceVersion.ordinal !== 1 || sourceVersion.parserVersion !== "m1-v1"
    || sourceVersion.parserSchemaVersion !== "m1-v2"
    || !/^[a-f0-9]{64}$/u.test(sourceVersion.sourceIdentitySha256 ?? "")
    || (source.kind === "code" && !sourceVersion.codeMetadata)
    || (source.kind !== "code" && sourceVersion.codeMetadata !== null)) {
    throw new TypeError("Submission source binding is invalid");
  }
}
function assertSubmissionAuditBinding(submission: CreateSubmission, audit: CreateAuditEvent): void {
  if (audit.actorKind !== "member" || audit.actorId !== submission.submitterId
    || audit.resourceType !== "submission" || audit.resourceId !== submission.id) {
    throw new TypeError("Submission audit binding is invalid");
  }
  if (submission.supersedesSubmissionId) {
    if (audit.action !== "submission.resubmitted"
      || audit.metadata.supersedesSubmissionId !== submission.supersedesSubmissionId
      || audit.metadata.requestedSpaceId !== submission.requestedSpaceId
      || audit.metadata.requestedCollectionId !== (submission.requestedCollectionId ?? undefined)
      || audit.metadata.requestedVisibility !== submission.requestedVisibility) {
      throw new TypeError("Submission audit binding is invalid");
    }
    return;
  }
  if (submission.status === "rejected") {
    if (audit.action !== "submission.rejected" || audit.metadata.reasonCode !== "duplicate") {
      throw new TypeError("Submission audit binding is invalid");
    }
    return;
  }
  if (audit.action !== "submission.created" || audit.metadata.kind !== submission.kind
    || audit.metadata.requestedSpaceId !== submission.requestedSpaceId
    || audit.metadata.requestedCollectionId !== (submission.requestedCollectionId ?? undefined)) {
    throw new TypeError("Submission audit binding is invalid");
  }
}
