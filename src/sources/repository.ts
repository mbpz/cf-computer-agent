import type { DuplicateSourceCandidate, Source, SourceConflict, SourceVersion } from "./types";

type DuplicateCandidateRow = {
  submission_id: string;
  source_id: string;
  source_version_id: string;
};

type SourceConflictRow = {
  source_version_id: string;
  source_id: string;
  submission_id: string;
  space_id: string;
  content_sha256: string;
  created_at: string;
};

export class SourcesRepository {
  constructor(private readonly db: D1Database) {}

  prepareCreate(source: Source, requireSubmissionId: string): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
    ).bind(
      source.id, source.ownerId, source.spaceId, source.collectionId, source.kind, source.title,
      source.createdAt, source.updatedAt, requireSubmissionId,
    );
  }

  prepareCreateVersion(version: SourceVersion): D1PreparedStatement {
    if (version.parserSchemaVersion === "m1-v2"
      && (typeof version.sourceIdentitySha256 !== "string"
        || !/^[a-f0-9]{64}$/u.test(version.sourceIdentitySha256))) {
      throw new TypeError("M1-v2 source identity must be a canonical SHA-256 digest");
    }
    return this.db.prepare(
      `INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, parser_schema_version, source_identity_sha256, code_language, file_label, line_baseline, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sources WHERE id = ?)
         AND EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
    ).bind(
      version.id, version.sourceId, version.submissionId, version.ordinal, version.content,
      version.contentSha256, version.parserVersion, version.parserSchemaVersion ?? "m1-v1",
      version.sourceIdentitySha256 ?? null, version.codeMetadata?.language ?? null,
      version.codeMetadata?.fileLabel ?? null, version.codeMetadata?.lineBaseline ?? 1,
      version.createdAt, version.sourceId, version.submissionId,
    );
  }

  async findDuplicateCandidate(contentSha256: string, ownerId: string, spaceId: string): Promise<DuplicateSourceCandidate | null> {
    const row = await this.db.prepare(
      `SELECT sv.submission_id, sv.source_id, sv.id AS source_version_id
       FROM source_versions sv
       JOIN sources s ON s.id = sv.source_id
       WHERE sv.content_sha256 = ? AND s.owner_id = ? AND s.space_id = ?
       ORDER BY sv.created_at ASC, sv.id ASC
       LIMIT 1`,
    ).bind(contentSha256, ownerId, spaceId).first<DuplicateCandidateRow>();
    return row ? {
      submissionId: row.submission_id,
      sourceId: row.source_id,
      sourceVersionId: row.source_version_id,
    } : null;
  }

  async listConflicts(sourceVersionId: string, ownerId: string, limit = 8): Promise<SourceConflict[]> {
    const rows = await this.db.prepare(
      `SELECT sv.id AS source_version_id, sv.source_id, sv.submission_id,
              s.space_id, sv.content_sha256, sv.created_at
       FROM source_versions sv
       JOIN sources s ON s.id = sv.source_id
       WHERE s.owner_id = ?
         AND sv.id <> ?
         AND sv.content_sha256 = (SELECT content_sha256 FROM source_versions WHERE id = ?)
         AND s.space_id = (SELECT s2.space_id FROM source_versions sv2 JOIN sources s2 ON s2.id = sv2.source_id WHERE sv2.id = ?)
       ORDER BY sv.created_at ASC, sv.id ASC
       LIMIT ?`,
    ).bind(ownerId, sourceVersionId, sourceVersionId, sourceVersionId, limit).all<SourceConflictRow>();
    return rows.results.map((row) => ({
      sourceVersionId: row.source_version_id,
      sourceId: row.source_id,
      submissionId: row.submission_id,
      spaceId: row.space_id,
      contentSha256: row.content_sha256,
      createdAt: row.created_at,
    }));
  }
}
