import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { APP_CONFIG } from "../config";
import { buildIndexChunkFields, buildIndexDocument, type IndexTag } from "../indexing/document";
import type { PublishedContentReceipt } from "../knowledge/types";
import type { ChunkDraft } from "../sources/chunker";
import { MAX_REVISION_CHUNKS } from "../sources/limits";
import type {
  PublicationIntent,
  PublicationRepositoryPort,
  PublishedRevision,
  RollbackResult,
  PublishSubmissionInput,
  RejectionReasonCode,
  ReviewDecision,
  ReviewSubmissionSnapshot,
  ReviewTargetSummary,
  SearchStatus,
} from "./types";

export type PublicationRepositoryConflictKind =
  | "target_invalid"
  | "submission_not_pending"
  | "intent_mismatch"
  | "receipt_mismatch"
  | "decision_conflict"
  | "rollback_target_invalid"
  | "rollback_conflict";

export class PublicationRepositoryConflictError extends Error {
  constructor(readonly kind: PublicationRepositoryConflictKind) {
    super(`Publication conflict: ${kind}`);
  }
}

export interface PublicationRepositoryOptions {
  id?: () => string;
  now?: () => Date;
  leaseToken?: () => string;
}

type PreviewRow = {
  submission_id: string;
  submitter_id: string;
  status: ReviewSubmissionSnapshot["status"];
  requested_space_id: string;
  requested_collection_id: string | null;
  requested_visibility: PublicationIntent["visibility"];
  kind: ReviewSubmissionSnapshot["kind"];
  title: string;
  raw_content: string;
  source_version_id: string;
  source_content: string;
  content_sha256: string;
  parser_version: "m1-v1";
  parser_schema_version: "m1-v1" | "m1-v2";
  code_language: string | null;
  file_label: string | null;
  line_baseline: number;
};

type TargetRow = {
  space_id: string;
  space_slug: string;
  space_name: string;
  space_status: "active" | "disabled";
  space_kind: "shared" | "legacy";
  space_read_only: number;
  collection_id: string | null;
  collection_name: string | null;
  collection_status: "active" | "disabled" | null;
};

type IntentRow = PreviewRow & {
  revision_id: string;
  knowledge_item_id: string;
  reviewer_id: string;
  intent_title: string;
  intent_space_id: string | null;
  intent_collection_id: string | null;
  visibility: PublicationIntent["visibility"];
  visibility_reason_code: string | null;
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
  attempts: number;
  knowledge_item_id: string;
  current_revision_id: string | null;
  item_status: "active" | "trashed";
  search_status: PublishedRevision["searchStatus"];
  lease_token: string | null;
  lease_expires_at: string | null;
};

type IndexChunkRow = {
  id: string;
  ftsRowid: number;
  ordinal: number;
  heading_path: string;
  start_line: number;
  end_line: number;
  body: string;
  searchBody: string;
  index_field: ChunkDraft["indexField"];
};

type IndexRevisionRow = {
  id: string;
  title: string;
  summary: string;
  visibility: PublishedRevision["visibility"];
};
type IndexCorpus = "chunks_fts" | "chunks_fts_shared";

const SAFE_PATH_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_INDEX_ATTEMPTS = 3;
const INDEX_LEASE_MS = 30_000;
const visibleCurrentIndexStatusSql = `CASE
  WHEN current_index_job.state = 'failed_terminal' THEN 'failed'
  WHEN current_index_job.state = 'failed_retryable' THEN 'search_degraded'
  WHEN current_index_job.state IN ('pending', 'running') THEN 'pending'
  WHEN current_index_job.state = 'completed' AND k.search_status = 'indexed' THEN 'indexed'
  ELSE k.search_status
END`;

export class PublicationRepository implements PublicationRepositoryPort {
  private readonly audit: AuditRepository;
  private readonly id: () => string;
  private readonly now: () => Date;
  private readonly leaseToken: () => string;

  constructor(private readonly db: D1Database, options: PublicationRepositoryOptions = {}) {
    this.audit = new AuditRepository(db);
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.leaseToken = options.leaseToken || (() => crypto.randomUUID());
  }

  async getPreview(submissionId: string): Promise<ReviewSubmissionSnapshot | null> {
    const row = await this.db.prepare(`${previewSelect} WHERE s.id = ? LIMIT 1`)
      .bind(submissionId).first<PreviewRow>();
    if (!row) return null;
    const requestedTarget = await this.readTargetSummary(
      row.requested_space_id,
      row.requested_collection_id,
    );
    return mapPreview(row, requestedTarget);
  }

  async validateTarget(input: PublishSubmissionInput): Promise<void> {
    const [target, tags] = await Promise.all([
      this.readTargetSummary(input.spaceId, input.collectionId),
      this.countActiveTags(input.spaceId, input.tagIds),
    ]);
    if (target?.available !== true || tags !== input.tagIds.length) {
      throw new PublicationRepositoryConflictError("target_invalid");
    }
  }

