import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { APP_CONFIG } from "../config";
import type { PublishedContentReceipt } from "../knowledge/types";
import type { ChunkDraft } from "../sources/chunker";
import type {
  PublicationIntent,
  PublicationRepositoryPort,
  PublishedRevision,
  PublishSubmissionInput,
  RejectionReasonCode,
  ReviewDecision,
  ReviewSubmissionSnapshot,
} from "./types";

export type PublicationRepositoryConflictKind =
  | "target_invalid"
  | "submission_not_pending"
  | "receipt_mismatch"
  | "decision_conflict";

export class PublicationRepositoryConflictError extends Error {
  constructor(readonly kind: PublicationRepositoryConflictKind) {
    super(`Publication conflict: ${kind}`);
  }
}

export interface PublicationRepositoryOptions {
  id?: () => string;
  now?: () => Date;
}

type PreviewRow = {
  submission_id: string;
  submitter_id: string;
  status: ReviewSubmissionSnapshot["status"];
  requested_space_id: string;
  requested_collection_id: string | null;
  kind: ReviewSubmissionSnapshot["kind"];
  title: string;
  raw_content: string;
  source_version_id: string;
  source_content: string;
  content_sha256: string;
  parser_version: "m1-v1";
};

type IntentRow = PreviewRow & {
  revision_id: string;
  knowledge_item_id: string;
  reviewer_id: string;
  intent_title: string;
  visibility: PublicationIntent["visibility"];
  tags_json: string;
  normalized_path: string;
  intent_content_sha256: string;
  state: PublicationIntent["state"];
  intent_created_at: string;
  intent_updated_at: string;
};

type RevisionRow = {
  id: string;
  knowledge_item_id: string;
  source_version_id: string;
  normalized_path: string;
  content_sha256: string;
  title: string;
  tags_json: string;
  visibility: PublishedRevision["visibility"];
  published_by: string;
  published_at: string;
  search_status: PublishedRevision["searchStatus"];
};

type ReviewRow = {
  submission_id: string;
  reviewer_id: string;
  decision: ReviewDecision["decision"];
  reason_code: ReviewDecision["reasonCode"];
  reason: string;
  title: string;
  visibility: ReviewDecision["visibility"];
  created_at: string;
};

type IndexJobRow = {
  state: "pending" | "running" | "completed" | "failed_retryable" | "failed_terminal";
  search_status: PublishedRevision["searchStatus"];
};

type IndexChunkRow = {
  id: string;
  search_title: string;
  search_tags: string;
  search_body: string;
};

