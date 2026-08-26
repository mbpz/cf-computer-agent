import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import type { DuplicateCandidate, DuplicateDecision, DuplicateCandidatePage } from "./types";

export type DuplicateRepositoryConflictKind = "not_found" | "decision_conflict";
export class DuplicateRepositoryConflictError extends Error {
  constructor(readonly kind: DuplicateRepositoryConflictKind) { super(`Duplicate candidate conflict: ${kind}`); }
}

type DuplicateRow = {
  submission_id: string;
  canonical_submission_id: string;
  canonical_source_id: string;
  canonical_source_version_id: string;
  submission_title: string;
  canonical_title: string;
  decision: DuplicateCandidate["decision"];
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
};

const timestampCursorBounds = { minSort: 0, maxSort: 8_640_000_000_000_000 } as const;

export class DuplicateCandidatesRepository {
  constructor(private readonly db: D1Database, private readonly audit: AuditRepository) {}

  prepareInsertPending(candidate: {
    submissionId: string;
    canonicalSubmissionId: string;
    canonicalSourceId: string;
    canonicalSourceVersionId: string;
    createdAt: string;
  }): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO duplicate_candidates (
         submission_id, canonical_submission_id, canonical_source_id,
         canonical_source_version_id, decision, created_at
       ) VALUES (?, ?, ?, ?, 'pending', ?)`,
    ).bind(
      candidate.submissionId,
      candidate.canonicalSubmissionId,
      candidate.canonicalSourceId,
      candidate.canonicalSourceVersionId,
      candidate.createdAt,
    );
  }

  async listPending(request: PageRequest): Promise<DuplicateCandidatePage> {
    const cursor = request.cursor === undefined
      ? undefined
      : decodePageCursor(request.cursor, timestampCursorBounds);
    const cursorSql = cursor === undefined ? "" : " AND (dc.created_at < ? OR (dc.created_at = ? AND dc.submission_id < ?))";
    const rows = await this.db.prepare(
      `SELECT dc.submission_id, dc.canonical_submission_id, dc.canonical_source_id,
              dc.canonical_source_version_id, submitted.title AS submission_title,
              canonical.title AS canonical_title, dc.decision, dc.created_at,
              dc.decided_by, dc.decided_at
       FROM duplicate_candidates dc
       JOIN submissions submitted ON submitted.id = dc.submission_id
       JOIN submissions canonical ON canonical.id = dc.canonical_submission_id
       WHERE dc.decision = 'pending'${cursorSql}
       ORDER BY dc.created_at DESC, dc.submission_id DESC LIMIT ?`,
    ).bind(
      ...(cursor === undefined ? [] : [new Date(cursor.sort).toISOString(), new Date(cursor.sort).toISOString(), cursor.id]),
      request.limit + 1,
    ).all<DuplicateRow>();
    const items = rows.results.slice(0, request.limit).map(mapRow);
    return {
      items,
      ...(rows.results.length > request.limit && items.length > 0 ? {
        nextCursor: encodePageCursor({
          sort: Date.parse(items.at(-1)!.createdAt),
          id: items.at(-1)!.submissionId,
        }),
      } : {}),
    };
  }

  async decide(
    submissionId: string,
    reviewerId: string,
    decision: DuplicateDecision,
    audit: CreateAuditEvent,
    now: string,
  ): Promise<DuplicateCandidate> {
    const current = await this.find(submissionId);
    if (!current) throw new DuplicateRepositoryConflictError("not_found");
    if (current.decision !== "pending") {
      if (current.decision === decision && current.decidedBy === reviewerId) return current;
      throw new DuplicateRepositoryConflictError("decision_conflict");
    }
    const writes = await this.db.batch([
      this.db.prepare(
        `UPDATE duplicate_candidates
         SET decision = ?, decided_by = ?, decided_at = ?
         WHERE submission_id = ? AND decision = 'pending'`,
      ).bind(decision, reviewerId, now, submissionId),
      this.audit.prepareWriteAudit(audit),
    ]);
    if (writes[0]?.meta.changes !== 1 || writes[1]?.meta.changes !== 1) {
      const concurrent = await this.find(submissionId);
      if (concurrent && concurrent.decision === decision && concurrent.decidedBy === reviewerId) return concurrent;
      throw new DuplicateRepositoryConflictError("decision_conflict");
    }
    const updated = await this.find(submissionId);
    if (!updated) throw new DuplicateRepositoryConflictError("not_found");
    return updated;
  }

  private async find(submissionId: string): Promise<DuplicateCandidate | null> {
    const row = await this.db.prepare(
      `SELECT dc.submission_id, dc.canonical_submission_id, dc.canonical_source_id,
              dc.canonical_source_version_id, submitted.title AS submission_title,
              canonical.title AS canonical_title, dc.decision, dc.created_at,
              dc.decided_by, dc.decided_at
       FROM duplicate_candidates dc
       JOIN submissions submitted ON submitted.id = dc.submission_id
       JOIN submissions canonical ON canonical.id = dc.canonical_submission_id
       WHERE dc.submission_id = ? LIMIT 1`,
    ).bind(submissionId).first<DuplicateRow>();
    return row ? mapRow(row) : null;
  }
}

function mapRow(row: DuplicateRow): DuplicateCandidate {
  return {
    submissionId: row.submission_id,
    canonicalSubmissionId: row.canonical_submission_id,
    canonicalSourceId: row.canonical_source_id,
    canonicalSourceVersionId: row.canonical_source_version_id,
    submissionTitle: row.submission_title,
    canonicalTitle: row.canonical_title,
    decision: row.decision,
    createdAt: row.created_at,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
  };
}
