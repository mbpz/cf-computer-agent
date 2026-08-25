import type { SubmissionKind } from "../submissions/types";
import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import type { CodeSourceMetadata, SourceVersion } from "./types";
import type { ReparseCandidate, } from "./reparse";
import type { SourceReparseJob, SourceReparsePromotion, SourceReparseRepositoryPort, SourceReparseSnapshot } from "./reparse-service";

type ReparseRow = {
  id: string; source_id: string; base_source_version_id: string; submission_id: string; requested_by: string;
  parser_version: "m2-v1"; parser_schema_version: "m2-v1"; source_fingerprint: string;
  status: SourceReparseJob["status"]; attempts: number; candidate_content: string | null;
  candidate_content_sha256: string | null; candidate_source_identity_sha256: string | null;
  candidate_code_metadata: string | null; candidate_ordinal: number | null; candidate_line_count: number | null;
  candidate_created_at: string | null; last_error_code: string | null; created_at: string; updated_at: string;
};

type SourceRow = {
  id: string; source_id: string; submission_id: string; ordinal: number; content: string;
  content_sha256: string; parser_version: SourceVersion["parserVersion"];
  parser_schema_version: NonNullable<SourceVersion["parserSchemaVersion"]>;
  source_identity_sha256: string | null; code_language: string | null; file_label: string | null;
  line_baseline: number; created_at: string; kind: SubmissionKind; published_revision_id: string | null;
  owner_id: string; space_id: string; collection_id: string | null; title: string;
  requested_visibility: "shared" | "admin_only"; published_knowledge_item_id: string | null;
};

export class SourceReparseRepository implements SourceReparseRepositoryPort {
  constructor(private readonly db: D1Database, private readonly audit = new AuditRepository(db)) {}

  async findSourceVersionForReparse(sourceVersionId: string): Promise<SourceReparseSnapshot | null> {
    const row = await this.db.prepare(
      `SELECT sv.id, sv.source_id, sv.submission_id, sv.ordinal, sv.content, sv.content_sha256,
              sv.parser_version, sv.parser_schema_version, sv.source_identity_sha256,
              sv.code_language, sv.file_label, sv.line_baseline, sv.created_at,
              s.kind, r.id AS published_revision_id, r.knowledge_item_id AS published_knowledge_item_id,
              s.owner_id, s.space_id, s.collection_id, s.title, sub.requested_visibility
       FROM source_versions sv
       JOIN sources s ON s.id = sv.source_id
       JOIN submissions sub ON sub.id = sv.submission_id
       LEFT JOIN revisions r ON r.source_version_id = sv.id
       WHERE sv.id = ? LIMIT 1`,
    ).bind(sourceVersionId).first<SourceRow>();
    if (!row) return null;
    return {
      sourceVersion: {
        id: row.id, sourceId: row.source_id, submissionId: row.submission_id, ordinal: row.ordinal,
        content: row.content, contentSha256: row.content_sha256, parserVersion: row.parser_version,
        parserSchemaVersion: row.parser_schema_version, sourceIdentitySha256: row.source_identity_sha256,
        codeMetadata: row.code_language === null || row.file_label === null ? null : {
          language: row.code_language, fileLabel: row.file_label, lineBaseline: row.line_baseline,
        }, createdAt: row.created_at,
      },
      kind: row.kind,
      publishedRevisionId: row.published_revision_id,
      ownerId: row.owner_id,
      spaceId: row.space_id,
      collectionId: row.collection_id,
      title: row.title,
      requestedVisibility: row.requested_visibility,
      publishedKnowledgeItemId: row.published_knowledge_item_id,
    };
  }

  async findJobByFingerprint(sourceId: string, sourceFingerprint: string): Promise<SourceReparseJob | null> {
    const row = await this.db.prepare(
      "SELECT * FROM source_reparse_jobs WHERE source_id = ? AND source_fingerprint = ? AND parser_version = 'm2-v1' AND parser_schema_version = 'm2-v1' LIMIT 1",
    ).bind(sourceId, sourceFingerprint).first<ReparseRow>();
    return row ? mapJob(row) : null;
  }