const SAFE_PATH_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export class PublicationRepository implements PublicationRepositoryPort {
  private readonly audit: AuditRepository;
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly db: D1Database, options: PublicationRepositoryOptions = {}) {
    this.audit = new AuditRepository(db);
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async getPreview(submissionId: string): Promise<ReviewSubmissionSnapshot | null> {
    const row = await this.db.prepare(`${previewSelect} WHERE s.id = ? LIMIT 1`)
      .bind(submissionId).first<PreviewRow>();
    return row ? mapPreview(row) : null;
  }

  async validateTarget(input: PublishSubmissionInput): Promise<void> {
    const tags = await this.countActiveTags(input.spaceId, input.tagIds);
    const row = await this.db.prepare(
      `SELECT 1 AS valid FROM spaces s
       WHERE s.id = ? AND s.status = 'active' AND s.kind != 'legacy' AND s.read_only = 0
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM collections c
           WHERE c.id = ? AND c.space_id = s.id AND c.status = 'active'
         ))`,
    ).bind(input.spaceId, input.collectionId, input.collectionId).first<{ valid: number }>();
    if (row?.valid !== 1 || tags !== input.tagIds.length) {
      throw new PublicationRepositoryConflictError("target_invalid");
    }
  }

  async createOrReadIntent(
    submissionId: string,
    reviewerId: string,
    input: PublishSubmissionInput,
  ): Promise<PublicationIntent> {
    const existing = await this.findIntent(submissionId);
    if (existing) return existing;
    const preview = await this.getPreview(submissionId);
    if (!preview) throw new PublicationRepositoryConflictError("submission_not_pending");
    if (preview.status !== "review_pending") throw new PublicationRepositoryConflictError("submission_not_pending");
    if (preview.requestedSpaceId !== input.spaceId || preview.requestedCollectionId !== input.collectionId) {
      throw new PublicationRepositoryConflictError("target_invalid");
    }
    await this.validateTarget(input);

    const knowledgeItemId = this.id();
    const revisionId = this.id();
    if (!SAFE_PATH_SEGMENT.test(knowledgeItemId) || !SAFE_PATH_SEGMENT.test(revisionId)) {
      throw new TypeError("Publication identifiers are invalid");
    }
    const timestamp = this.now().toISOString();
    const tagsJson = JSON.stringify([...input.tagIds].sort());
    const normalizedPath = `${APP_CONFIG.publishedRoot}/${input.spaceId}/${knowledgeItemId}/${revisionId}.md`;
    try {
      await this.db.prepare(
        `INSERT INTO publication_intents (
          submission_id, revision_id, knowledge_item_id, reviewer_id, title, visibility,
          tags_json, normalized_path, content_sha256, state, created_at, updated_at
        )
        SELECT s.id, ?, ?, ?, ?, ?, ?, ?, sv.content_sha256, 'pending_content', ?, ?
        FROM submissions s JOIN source_versions sv ON sv.submission_id = s.id
        WHERE s.id = ? AND s.status = 'review_pending'
          AND s.requested_space_id = ?
          AND ((s.requested_collection_id IS NULL AND ? IS NULL) OR s.requested_collection_id = ?)
          AND EXISTS (
            SELECT 1 FROM spaces target
            WHERE target.id = ? AND target.status = 'active' AND target.kind != 'legacy' AND target.read_only = 0
          )
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM collections target_collection
            WHERE target_collection.id = ? AND target_collection.space_id = ? AND target_collection.status = 'active'
          ))
          AND ${activeTagsCondition(input.tagIds.length)}`,
      ).bind(
        revisionId, knowledgeItemId, reviewerId, input.title, input.visibility, tagsJson, normalizedPath,
        timestamp, timestamp, submissionId, input.spaceId, input.collectionId, input.collectionId,
        input.spaceId, input.collectionId, input.collectionId, input.spaceId,
        ...activeTagBindings(input.tagIds, input.spaceId),
      ).run();
    } catch (error) {
      const concurrent = await this.findIntent(submissionId);
      if (concurrent) return concurrent;
      throw error;
    }
    const created = await this.findIntent(submissionId);
    if (created) return created;
    const afterInsert = await this.getPreview(submissionId);
    if (!afterInsert || afterInsert.status !== "review_pending") {
      throw new PublicationRepositoryConflictError("submission_not_pending");
    }
    throw new PublicationRepositoryConflictError("target_invalid");
  }

  async markContentWritten(submissionId: string, receipt: PublishedContentReceipt): Promise<void> {
    const result = await this.db.prepare(
      `UPDATE publication_intents SET state = 'content_written', updated_at = ?
       WHERE submission_id = ? AND state = 'pending_content'
         AND normalized_path = ? AND content_sha256 = ?`,
    ).bind(this.now().toISOString(), submissionId, receipt.path, receipt.contentSha256).run();
    if (result.meta.changes === 1) return;
    const intent = await this.findIntent(submissionId);
    if (intent && (intent.state === "content_written" || intent.state === "completed")
      && intent.normalizedPath === receipt.path && intent.contentSha256 === receipt.contentSha256) return;
    throw new PublicationRepositoryConflictError("receipt_mismatch");
  }

  async finalize(intent: PublicationIntent, chunks: ChunkDraft[]): Promise<PublishedRevision> {
    const current = await this.findIntent(intent.submissionId);
    if (!current) throw new PublicationRepositoryConflictError("submission_not_pending");
    if (current.state === "completed") return this.requireRevision(current.revisionId);
    if (current.state !== "content_written" || !sameIntent(current, intent) || chunks.length === 0) {
      throw new PublicationRepositoryConflictError("receipt_mismatch");
    }
    assertChunks(chunks);
    const searchTags = await this.activeTagSearchText(current.spaceId, current.tagIds);
    const timestamp = this.now().toISOString();
    const reviewId = `review-${current.submissionId}`;
    const jobId = `index-${current.revisionId}`;
    const audit = publicationAudit(current, timestamp);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `UPDATE submissions SET status = 'published', title = ?, requested_space_id = ?,
           requested_collection_id = ?, updated_at = ?
         WHERE id = ? AND status = 'review_pending'
           AND EXISTS (
             SELECT 1 FROM publication_intents pi
             WHERE pi.submission_id = submissions.id AND pi.revision_id = ?
               AND pi.knowledge_item_id = ? AND pi.state = 'content_written'
               AND pi.normalized_path = ? AND pi.content_sha256 = ?
           )
           AND EXISTS (
             SELECT 1 FROM spaces target
             WHERE target.id = ? AND target.status = 'active' AND target.kind != 'legacy' AND target.read_only = 0
           )
           AND (? IS NULL OR EXISTS (
             SELECT 1 FROM collections target_collection
             WHERE target_collection.id = ? AND target_collection.space_id = ? AND target_collection.status = 'active'
           ))
           AND ${activeTagsCondition(current.tagIds.length)}`,
      ).bind(
        current.title, current.spaceId, current.collectionId, timestamp, current.submissionId,
        current.revisionId, current.knowledgeItemId, current.normalizedPath, current.contentSha256,
        current.spaceId, current.collectionId, current.collectionId, current.spaceId,
        ...activeTagBindings(current.tagIds, current.spaceId),
      ),
      this.changeGuard(),
      this.db.prepare(
        `INSERT INTO reviews (
          id, submission_id, reviewer_id, decision, reason_code, reason, title, visibility, created_at
        ) VALUES (?, ?, ?, 'published', 'approved', '', ?, ?, ?)`,
      ).bind(reviewId, current.submissionId, current.reviewerId, current.title, current.visibility, timestamp),
      this.db.prepare(
        `INSERT INTO knowledge_items (
          id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 'active', 'pending', ?, ?)`,
      ).bind(current.knowledgeItemId, current.spaceId, current.collectionId, timestamp, timestamp),
      this.db.prepare(
        `INSERT INTO revisions (
          id, knowledge_item_id, source_version_id, normalized_path, content_sha256,
          title, tags_json, visibility, published_by, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        current.revisionId, current.knowledgeItemId, current.sourceVersion.id, current.normalizedPath,
        current.contentSha256, current.title, JSON.stringify(current.tagIds), current.visibility,
        current.reviewerId, timestamp,
      ),
      this.db.prepare(
        `UPDATE knowledge_items SET current_revision_id = ?, updated_at = ?
         WHERE id = ? AND current_revision_id IS NULL AND status = 'active'`,
      ).bind(current.revisionId, timestamp, current.knowledgeItemId),
      this.changeGuard(),
      ...chunks.map((chunk) => this.prepareChunk(current, chunk, searchTags)),
      ...current.tagIds.map((tagId) => this.db.prepare(
        "INSERT INTO revision_tags (revision_id, tag_id) VALUES (?, ?)",
      ).bind(current.revisionId, tagId)),
      this.db.prepare(
        `UPDATE publication_intents SET state = 'completed', updated_at = ?
         WHERE submission_id = ? AND revision_id = ? AND state = 'content_written'`,
      ).bind(timestamp, current.submissionId, current.revisionId),
      this.changeGuard(),
      this.db.prepare(
        `INSERT INTO jobs (
          id, kind, resource_id, state, attempts, available_at, last_error_code, created_at, updated_at
        ) VALUES (?, 'index_revision', ?, 'pending', 0, ?, NULL, ?, ?)`,
      ).bind(jobId, current.revisionId, timestamp, timestamp, timestamp),
      this.audit.prepareWriteAudit(audit),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      const replay = await this.findIntent(current.submissionId);
      if (replay?.state === "completed") return this.requireRevision(replay.revisionId);
      throw error;
    }
    return this.requireRevision(current.revisionId);
  }

  async processIndexJob(revisionId: string): Promise<"indexed" | "search_degraded"> {
    let job = await this.findIndexJob(revisionId);
    if (!job) throw new Error("Index job not found");
    if (job.state === "completed") return "indexed";
    const timestamp = this.now().toISOString();
    const claim = await this.db.prepare(
      `UPDATE jobs SET state = 'running', attempts = attempts + 1, last_error_code = NULL, updated_at = ?
       WHERE kind = 'index_revision' AND resource_id = ?
         AND state IN ('pending', 'running', 'failed_retryable')`,
    ).bind(timestamp, revisionId).run();
    if (claim.meta.changes !== 1) {
      job = await this.findIndexJob(revisionId);
      if (job?.state === "completed") return "indexed";
      throw new Error("Index job is not recoverable");
    }

    try {
      const chunks = await this.db.prepare(
        `SELECT id, search_title, search_tags, search_body FROM chunks
         WHERE revision_id = ? ORDER BY ordinal ASC`,
      ).bind(revisionId).all<IndexChunkRow>();
      if (chunks.results.length === 0) throw new Error("Index job has no chunks");
      await this.db.batch([
        this.db.prepare(
          "DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE revision_id = ?)",
        ).bind(revisionId),
        ...chunks.results.map((chunk) => this.db.prepare(
          "INSERT INTO chunks_fts (chunk_id, title, tags, body) VALUES (?, ?, ?, ?)",
        ).bind(chunk.id, chunk.search_title, chunk.search_tags, chunk.search_body)),
        this.db.prepare(
          `UPDATE knowledge_items SET search_status = 'indexed', updated_at = ?
           WHERE current_revision_id = ? AND status = 'active'`,
        ).bind(timestamp, revisionId),
        this.changeGuard(),
        this.db.prepare(
          `UPDATE jobs SET state = 'completed', last_error_code = NULL, updated_at = ?
           WHERE kind = 'index_revision' AND resource_id = ? AND state = 'running'`,
        ).bind(timestamp, revisionId),
        this.changeGuard(),
      ]);
      return "indexed";
    } catch {
      job = await this.findIndexJob(revisionId);
      if (job?.state === "completed") return "indexed";
      await this.markIndexFailure(revisionId, timestamp);
      return "search_degraded";
    }
  }

  reject(
    submissionId: string,
    reviewerId: string,
    input: { reasonCode: RejectionReasonCode; note: string },
  ): Promise<ReviewDecision> {
    return this.decide(submissionId, reviewerId, "rejected", input.reasonCode, input.note);
  }

  requestRevision(
    submissionId: string,
    reviewerId: string,
    input: { reasonCode: "needs_revision"; note: string },
  ): Promise<ReviewDecision> {
    return this.decide(submissionId, reviewerId, "revision_requested", input.reasonCode, input.note);
  }

  async listPendingIntents(limit: number): Promise<PublicationIntent[]> {
    const rows = await this.db.prepare(
      `SELECT submission_id FROM publication_intents
       WHERE state IN ('pending_content', 'content_written')
       ORDER BY updated_at ASC, submission_id ASC LIMIT ?`,
    ).bind(limit).all<{ submission_id: string }>();
    const intents = await Promise.all(rows.results.map((row) => this.findIntent(row.submission_id)));
    return intents.filter((intent): intent is PublicationIntent => intent !== null);
  }

  async listRecoverableIndexRevisionIds(limit: number): Promise<string[]> {
    const rows = await this.db.prepare(
      `SELECT resource_id FROM jobs
       WHERE kind = 'index_revision' AND state IN ('pending', 'running', 'failed_retryable')
       ORDER BY available_at ASC, id ASC LIMIT ?`,
    ).bind(limit).all<{ resource_id: string }>();
    return rows.results.map((row) => row.resource_id);
  }

  private async findIntent(submissionId: string): Promise<PublicationIntent | null> {
    const row = await this.db.prepare(`${intentSelect} WHERE pi.submission_id = ? LIMIT 1`)
      .bind(submissionId).first<IntentRow>();
    return row ? mapIntent(row) : null;
  }

  private async requireRevision(revisionId: string): Promise<PublishedRevision> {
    const row = await this.db.prepare(
      `SELECT r.id, r.knowledge_item_id, r.source_version_id, r.normalized_path, r.content_sha256,
         r.title, r.tags_json, r.visibility, r.published_by, r.published_at, k.search_status
       FROM revisions r JOIN knowledge_items k ON k.id = r.knowledge_item_id
       WHERE r.id = ? LIMIT 1`,
    ).bind(revisionId).first<RevisionRow>();
    if (!row) throw new Error("Published revision not found");
    return mapRevision(row);
  }

  private prepareChunk(intent: PublicationIntent, chunk: ChunkDraft, searchTags: string): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO chunks (
        id, revision_id, ordinal, heading_path, start_line, end_line, body,
        search_title, search_tags, search_body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `${intent.revisionId}-chunk-${chunk.ordinal}`,
      intent.revisionId,
      chunk.ordinal,
      JSON.stringify(chunk.headingPath),
      chunk.startLine,
      chunk.endLine,
      chunk.body,
      intent.title,
      searchTags,
      chunk.searchBody,
    );
  }

  private async countActiveTags(spaceId: string, tagIds: string[]): Promise<number> {
    if (tagIds.length === 0) return 0;
    const placeholders = tagIds.map(() => "?").join(", ");
    const row = await this.db.prepare(
      `SELECT count(*) AS count FROM tags
       WHERE id IN (${placeholders}) AND space_id = ? AND status = 'active'`,
    ).bind(...tagIds, spaceId).first<{ count: number }>();
    return row?.count ?? 0;
  }

  private async activeTagSearchText(spaceId: string, tagIds: string[]): Promise<string> {
    if (tagIds.length === 0) return "";
    const placeholders = tagIds.map(() => "?").join(", ");
    const rows = await this.db.prepare(
      `SELECT id, slug, name FROM tags
       WHERE id IN (${placeholders}) AND space_id = ? AND status = 'active'
       ORDER BY id ASC`,
    ).bind(...tagIds, spaceId).all<{ id: string; slug: string; name: string }>();
    if (rows.results.length !== tagIds.length) {
      throw new PublicationRepositoryConflictError("target_invalid");
    }
    return rows.results.map((tag) => `${tag.slug} ${tag.name}`).join(" ");
  }

  private async decide(
    submissionId: string,
    reviewerId: string,
    decision: "rejected" | "revision_requested",
    reasonCode: RejectionReasonCode | "needs_revision",
    note: string,
  ): Promise<ReviewDecision> {
    const existing = await this.findReview(submissionId);
    if (existing) return exactDecisionOrThrow(existing, reviewerId, decision, reasonCode, note);
    const preview = await this.getPreview(submissionId);
    if (!preview || preview.status !== "review_pending") {
      throw new PublicationRepositoryConflictError("decision_conflict");
    }
    const timestamp = this.now().toISOString();
    const review: ReviewDecision = {
      submissionId,
      reviewerId,
      decision,
      reasonCode,
      note,
      title: preview.title,
      visibility: "admin_only",
      createdAt: timestamp,
    };
    const audit = decisionAudit(review);
    try {
      await this.db.batch([
        this.db.prepare(
          `UPDATE submissions SET status = ?, updated_at = ?
           WHERE id = ? AND status = 'review_pending'
             AND NOT EXISTS (
               SELECT 1 FROM publication_intents active_intent
               WHERE active_intent.submission_id = submissions.id
             )`,
        ).bind(decision, timestamp, submissionId),
        this.changeGuard(),
        this.db.prepare(
          `INSERT INTO reviews (
            id, submission_id, reviewer_id, decision, reason_code, reason, title, visibility, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin_only', ?)`,
        ).bind(`review-${submissionId}`, submissionId, reviewerId, decision, reasonCode, note, preview.title, timestamp),
        this.audit.prepareWriteAudit(audit),
      ]);
    } catch (error) {
      const concurrent = await this.findReview(submissionId);
      if (concurrent) return exactDecisionOrThrow(concurrent, reviewerId, decision, reasonCode, note);
      const blocked = await this.db.prepare(
        `SELECT s.status,
           EXISTS(SELECT 1 FROM publication_intents pi WHERE pi.submission_id = s.id) AS has_intent
         FROM submissions s WHERE s.id = ? LIMIT 1`,
      ).bind(submissionId).first<{ status: ReviewSubmissionSnapshot["status"]; has_intent: number }>();
      if (!blocked || blocked.status !== "review_pending" || blocked.has_intent === 1) {
        throw new PublicationRepositoryConflictError("decision_conflict");
      }
      throw error;
    }
    return review;
  }

  private async findReview(submissionId: string): Promise<ReviewDecision | null> {
    const row = await this.db.prepare(
      `SELECT submission_id, reviewer_id, decision, reason_code, reason, title, visibility, created_at
       FROM reviews WHERE submission_id = ? LIMIT 1`,
    ).bind(submissionId).first<ReviewRow>();
    return row ? mapReview(row) : null;
  }

  private findIndexJob(revisionId: string): Promise<IndexJobRow | null> {
    return this.db.prepare(
      `SELECT j.state, k.search_status FROM jobs j
       JOIN revisions r ON r.id = j.resource_id
       JOIN knowledge_items k ON k.id = r.knowledge_item_id
       WHERE j.kind = 'index_revision' AND j.resource_id = ? LIMIT 1`,
    ).bind(revisionId).first<IndexJobRow>();
  }

  private async markIndexFailure(revisionId: string, timestamp: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `UPDATE jobs SET state = 'failed_retryable', last_error_code = 'FTS_INDEX_FAILED', updated_at = ?
         WHERE kind = 'index_revision' AND resource_id = ? AND state != 'completed'`,
      ).bind(timestamp, revisionId),
      this.changeGuard(),
      this.db.prepare(
        `UPDATE knowledge_items SET search_status = 'search_degraded', updated_at = ?
         WHERE current_revision_id = ? AND status = 'active'`,
      ).bind(timestamp, revisionId),
    ]);
  }

  private changeGuard(): D1PreparedStatement {
    return this.db.prepare(
      "SELECT CASE WHEN changes() = 1 THEN 1 ELSE json_extract('publication-change-guard', '$') END AS ok",
    );
  }
}