  private async readTargetSummary(
    spaceId: string,
    collectionId: string | null,
  ): Promise<ReviewTargetSummary | null> {
    const row = await this.db.prepare(
      `SELECT s.id AS space_id, s.slug AS space_slug, s.name AS space_name,
         s.status AS space_status, s.kind AS space_kind, s.read_only AS space_read_only,
         c.id AS collection_id, c.name AS collection_name, c.status AS collection_status
       FROM spaces s
       LEFT JOIN collections c ON c.id = ? AND c.space_id = s.id
       WHERE s.id = ?
       LIMIT 1`,
    ).bind(collectionId, spaceId).first<TargetRow>();
    if (!row) return null;
    const collectionMatches = collectionId === null
      || (row.collection_id === collectionId && row.collection_status === "active");
    return {
      space: {
        id: row.space_id,
        slug: row.space_slug,
        name: row.space_name,
        status: row.space_status,
      },
      collection: row.collection_id === null ? null : {
        id: row.collection_id,
        name: row.collection_name || "",
        status: row.collection_status || "disabled",
      },
      available: row.space_status === "active"
        && row.space_kind !== "legacy"
        && row.space_read_only === 0
        && collectionMatches,
    };
  }

  async createOrReadIntent(
    submissionId: string,
    reviewerId: string,
    input: PublishSubmissionInput,
  ): Promise<PublicationIntent> {
    const existing = await this.findIntent(submissionId);
    if (existing) return exactIntentOrThrow(existing, reviewerId, input);
    const preview = await this.getPreview(submissionId);
    if (!preview) throw new PublicationRepositoryConflictError("submission_not_pending");
    if (preview.status !== "review_pending") throw new PublicationRepositoryConflictError("submission_not_pending");
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
          tags_json, normalized_path, content_sha256, state, created_at, updated_at,
          space_id, collection_id, visibility_reason_code
        )
        SELECT s.id, ?, ?, ?, ?, ?, ?, ?, sv.content_sha256, 'pending_content', ?, ?, ?, ?, ?
        FROM submissions s JOIN source_versions sv ON sv.submission_id = s.id
        WHERE s.id = ? AND s.status = 'review_pending'
          AND EXISTS (
            SELECT 1 FROM members reviewer
            WHERE reviewer.id = ? AND reviewer.role = 'admin' AND reviewer.status = 'active'
          )
          AND ((s.requested_visibility = 'shared' AND ? IS NULL)
            OR (s.requested_visibility = 'admin_only' AND ? = 'admin_only' AND ? IS NULL)
            OR (s.requested_visibility = 'admin_only' AND ? = 'shared'
              AND ? = 'admin_visibility_expansion'))
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
        timestamp, timestamp, input.spaceId, input.collectionId, input.visibilityReasonCode ?? null,
        submissionId, reviewerId, input.visibilityReasonCode ?? null,
        input.visibility, input.visibilityReasonCode ?? null,
        input.visibility, input.visibilityReasonCode ?? null,
        input.spaceId, input.collectionId, input.collectionId, input.spaceId,
        ...activeTagBindings(input.tagIds, input.spaceId),
      ).run();
    } catch (error) {
      const concurrent = await this.findIntent(submissionId);
      if (concurrent) return exactIntentOrThrow(concurrent, reviewerId, input);
      throw error;
    }
    const created = await this.findIntent(submissionId);
    if (created) return exactIntentOrThrow(created, reviewerId, input);
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

  async markIntentFailedTerminal(submissionId: string): Promise<void> {
    const result = await this.db.prepare(
      `UPDATE publication_intents SET state = 'failed_terminal', updated_at = ?
       WHERE submission_id = ? AND state IN ('pending_content', 'content_written')`,
    ).bind(this.now().toISOString(), submissionId).run();
    if (result.meta.changes === 1) return;
    const intent = await this.findIntent(submissionId);
    if (intent?.state === "failed_terminal") return;
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
    const requested = await this.getPreview(current.submissionId);
    if (!requested) throw new PublicationRepositoryConflictError("submission_not_pending");
    const indexTags = await this.activeIndexTags(current.spaceId, current.tagIds);
    const indexDocument = buildIndexDocument({
      id: current.revisionId,
      title: current.title,
    }, chunks, indexTags);
    const timestamp = this.now().toISOString();
    const reviewId = `review-${current.submissionId}`;
    const jobId = `index-${current.revisionId}`;
    const audit = publicationAudit(current, timestamp);
    const metadataAudit = reviewMetadataAudit(current, requested, timestamp);
    const visibilityAudit = visibilityExpansionAudit(current, requested, timestamp);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `UPDATE submissions SET status = 'published', updated_at = ?
         WHERE id = ? AND status = 'review_pending'
           AND EXISTS (
             SELECT 1 FROM publication_intents pi
             WHERE pi.submission_id = submissions.id AND pi.revision_id = ?
               AND pi.knowledge_item_id = ? AND pi.state = 'content_written'
               AND pi.normalized_path = ? AND pi.content_sha256 = ?
               AND pi.reviewer_id = ?
               AND pi.title = ? AND length(pi.title) BETWEEN 1 AND 200
               AND length(CAST(pi.title AS BLOB)) <= 512
               AND pi.space_id = ? AND pi.collection_id IS ?
               AND pi.visibility = ? AND pi.tags_json = ?
               AND pi.visibility_reason_code IS ?
           )
           AND EXISTS (
             SELECT 1 FROM spaces target
             WHERE target.id = ? AND target.status = 'active' AND target.kind != 'legacy' AND target.read_only = 0
           )
           AND (? IS NULL OR EXISTS (
             SELECT 1 FROM collections target_collection
             WHERE target_collection.id = ? AND target_collection.space_id = ? AND target_collection.status = 'active'
           ))
           AND EXISTS (
             SELECT 1 FROM members reviewer
             WHERE reviewer.id = ? AND reviewer.role = 'admin' AND reviewer.status = 'active'
           )
           AND ((requested_visibility = 'shared' AND ? IS NULL)
             OR (requested_visibility = 'admin_only' AND ? = 'admin_only' AND ? IS NULL)
             OR (requested_visibility = 'admin_only' AND ? = 'shared'
               AND ? = 'admin_visibility_expansion'))
           AND ${activeTagsCondition(current.tagIds.length)}`,
      ).bind(
        timestamp, current.submissionId,
        current.revisionId, current.knowledgeItemId, current.normalizedPath, current.contentSha256,
        current.reviewerId, current.title, current.spaceId, current.collectionId,
        current.visibility, JSON.stringify(current.tagIds), current.visibilityReasonCode ?? null,
        current.spaceId, current.collectionId, current.collectionId, current.spaceId,
        current.reviewerId, current.visibilityReasonCode ?? null,
        current.visibility, current.visibilityReasonCode ?? null,
        current.visibility, current.visibilityReasonCode ?? null,
        ...activeTagBindings(current.tagIds, current.spaceId),
      ),
      this.changeGuard(),
      this.db.prepare(
        `INSERT INTO reviews (
          id, submission_id, reviewer_id, decision, reason_code, reason, title, visibility, created_at,
          requested_title, requested_space_id, requested_collection_id, requested_visibility,
          final_space_id, final_collection_id, final_visibility, visibility_reason_code
        )
        SELECT ?, s.id, ?, 'published', 'approved', '', ?, ?, ?,
          s.title, s.requested_space_id, s.requested_collection_id, s.requested_visibility,
          ?, ?, ?, ?
        FROM submissions s WHERE s.id = ? AND s.status = 'published'`,
      ).bind(
        reviewId, current.reviewerId, current.title, current.visibility, timestamp,
        current.spaceId, current.collectionId, current.visibility,
        current.visibilityReasonCode ?? null, current.submissionId,
      ),
      this.db.prepare(
        `INSERT INTO knowledge_items (
          id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 'active', 'pending', ?, ?)`,
      ).bind(current.knowledgeItemId, current.spaceId, current.collectionId, timestamp, timestamp),
      this.db.prepare(
        `INSERT INTO revisions (
          id, knowledge_item_id, source_version_id, normalized_path, content_sha256,
          title, summary, tags_json, visibility, published_by, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        current.revisionId, current.knowledgeItemId, current.sourceVersion.id, current.normalizedPath,
        current.contentSha256, current.title, indexDocument.summary, JSON.stringify(current.tagIds), current.visibility,
        current.reviewerId, timestamp,
      ),
      this.db.prepare(
        `UPDATE knowledge_items SET current_revision_id = ?, updated_at = ?
         WHERE id = ? AND current_revision_id IS NULL AND status = 'active'`,
      ).bind(current.revisionId, timestamp, current.knowledgeItemId),
      this.changeGuard(),
      ...chunks.map((chunk) => this.prepareChunk(current, chunk, indexDocument.tags)),
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
      ...(metadataAudit ? [this.audit.prepareWriteAudit(metadataAudit)] : []),
      ...(visibilityAudit ? [this.audit.prepareWriteAudit(visibilityAudit)] : []),
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

  async rollback(
    knowledgeItemId: string,
    revisionId: string,
    reviewerId: string,
  ): Promise<RollbackResult> {
    const target = await this.db.prepare(
      `SELECT k.current_revision_id AS previous_revision_id
       FROM knowledge_items k
       JOIN revisions target ON target.id = ? AND target.knowledge_item_id = k.id
       WHERE k.id = ? AND k.status = 'active' LIMIT 1`,
    ).bind(revisionId, knowledgeItemId).first<{ previous_revision_id: string | null }>();
    if (!target || target.previous_revision_id === null) {
      throw new PublicationRepositoryConflictError("rollback_target_invalid");
    }
    if (target.previous_revision_id === revisionId) {
      return { ...(await this.requireRevision(revisionId)), previousRevisionId: revisionId };
    }

    const timestamp = this.now().toISOString();
    const audit: CreateAuditEvent = {
      id: `rollback-${knowledgeItemId}-${revisionId}`,
      actorKind: "member",
      actorId: reviewerId,
      action: "knowledge.rolled_back",
      resourceType: "knowledge",
      resourceId: knowledgeItemId,
      metadata: { fromRevisionId: target.previous_revision_id, toRevisionId: revisionId },
      createdAt: timestamp,
    };
    try {
      await this.db.batch([
        this.db.prepare(
          `UPDATE knowledge_items SET current_revision_id = ?, search_status = 'pending', updated_at = ?
           WHERE id = ? AND current_revision_id = ? AND status = 'active'
             AND EXISTS (SELECT 1 FROM revisions target WHERE target.id = ? AND target.knowledge_item_id = ?)`
        ).bind(revisionId, timestamp, knowledgeItemId, target.previous_revision_id, revisionId, knowledgeItemId),
        this.db.prepare(
          `INSERT INTO audit_events (
             id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at
           ) SELECT ?, 'member', ?, 'knowledge.rolled_back', 'knowledge', ?, ?, ?
           WHERE changes() = 1`
        ).bind(
          audit.id, reviewerId, knowledgeItemId, JSON.stringify(audit.metadata), timestamp,
        ),
        this.db.prepare(
          `UPDATE jobs SET state = 'pending', attempts = 0, available_at = ?,
             last_error_code = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ?
           WHERE kind = 'index_revision' AND resource_id = ? AND state != 'pending'
             AND EXISTS (
               SELECT 1 FROM knowledge_items
               WHERE id = ? AND current_revision_id = ? AND updated_at = ?
             )`
        ).bind(timestamp, timestamp, revisionId, knowledgeItemId, revisionId, timestamp),
      ]);
    } catch (error) {
      const current = await this.db.prepare(
        "SELECT current_revision_id FROM knowledge_items WHERE id = ? LIMIT 1",
      ).bind(knowledgeItemId).first<{ current_revision_id: string | null }>();
      if (current?.current_revision_id === revisionId) {
        return { ...(await this.requireRevision(revisionId)), previousRevisionId: target.previous_revision_id };
      }
      throw error;
    }
    const current = await this.db.prepare(
      "SELECT current_revision_id FROM knowledge_items WHERE id = ? LIMIT 1",
    ).bind(knowledgeItemId).first<{ current_revision_id: string | null }>();
    if (current?.current_revision_id !== revisionId) {
      throw new PublicationRepositoryConflictError("rollback_conflict");
    }
    return { ...(await this.requireRevision(revisionId)), previousRevisionId: target.previous_revision_id };
  }

  async processIndexJob(revisionId: string): Promise<SearchStatus> {
    let job = await this.findIndexJob(revisionId);
    if (!job) throw new Error("Index job not found");
    if (job.state === "completed" || job.state === "failed_terminal") return visibleIndexStatus(job);
    const now = this.now();
    const timestamp = now.toISOString();
    const leaseToken = this.leaseToken();
    const leaseExpiresAt = new Date(now.getTime() + INDEX_LEASE_MS).toISOString();
    const claim = await this.db.prepare(
      `UPDATE jobs SET state = 'running', attempts = attempts + 1, last_error_code = NULL,
         lease_token = ?, lease_expires_at = ?, available_at = ?, updated_at = ?
       WHERE kind = 'index_revision' AND resource_id = ?
         AND available_at <= ?
         AND (state IN ('pending', 'failed_retryable')
           OR (state = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)))
         AND EXISTS (
           SELECT 1 FROM revisions active_revision
           JOIN knowledge_items active_item
             ON active_item.id = active_revision.knowledge_item_id
           LEFT JOIN spaces active_space
             ON active_space.id = active_item.space_id
               AND active_space.status = 'active' AND active_space.kind != 'legacy'
           LEFT JOIN collections active_collection
             ON active_collection.id = active_item.collection_id
               AND active_collection.space_id = active_item.space_id
               AND active_collection.status = 'active'
           WHERE active_revision.id = jobs.resource_id
             AND (
               active_item.status = 'trashed'
               OR active_item.current_revision_id != active_revision.id
               OR (
                 active_item.status = 'active' AND active_space.id IS NOT NULL
                 AND (active_item.collection_id IS NULL OR active_collection.id IS NOT NULL)
               )
             )
         )`,
    ).bind(
      leaseToken, leaseExpiresAt, leaseExpiresAt, timestamp, revisionId, timestamp, timestamp,
    ).run();
    if (claim.meta.changes !== 1) {
      job = await this.findIndexJob(revisionId);
      if (job && (job.state === "completed" || job.state === "failed_terminal")) {
        return visibleIndexStatus(job);
      }
      return job ? visibleIndexStatus(job) : "pending";
    }

    try {
      job = await this.findIndexJob(revisionId);
      if (!job || job.state !== "running" || job.lease_token !== leaseToken) {
        throw new Error("Index job claim was lost");
      }
      if (job.item_status === "trashed") {
        await this.completeRemovedIndexJob(job.knowledge_item_id, revisionId, timestamp, leaseToken, true);
        return "indexed";
      }
      if (job.current_revision_id !== revisionId) {
        await this.completeRemovedIndexJob(job.knowledge_item_id, revisionId, timestamp, leaseToken, false);
        const current = await this.findIndexJob(revisionId);
        return current ? visibleIndexStatus(current) : "pending";
      }
      const revision = await this.db.prepare(
        `SELECT r.id, r.title, r.summary, r.visibility
         FROM revisions r
         WHERE r.id = ? AND r.knowledge_item_id = ? LIMIT 1`,
      ).bind(revisionId, job.knowledge_item_id).first<IndexRevisionRow>();
      if (!revision) throw new Error("Index revision not found");
      const chunks = await this.db.prepare(
        `SELECT rowid AS ftsRowid, id, ordinal, heading_path, start_line, end_line, body,
           search_body AS searchBody, index_field
         FROM chunks WHERE revision_id = ? ORDER BY ordinal ASC LIMIT ?`,
      ).bind(revisionId, MAX_REVISION_CHUNKS + 1).all<IndexChunkRow>();
      if (chunks.results.length === 0 || chunks.results.length > MAX_REVISION_CHUNKS) {
        throw new Error("Index job has invalid chunks");
      }
      const normalizedChunks = chunks.results.map((chunk) => ({
        id: chunk.id,
        ftsRowid: chunk.ftsRowid,
        ordinal: chunk.ordinal,
        headingPath: parseStringArray(chunk.heading_path),
        startLine: chunk.start_line,
        endLine: chunk.end_line,
        body: chunk.body,
        searchBody: chunk.searchBody,
        indexField: chunk.index_field,
      }));
      const tags = await this.indexTagsForRevision(revisionId);
      const document = buildIndexDocument(revision, normalizedChunks, tags);
      const fields = buildIndexChunkFields(normalizedChunks);
      const staleRowids = await this.indexedRowidsForKnowledgeItem(job.knowledge_item_id, revisionId);
      await this.db.batch([
        this.activeIndexTargetGuard(revisionId, leaseToken),
        ...staleRowids.flatMap((rowid) => this.prepareDeleteIndexRows(rowid)),
        ...normalizedChunks.flatMap((chunk) => this.prepareDeleteIndexRows(chunk.ftsRowid)),
        ...fields.map((field, index) => this.db.prepare(
          `INSERT INTO chunks_fts (rowid, chunk_id, title, summary, tags, body, code)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          normalizedChunks[index]!.ftsRowid,
          field.chunkId,
          document.title,
          document.summary,
          document.tags,
          field.body,
          field.code,
        )),
        ...(revision.visibility === "shared" ? fields.map((field, index) => this.db.prepare(
          `INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          normalizedChunks[index]!.ftsRowid,
          field.chunkId,
          document.title,
          document.summary,
          document.tags,
          field.body,
          field.code,
        )) : []),
        this.db.prepare(
          `UPDATE knowledge_items SET search_status = 'indexed', updated_at = ?
           WHERE id = ? AND current_revision_id = ? AND status = 'active'`,
        ).bind(timestamp, job.knowledge_item_id, revisionId),
        this.changeGuard(),
        this.db.prepare(
          `UPDATE jobs SET state = 'completed', last_error_code = NULL,
             lease_token = NULL, lease_expires_at = NULL, updated_at = ?
           WHERE kind = 'index_revision' AND resource_id = ? AND state = 'running' AND lease_token = ?`,
        ).bind(timestamp, revisionId, leaseToken),
        this.changeGuard(),
      ]);
      return "indexed";
    } catch {
      job = await this.findIndexJob(revisionId);
      if (job && (job.state === "completed" || job.state === "failed_terminal")) {
        return visibleIndexStatus(job);
      }
      if (job?.lease_token !== leaseToken) return job ? visibleIndexStatus(job) : "pending";
      const marked = await this.markIndexFailure(revisionId, timestamp, leaseToken);
      job = await this.findIndexJob(revisionId);
      if (!marked) return job ? visibleIndexStatus(job) : "pending";
      return job ? visibleIndexStatus(job) : "search_degraded";
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
         AND available_at <= ?
       ORDER BY available_at ASC, id ASC LIMIT ?`,
    ).bind(this.now().toISOString(), limit).all<{ resource_id: string }>();
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
         r.title, r.tags_json, r.visibility, r.published_by, r.published_at,
         ${visibleCurrentIndexStatusSql} AS search_status
       FROM revisions r JOIN knowledge_items k ON k.id = r.knowledge_item_id
       LEFT JOIN jobs current_index_job
         ON current_index_job.kind = 'index_revision' AND current_index_job.resource_id = k.current_revision_id
       WHERE r.id = ? LIMIT 1`,
    ).bind(revisionId).first<RevisionRow>();
    if (!row) throw new Error("Published revision not found");
    return mapRevision(row);
  }

  private prepareChunk(intent: PublicationIntent, chunk: ChunkDraft, searchTags: string): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO chunks (
        id, revision_id, ordinal, heading_path, start_line, end_line, body,
        search_title, search_tags, search_body, index_field
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      chunk.indexField,
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

  private async activeIndexTags(spaceId: string, tagIds: string[]): Promise<IndexTag[]> {
    if (tagIds.length === 0) return [];
    const placeholders = tagIds.map(() => "?").join(", ");
    const rows = await this.db.prepare(
      `SELECT id, slug, name FROM tags
       WHERE id IN (${placeholders}) AND space_id = ? AND status = 'active'
       ORDER BY id ASC`,
    ).bind(...tagIds, spaceId).all<{ id: string; slug: string; name: string }>();
    if (rows.results.length !== tagIds.length) {
      throw new PublicationRepositoryConflictError("target_invalid");
    }
    return rows.results;
  }

  private async indexTagsForRevision(revisionId: string): Promise<IndexTag[]> {
    const rows = await this.db.prepare(
      `SELECT t.id, t.slug, t.name FROM revision_tags rt
       JOIN tags t ON t.id = rt.tag_id AND t.status = 'active'
       WHERE rt.revision_id = ? ORDER BY t.id ASC LIMIT 21`,
    ).bind(revisionId).all<IndexTag>();
    if (rows.results.length > 20) throw new Error("Index revision has too many tags");
    return rows.results;
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
            id, submission_id, reviewer_id, decision, reason_code, reason, title, visibility, created_at,
            requested_title, requested_space_id, requested_collection_id, requested_visibility,
            final_space_id, final_collection_id, final_visibility, visibility_reason_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
        ).bind(
          `review-${submissionId}`, submissionId, reviewerId, decision, reasonCode, note,
          preview.title, preview.requestedVisibility, timestamp, preview.title,
          preview.requestedSpaceId, preview.requestedCollectionId, preview.requestedVisibility,
        ),
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
      `SELECT j.state, j.attempts, j.lease_token, j.lease_expires_at,
         r.knowledge_item_id, k.current_revision_id, k.status AS item_status, k.search_status
       FROM jobs j
       JOIN revisions r ON r.id = j.resource_id
       JOIN knowledge_items k ON k.id = r.knowledge_item_id
       WHERE j.kind = 'index_revision' AND j.resource_id = ? LIMIT 1`,
    ).bind(revisionId).first<IndexJobRow>();
  }

  private async markIndexFailure(
    revisionId: string,
    timestamp: string,
    leaseToken: string,
  ): Promise<boolean> {
    const rowids = await this.chunkRowidsForRevision(revisionId);
    const corpora = await this.availableIndexCorpora();
    try {
      await this.commitIndexFailure(revisionId, timestamp, leaseToken, rowids, corpora);
      return true;
    } catch (error) {
      const current = await this.findIndexJob(revisionId);
      if (!current || current.state !== "running" || current.lease_token !== leaseToken) return false;
      throw error;
    }
  }

  private async commitIndexFailure(
    revisionId: string,
    timestamp: string,
    leaseToken: string,
    rowids: readonly number[],
    corpora: readonly IndexCorpus[],
  ): Promise<void> {
    await this.db.batch([
      this.indexLeaseGuard(revisionId, leaseToken),
      ...rowids.flatMap((rowid) => this.prepareDeleteIndexRowsForLease(
        rowid, revisionId, leaseToken, corpora,
      )),
      this.db.prepare(
        `UPDATE knowledge_items SET search_status = 'search_degraded', updated_at = ?
         WHERE current_revision_id = ? AND status = 'active'
           AND EXISTS (
             SELECT 1 FROM jobs
             WHERE kind = 'index_revision' AND resource_id = ?
               AND state = 'running' AND lease_token = ?
           )`,
      ).bind(timestamp, revisionId, revisionId, leaseToken),
      this.db.prepare(
        `UPDATE jobs SET
           state = CASE WHEN attempts >= ? THEN 'failed_terminal' ELSE 'failed_retryable' END,
           last_error_code = 'FTS_INDEX_FAILED', lease_token = NULL, lease_expires_at = NULL,
           available_at = ?, updated_at = ?
         WHERE kind = 'index_revision' AND resource_id = ? AND state = 'running' AND lease_token = ?`,
      ).bind(MAX_INDEX_ATTEMPTS, timestamp, timestamp, revisionId, leaseToken),
      this.changeGuard(),
    ]);
  }

  private async completeRemovedIndexJob(
    knowledgeItemId: string,
    revisionId: string,
    timestamp: string,
    leaseToken: string,
    removeAll: boolean,
  ): Promise<void> {
    const rowids = removeAll
      ? await this.indexedRowidsForKnowledgeItem(knowledgeItemId)
      : await this.indexedRowidsForRevision(revisionId);
    await this.db.batch([
      ...rowids.flatMap((rowid) => this.prepareDeleteIndexRows(rowid)),
      this.db.prepare(
        `UPDATE jobs SET state = 'completed', last_error_code = NULL,
           lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE kind = 'index_revision' AND resource_id = ? AND state = 'running' AND lease_token = ?`,
      ).bind(timestamp, revisionId, leaseToken),
      this.changeGuard(),
    ]);
  }

  private async indexedRowidsForKnowledgeItem(
    knowledgeItemId: string,
    excludingRevisionId?: string,
  ): Promise<number[]> {
    const exclusion = excludingRevisionId === undefined ? "" : "AND r.id != ?";
    const bindings = excludingRevisionId === undefined
      ? [knowledgeItemId, MAX_REVISION_CHUNKS + 1]
      : [knowledgeItemId, excludingRevisionId, MAX_REVISION_CHUNKS + 1];
    const rows = await this.db.prepare(
      `SELECT c.rowid AS rowid
       FROM revisions r
       JOIN chunks c ON c.revision_id = r.id
       CROSS JOIN chunks_fts f
       WHERE r.knowledge_item_id = ? ${exclusion} AND f.rowid = c.rowid
       LIMIT ?`,
    ).bind(...bindings).all<{ rowid: number }>();
    return boundedIndexRowids(rows.results);
  }

  private async indexedRowidsForRevision(revisionId: string): Promise<number[]> {
    const rows = await this.db.prepare(
      `SELECT c.rowid AS rowid FROM chunks c
       CROSS JOIN chunks_fts f
       WHERE c.revision_id = ? AND f.rowid = c.rowid
       ORDER BY c.ordinal ASC LIMIT ?`,
    ).bind(revisionId, MAX_REVISION_CHUNKS + 1).all<{ rowid: number }>();
    return boundedIndexRowids(rows.results);
  }

  private async chunkRowidsForRevision(revisionId: string): Promise<number[]> {
    const rows = await this.db.prepare(
      "SELECT rowid FROM chunks WHERE revision_id = ? ORDER BY ordinal ASC LIMIT ?",
    ).bind(revisionId, MAX_REVISION_CHUNKS + 1).all<{ rowid: number }>();
    return boundedIndexRowids(rows.results);
  }

  private prepareDeleteIndexRows(rowid: number): D1PreparedStatement[] {
    return [
      this.db.prepare("DELETE FROM chunks_fts WHERE rowid = ?").bind(rowid),
      this.db.prepare("DELETE FROM chunks_fts_shared WHERE rowid = ?").bind(rowid),
    ];
  }

  private prepareDeleteIndexRowsForLease(
    rowid: number,
    revisionId: string,
    leaseToken: string,
    corpora: readonly IndexCorpus[] = ["chunks_fts", "chunks_fts_shared"],
  ): D1PreparedStatement[] {
    const guardedDelete = (corpus: IndexCorpus) => this.db.prepare(
      `DELETE FROM ${corpus} WHERE rowid = ?
       AND EXISTS (
         SELECT 1 FROM jobs
         WHERE kind = 'index_revision' AND resource_id = ?
           AND state = 'running' AND lease_token = ?
       )`,
    ).bind(rowid, revisionId, leaseToken);
    return corpora.map(guardedDelete);
  }

  private async availableIndexCorpora(): Promise<IndexCorpus[]> {
    const rows = await this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('chunks_fts', 'chunks_fts_shared')",
    ).all<{ name: string }>();
    const found = new Set(rows.results.map((row) => row.name));
    return (["chunks_fts", "chunks_fts_shared"] as const).filter((name) => found.has(name));
  }

  private indexLeaseGuard(revisionId: string, leaseToken: string): D1PreparedStatement {
    return this.db.prepare(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM jobs
         WHERE kind = 'index_revision' AND resource_id = ?
           AND state = 'running' AND lease_token = ?
       ) THEN 1 ELSE json_extract('index-lease-guard', '$') END AS ok`,
    ).bind(revisionId, leaseToken);
  }

  private activeIndexTargetGuard(revisionId: string, leaseToken: string): D1PreparedStatement {
    return this.db.prepare(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM jobs j
         JOIN revisions r ON r.id = j.resource_id
         JOIN knowledge_items k
           ON k.id = r.knowledge_item_id AND k.current_revision_id = r.id AND k.status = 'active'
         JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
         LEFT JOIN collections c
           ON c.id = k.collection_id AND c.space_id = k.space_id AND c.status = 'active'
         WHERE j.kind = 'index_revision' AND j.resource_id = ?
           AND j.state = 'running' AND j.lease_token = ?
           AND (k.collection_id IS NULL OR c.id IS NOT NULL)
       ) THEN 1 ELSE json_extract('active-index-target-guard', '$') END AS ok`,
    ).bind(revisionId, leaseToken);
  }

  private changeGuard(): D1PreparedStatement {
    return this.db.prepare(
      "SELECT CASE WHEN changes() = 1 THEN 1 ELSE json_extract('publication-change-guard', '$') END AS ok",
    );
  }
}

const previewSelect = `SELECT
  s.id AS submission_id, s.submitter_id, s.status, s.requested_space_id, s.requested_collection_id,
  s.requested_visibility,
  s.kind, s.title, s.content AS raw_content, sv.id AS source_version_id, sv.content AS source_content,
  sv.content_sha256, sv.parser_version, sv.parser_schema_version,
  sv.code_language, sv.file_label, sv.line_baseline
FROM submissions s JOIN source_versions sv ON sv.submission_id = s.id`;

const intentSelect = `SELECT
  s.id AS submission_id, s.submitter_id, s.status, s.requested_space_id, s.requested_collection_id,
  s.requested_visibility,
  s.kind, s.title, s.content AS raw_content, sv.id AS source_version_id, sv.content AS source_content,
  sv.content_sha256, sv.parser_version, sv.parser_schema_version,
  sv.code_language, sv.file_label, sv.line_baseline,
  pi.revision_id, pi.knowledge_item_id, pi.reviewer_id, pi.title AS intent_title,
  pi.space_id AS intent_space_id, pi.collection_id AS intent_collection_id,
  pi.visibility, pi.visibility_reason_code, pi.tags_json, pi.normalized_path,
  pi.content_sha256 AS intent_content_sha256,
  pi.state, pi.created_at AS intent_created_at, pi.updated_at AS intent_updated_at
FROM publication_intents pi
JOIN submissions s ON s.id = pi.submission_id
JOIN source_versions sv ON sv.submission_id = s.id`;

function mapPreview(
  row: PreviewRow,
  requestedTarget: ReviewTargetSummary | null,
): ReviewSubmissionSnapshot {
  return {
    submissionId: row.submission_id,
    submitterId: row.submitter_id,
    status: row.status,
    requestedSpaceId: row.requested_space_id,
    requestedCollectionId: row.requested_collection_id,
    requestedVisibility: row.requested_visibility,
    kind: row.kind,
    title: row.title,
    rawContent: row.raw_content,
    requestedTarget,
    sourceVersion: {
      id: row.source_version_id,
      kind: row.kind,
      content: row.source_content,
      contentSha256: row.content_sha256,
      parserVersion: row.parser_version,
      parserSchemaVersion: row.parser_schema_version,
      codeMetadata: row.code_language === null || row.file_label === null
        ? null
        : { language: row.code_language, fileLabel: row.file_label, lineBaseline: row.line_baseline },
    },
  };
}

function mapIntent(row: IntentRow): PublicationIntent {
  const preview = mapPreview(row, null);
  return {
    submissionId: row.submission_id,
    revisionId: row.revision_id,
    knowledgeItemId: row.knowledge_item_id,
    reviewerId: row.reviewer_id,
    title: row.intent_title,
    visibility: row.visibility,
    spaceId: row.intent_space_id || row.requested_space_id,
    collectionId: row.intent_space_id === null ? row.requested_collection_id : row.intent_collection_id,
    tagIds: parseStringArray(row.tags_json),
    ...(row.visibility_reason_code === null ? {} : {
      visibilityReasonCode: row.visibility_reason_code as "admin_visibility_expansion",
    }),
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

function visibleIndexStatus(job: IndexJobRow): SearchStatus {
  if (job.state === "failed_terminal") return "failed";
  if (job.state === "failed_retryable") return "search_degraded";
  if (job.state === "completed") return "indexed";
  return job.search_status === "search_degraded" ? "search_degraded" : "pending";
}

function boundedIndexRowids(rows: Array<{ rowid: number }>): number[] {
  if (rows.length > MAX_REVISION_CHUNKS
    || rows.some((row) => !Number.isSafeInteger(row.rowid) || row.rowid < 1)) {
    throw new Error("Index row mapping is invalid");
  }
  return rows.map((row) => row.rowid);
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

function reviewMetadataAudit(
  intent: PublicationIntent,
  requested: ReviewSubmissionSnapshot,
  createdAt: string,
): CreateAuditEvent | null {
  if (intent.title === requested.title && intent.spaceId === requested.requestedSpaceId
    && intent.collectionId === requested.requestedCollectionId
    && intent.visibility === requested.requestedVisibility) return null;
  return {
    id: `metadata-${intent.revisionId}`,
    actorKind: "member",
    actorId: intent.reviewerId,
    action: "review.metadata_changed",
    resourceType: "submission",
    resourceId: intent.submissionId,
    metadata: {
      requestedTitle: requested.title,
      finalTitle: intent.title,
      requestedSpaceId: requested.requestedSpaceId,
      finalSpaceId: intent.spaceId,
      ...(requested.requestedCollectionId === null ? {} : {
        requestedCollectionId: requested.requestedCollectionId,
      }),
      ...(intent.collectionId === null ? {} : { finalCollectionId: intent.collectionId }),
      requestedVisibility: requested.requestedVisibility,
      finalVisibility: intent.visibility,
    },
    createdAt,
  };
}

function visibilityExpansionAudit(
  intent: PublicationIntent,
  requested: ReviewSubmissionSnapshot,
  createdAt: string,
): CreateAuditEvent | null {
  if (requested.requestedVisibility !== "admin_only" || intent.visibility !== "shared"
    || intent.visibilityReasonCode !== "admin_visibility_expansion") return null;
  return {
    id: `visibility-${intent.revisionId}`,
    actorKind: "member",
    actorId: intent.reviewerId,
    action: "review.visibility_expanded",
    resourceType: "submission",
    resourceId: intent.submissionId,
    metadata: {
      requestedVisibility: "admin_only",
      finalVisibility: "shared",
      reasonCode: "admin_visibility_expansion",
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

function exactIntentOrThrow(
  existing: PublicationIntent,
  reviewerId: string,
  input: PublishSubmissionInput,
): PublicationIntent {
  if (existing.reviewerId !== reviewerId || existing.title !== input.title
    || existing.spaceId !== input.spaceId || existing.collectionId !== input.collectionId
    || existing.visibility !== input.visibility
    || existing.visibilityReasonCode !== input.visibilityReasonCode
    || existing.tagIds.length !== input.tagIds.length
    || ![...existing.tagIds].sort().every((tagId, index) => tagId === [...input.tagIds].sort()[index])) {
    throw new PublicationRepositoryConflictError("intent_mismatch");
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
    && left.visibilityReasonCode === right.visibilityReasonCode
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
  if (chunks.length < 1 || chunks.length > MAX_REVISION_CHUNKS) {
    throw new TypeError("Publication chunks are invalid");
  }
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    if (chunk.ordinal !== index || !["body", "code"].includes(chunk.indexField)
      || chunk.body.trim().length === 0 || chunk.searchBody.trim().length === 0
      || chunk.startLine < 1 || chunk.endLine < chunk.startLine) {
      throw new TypeError("Publication chunks are invalid");
    }
  }
}