  async insertQueuedJob(job: SourceReparseJob): Promise<SourceReparseJob> {
    try {
      await this.db.prepare(
        `INSERT INTO source_reparse_jobs (
          id, source_id, base_source_version_id, submission_id, requested_by, parser_version,
          parser_schema_version, source_fingerprint, status, attempts, last_error_code, created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, NULL, ?, ?
        WHERE EXISTS (SELECT 1 FROM source_versions WHERE id = ?)
          AND EXISTS (SELECT 1 FROM members WHERE id = ? AND role = 'admin' AND status = 'active')`,
      ).bind(
        job.id, job.sourceId, job.baseSourceVersionId, job.submissionId, job.requestedBy,
        job.parserVersion, job.parserSchemaVersion, job.sourceFingerprint, job.createdAt, job.updatedAt,
        job.baseSourceVersionId, job.requestedBy,
      ).run();
    } catch (error) {
      const replay = await this.findJobByFingerprint(job.sourceId, job.sourceFingerprint);
      if (replay) return replay;
      throw error;
    }
    const created = await this.getJob(job.id);
    if (!created) throw new Error("Source reparse job did not persist");
    return created;
  }

  async getJob(id: string): Promise<SourceReparseJob | null> {
    const row = await this.db.prepare("SELECT * FROM source_reparse_jobs WHERE id = ? LIMIT 1").bind(id).first<ReparseRow>();
    return row ? mapJob(row) : null;
  }

  async claimJob(id: string, now: string): Promise<SourceReparseJob | null> {
    await this.db.prepare(
      `UPDATE source_reparse_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND status IN ('queued', 'failed_retryable') AND attempts < 3`,
    ).bind(now, id).run();
    return this.getJob(id);
  }

  async completeJob(id: string, candidate: ReparseCandidate, now: string): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE source_reparse_jobs SET status = 'indexed', candidate_content = ?, candidate_content_sha256 = ?,
        candidate_source_identity_sha256 = ?, candidate_code_metadata = ?, candidate_ordinal = ?,
        candidate_line_count = ?, candidate_created_at = ?, last_error_code = NULL, updated_at = ?
       WHERE id = ? AND status = 'processing' AND source_fingerprint = ?`,
    ).bind(
      candidate.content, candidate.contentSha256, candidate.sourceIdentitySha256 ?? null,
      candidate.codeMetadata === null ? null : JSON.stringify(candidate.codeMetadata), candidate.ordinal,
      candidate.lineCount, candidate.createdAt, now, id, candidate.sourceFingerprint,
    ).run();
    return result.meta.changes === 1;
  }

  async updateCandidate(id: string, actorId: string, candidate: ReparseCandidate, now: string): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE source_reparse_jobs SET candidate_content = ?, candidate_content_sha256 = ?,
        candidate_source_identity_sha256 = ?, candidate_code_metadata = ?, candidate_ordinal = ?,
        candidate_line_count = ?, candidate_created_at = ?, updated_at = ?
       WHERE id = ? AND status = 'indexed'
         AND EXISTS (SELECT 1 FROM members WHERE id = ? AND role = 'admin' AND status = 'active')`,
    ).bind(
      candidate.content, candidate.contentSha256, candidate.sourceIdentitySha256 ?? null,
      candidate.codeMetadata === null ? null : JSON.stringify(candidate.codeMetadata), candidate.ordinal,
      candidate.lineCount, candidate.createdAt, now, id, actorId,
    ).run();
    return result.meta.changes === 1;
  }

  async failJob(id: string, code: string, terminal: boolean, now: string): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE source_reparse_jobs SET status = ?, last_error_code = ?, updated_at = ?
       WHERE id = ? AND status = 'processing'`,
    ).bind(terminal ? "failed_terminal" : "failed_retryable", code, now, id).run();
    return result.meta.changes === 1;
  }

  async findPromotion(jobId: string): Promise<SourceReparsePromotion | null> {
    const row = await this.db.prepare(
      `SELECT sub.id AS submission_id, source.id AS source_id, sv.id AS source_version_id
       FROM source_reparse_jobs job
       JOIN sources original ON original.id = job.source_id
       JOIN submissions sub ON sub.submitter_id = original.owner_id AND sub.idempotency_key = ?
       JOIN source_versions sv ON sv.submission_id = sub.id AND sv.parser_version = 'm2-v1'
       JOIN sources source ON source.id = sv.source_id
       WHERE job.id = ? LIMIT 1`,
    ).bind(`reparse:${jobId}`, jobId).first<{ submission_id: string; source_id: string; source_version_id: string }>();
    return row ? { submissionId: row.submission_id, sourceId: row.source_id, sourceVersionId: row.source_version_id } : null;
  }

  async promoteJob(jobId: string, actorId: string, promotion: SourceReparsePromotion): Promise<SourceReparsePromotion> {
    const job = await this.getJob(jobId);
    if (!job?.candidate) throw new Error("Source reparse candidate is unavailable");
    const snapshot = await this.findSourceVersionForReparse(job.baseSourceVersionId);
    if (!snapshot) throw new Error("Source reparse source is unavailable");
    const candidate = job.candidate;
    const now = candidate.createdAt;
    const audit: CreateAuditEvent = {
      id: `${jobId}:audit`, actorKind: "member", actorId: snapshot.ownerId,
      action: "submission.created", resourceType: "submission", resourceId: promotion.submissionId,
      metadata: {
        kind: snapshot.kind,
        requestedSpaceId: snapshot.spaceId,
        ...(snapshot.collectionId === null ? {} : { requestedCollectionId: snapshot.collectionId }),
      },
      createdAt: now,
    };
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO submissions (
          id, submitter_id, requested_space_id, requested_collection_id, requested_visibility,
          kind, status, title, content, idempotency_key, created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, 'review_pending', ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM members WHERE id = ?)
          AND EXISTS (SELECT 1 FROM members WHERE id = ? AND role = 'admin' AND status = 'active')
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE idempotency_key = ? AND submitter_id = ?)`,
      ).bind(
        promotion.submissionId, snapshot.ownerId, snapshot.spaceId, snapshot.collectionId, snapshot.requestedVisibility,
        snapshot.kind, snapshot.title, candidate.content, `reparse:${jobId}`, now, now,
        snapshot.ownerId, actorId, `reparse:${jobId}`, snapshot.ownerId,
      ),
      this.db.prepare(
        `INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
      ).bind(
        promotion.sourceId, snapshot.ownerId, snapshot.spaceId, snapshot.collectionId, snapshot.kind,
        snapshot.title, now, now, promotion.submissionId,
      ),
      this.db.prepare(
        `INSERT INTO source_versions (
          id, source_id, submission_id, ordinal, content, content_sha256, parser_version,
          parser_schema_version, source_identity_sha256, code_language, file_label, line_baseline, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM sources WHERE id = ?)
           AND EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
      ).bind(
        promotion.sourceVersionId, promotion.sourceId, promotion.submissionId, candidate.ordinal,
        candidate.content, candidate.contentSha256, candidate.parserVersion, candidate.parserSchemaVersion,
        candidate.sourceIdentitySha256 ?? null, candidate.codeMetadata?.language ?? null,
        candidate.codeMetadata?.fileLabel ?? null, candidate.codeMetadata?.lineBaseline ?? 1, now,
        promotion.sourceId, promotion.submissionId,
      ),
      this.audit.prepareWriteAudit(audit, promotion.submissionId),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) throw new Error("Source reparse promotion did not persist");
    return promotion;
  }
}