const previewSelect = `SELECT
  s.id AS submission_id, s.submitter_id, s.status, s.requested_space_id, s.requested_collection_id,
  s.kind, s.title, s.content AS raw_content, sv.id AS source_version_id, sv.content AS source_content,
  sv.content_sha256, sv.parser_version
FROM submissions s JOIN source_versions sv ON sv.submission_id = s.id`;

const intentSelect = `SELECT
  s.id AS submission_id, s.submitter_id, s.status, s.requested_space_id, s.requested_collection_id,
  s.kind, s.title, s.content AS raw_content, sv.id AS source_version_id, sv.content AS source_content,
  sv.content_sha256, sv.parser_version,
  pi.revision_id, pi.knowledge_item_id, pi.reviewer_id, pi.title AS intent_title,
  pi.visibility, pi.tags_json, pi.normalized_path, pi.content_sha256 AS intent_content_sha256,
  pi.state, pi.created_at AS intent_created_at, pi.updated_at AS intent_updated_at
FROM publication_intents pi
JOIN submissions s ON s.id = pi.submission_id
JOIN source_versions sv ON sv.submission_id = s.id`;

function mapPreview(row: PreviewRow): ReviewSubmissionSnapshot {
  return {
    submissionId: row.submission_id,
    submitterId: row.submitter_id,
    status: row.status,
    requestedSpaceId: row.requested_space_id,
    requestedCollectionId: row.requested_collection_id,
    kind: row.kind,
    title: row.title,
    rawContent: row.raw_content,
    sourceVersion: {
      id: row.source_version_id,
      kind: row.kind,
      content: row.source_content,
      contentSha256: row.content_sha256,
      parserVersion: row.parser_version,
    },
  };
}

