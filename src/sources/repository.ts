import type { DuplicateSourceCandidate, Source, SourceVersion } from "./types";

type DuplicateCandidateRow = {
  submission_id: string;
  source_id: string;
  source_version_id: string;
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
    return this.db.prepare(
      `INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sources WHERE id = ?)
         AND EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
    ).bind(
      version.id, version.sourceId, version.submissionId, version.ordinal, version.content,
      version.contentSha256, version.parserVersion, version.createdAt, version.sourceId, version.submissionId,
    );
  }

  async findDuplicateCandidate(contentSha256: string): Promise<DuplicateSourceCandidate | null> {
    const row = await this.db.prepare(
      `SELECT sv.submission_id, sv.source_id, sv.id AS source_version_id
       FROM source_versions sv
       WHERE sv.content_sha256 = ?
       ORDER BY sv.created_at ASC, sv.id ASC
       LIMIT 1`,
    ).bind(contentSha256).first<DuplicateCandidateRow>();
    return row ? {
      submissionId: row.submission_id,
      sourceId: row.source_id,
      sourceVersionId: row.source_version_id,
    } : null;
  }
}