function mapJob(row: ReparseRow): SourceReparseJob {
  const candidate = row.candidate_content === null || row.candidate_content_sha256 === null
    || row.candidate_ordinal === null || row.candidate_line_count === null || row.candidate_created_at === null
    ? undefined
    : {
      id: `${row.id}:candidate`, sourceId: row.source_id, submissionId: row.submission_id,
      ordinal: row.candidate_ordinal, content: row.candidate_content,
      contentSha256: row.candidate_content_sha256, parserVersion: "m2-v1" as const,
      parserSchemaVersion: "m2-v1" as const, sourceIdentitySha256: row.candidate_source_identity_sha256,
      codeMetadata: parseCodeMetadata(row.candidate_code_metadata), createdAt: row.candidate_created_at,
      lineCount: row.candidate_line_count,
      sourceFingerprint: row.source_fingerprint,
    } satisfies ReparseCandidate;
  return {
    id: row.id, sourceId: row.source_id, baseSourceVersionId: row.base_source_version_id,
    submissionId: row.submission_id, requestedBy: row.requested_by, parserVersion: row.parser_version,
    parserSchemaVersion: row.parser_schema_version, sourceFingerprint: row.source_fingerprint,
    status: row.status, attempts: row.attempts, ...(candidate ? { candidate } : {}),
    lastErrorCode: row.last_error_code, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function parseCodeMetadata(raw: string | null): CodeSourceMetadata | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return typeof record.language === "string" && typeof record.fileLabel === "string"
      && typeof record.lineBaseline === "number" && Number.isSafeInteger(record.lineBaseline)
      ? { language: record.language, fileLabel: record.fileLabel, lineBaseline: record.lineBaseline }
      : null;
  } catch { return null; }
}