function mapIntent(row: IntentRow): PublicationIntent {
  const preview = mapPreview(row);
  return {
    submissionId: row.submission_id,
    revisionId: row.revision_id,
    knowledgeItemId: row.knowledge_item_id,
    reviewerId: row.reviewer_id,
    title: row.intent_title,
    visibility: row.visibility,
    spaceId: row.requested_space_id,
    collectionId: row.requested_collection_id,
    tagIds: parseStringArray(row.tags_json),
    normalizedPath: row.normalized_path,
    contentSha256: row.intent_content_sha256,
    state: row.state,
    sourceVersion: preview.sourceVersion,
    createdAt: row.intent_created_at,
    updatedAt: row.intent_updated_at,
  };
}

function mapRevision(row: RevisionRow): PublishedRevision {
  return {
    id: row.id,
    knowledgeItemId: row.knowledge_item_id,
    sourceVersionId: row.source_version_id,
    normalizedPath: row.normalized_path,
    contentSha256: row.content_sha256,
    title: row.title,
    tagIds: parseStringArray(row.tags_json),
    visibility: row.visibility,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    searchStatus: row.search_status,
  };
}

function mapReview(row: ReviewRow): ReviewDecision {
  return {
    submissionId: row.submission_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    reasonCode: row.reason_code,
    note: row.reason,
    title: row.title,
    visibility: row.visibility,
    createdAt: row.created_at,
  };
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 20 || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Publication tag snapshot is invalid");
  }
  return [...parsed];
}

function activeTagsCondition(count: number): string {
  if (count === 0) return "0 = ?";
  const placeholders = Array.from({ length: count }, () => "?").join(", ");
  return `(SELECT count(*) FROM tags active_tag
    WHERE active_tag.id IN (${placeholders}) AND active_tag.space_id = ? AND active_tag.status = 'active') = ?`;
}

function activeTagBindings(tagIds: string[], spaceId: string): unknown[] {
  return tagIds.length === 0 ? [0] : [...tagIds, spaceId, tagIds.length];
}

function publicationAudit(intent: PublicationIntent, createdAt: string): CreateAuditEvent {
  return {
    id: `publish-${intent.revisionId}`,
    actorKind: "member",
    actorId: intent.reviewerId,
    action: "knowledge.published",
    resourceType: "knowledge",
    resourceId: intent.knowledgeItemId,
    metadata: {
      submissionId: intent.submissionId,
      revisionId: intent.revisionId,
      visibility: intent.visibility,
    },
    createdAt,
  };
}

function decisionAudit(review: ReviewDecision): CreateAuditEvent {
  if (review.decision === "rejected") {
    return {
      id: `reject-${review.submissionId}`,
      actorKind: "member",
      actorId: review.reviewerId,
      action: "submission.rejected",
      resourceType: "submission",
      resourceId: review.submissionId,
      metadata: { reasonCode: review.reasonCode as RejectionReasonCode },
      createdAt: review.createdAt,
    };
  }
  return {
    id: `revision-${review.submissionId}`,
    actorKind: "member",
    actorId: review.reviewerId,
    action: "submission.revision_requested",
    resourceType: "submission",
    resourceId: review.submissionId,
    metadata: { reasonCode: "needs_revision" },
    createdAt: review.createdAt,
  };
}

function exactDecisionOrThrow(
  existing: ReviewDecision,
  reviewerId: string,
  decision: ReviewDecision["decision"],
  reasonCode: ReviewDecision["reasonCode"],
  note: string,
): ReviewDecision {
  if (existing.reviewerId !== reviewerId || existing.decision !== decision
    || existing.reasonCode !== reasonCode || existing.note !== note) {
    throw new PublicationRepositoryConflictError("decision_conflict");
  }
  return existing;
}

function sameIntent(left: PublicationIntent, right: PublicationIntent): boolean {
  return left.submissionId === right.submissionId
    && left.revisionId === right.revisionId
    && left.knowledgeItemId === right.knowledgeItemId
    && left.reviewerId === right.reviewerId
    && left.title === right.title
    && left.visibility === right.visibility
    && left.spaceId === right.spaceId
    && left.collectionId === right.collectionId
    && left.normalizedPath === right.normalizedPath
    && left.contentSha256 === right.contentSha256
    && left.sourceVersion.id === right.sourceVersion.id
    && left.sourceVersion.contentSha256 === right.sourceVersion.contentSha256
    && left.tagIds.length === right.tagIds.length
    && left.tagIds.every((tagId, index) => tagId === right.tagIds[index]);
}

function assertChunks(chunks: ChunkDraft[]): void {
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    if (chunk.ordinal !== index || chunk.body.length === 0 || chunk.searchBody.length === 0
      || chunk.startLine < 1 || chunk.endLine < chunk.startLine) {
      throw new TypeError("Publication chunks are invalid");
    }
  }
}
