import type { PublishedContentReceipt, PublishedContentRemover } from "../knowledge/types";
import type { MemberRole, MemberStatus } from "../members/types";
import type { ChunkDraft, SourceLocation } from "../sources/chunker";
import type { SourceVersion } from "../sources/types";
import type { SubmissionKind } from "../submissions/types";
import type { Page, PageRequest } from "../pagination";
import type { SensitiveAdvice } from "./sensitive-advisor";

export type KnowledgeVisibility = "shared" | "admin_only";
export type PublicationIntentState = "pending_content" | "content_written" | "completed" | "failed_terminal";
export type SearchStatus = "pending" | "indexed" | "search_degraded" | "failed";

export interface PublicationReviewer {
  id: string;
  role: MemberRole;
  status: MemberStatus;
}

export interface ReviewMetadataPatch {
  title: string;
  spaceId: string;
  collectionId: string | null;
  visibility: KnowledgeVisibility;
  tagIds: string[];
  /** Optional existing item to update; omission creates the first Revision. */
  knowledgeItemId?: string;
  visibilityReasonCode?: "admin_visibility_expansion";
}

/** Compatibility name for callers that have not yet adopted review terminology. */
export type PublishSubmissionInput = ReviewMetadataPatch;

export interface PublicationSourceVersion extends Pick<SourceVersion,
  "id" | "content" | "contentSha256" | "parserVersion" | "parserSchemaVersion" | "codeMetadata"> {
  kind: SubmissionKind;
}

export interface ReviewTargetSummary {
  space: {
    id: string;
    slug: string;
    name: string;
    status: "active" | "disabled";
  };
  collection: {
    id: string;
    name: string;
    status: "active" | "disabled";
  } | null;
  available: boolean;
}

export interface ReviewSubmissionSnapshot {
  submissionId: string;
  submitterId: string;
  /**
   * Authoritative submission version (`submissions.updated_at`). A decision
   * carries the version it was read at so a stale request becomes a visible
   * conflict instead of overwriting a newer state.
   */
  updatedAt: string;
  status: "review_pending" | "published" | "rejected" | "revision_requested";
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  requestedVisibility: KnowledgeVisibility;
  kind: SubmissionKind;
  title: string;
  rawContent: string;
  sourceVersion: PublicationSourceVersion;
  requestedTarget: ReviewTargetSummary | null;
}

export interface ReviewChunkPreview {
  headingPath: string[];
  startLine: number;
  endLine: number;
  location?: SourceLocation;
  excerpt: string;
}

export interface ReviewPreview extends ReviewSubmissionSnapshot {
  chunks: ReviewChunkPreview[];
  safety: SensitiveAdvice;
}

export interface PublicationIntent {
  submissionId: string;
  revisionId: string;
  knowledgeItemId: string;
  reviewerId: string;
  title: string;
  visibility: KnowledgeVisibility;
  spaceId: string;
  collectionId: string | null;
  tagIds: string[];
  visibilityReasonCode?: "admin_visibility_expansion";
  normalizedPath: string;
  contentSha256: string;
  state: PublicationIntentState;
  sourceVersion: PublicationSourceVersion;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedRevision {
  id: string;
  knowledgeItemId: string;
  sourceVersionId: string;
  normalizedPath: string;
  contentSha256: string;
  title: string;
  tagIds: string[];
  visibility: KnowledgeVisibility;
  publishedBy: string;
  publishedAt: string;
  searchStatus: SearchStatus;
}

export interface ChunkRebuildMapping {
  ordinal: number;
  expectedId: string;
  existingId: string | null;
  parentExpectedId: string | null;
  existingStatus: "active" | "disabled" | null;
}

export interface ChunkRebuildReport {
  revisionId: string;
  sourceVersionId: string;
  contentSha256: string;
  chunkCount: number;
  unchanged: boolean;
  mappings: ChunkRebuildMapping[];
}

export interface RollbackResult extends PublishedRevision {
  previousRevisionId: string;
}

export interface GovernedKnowledgeItem {
  id: string;
  spaceId: string;
  collectionId: string | null;
  revisionId: string;
  title: string;
  visibility: KnowledgeVisibility;
  publishedAt: string;
  status: "active" | "trashed";
  searchStatus: SearchStatus;
  updatedAt: string;
}

export type GovernedKnowledgePage = Page<GovernedKnowledgeItem>;

/**
 * The recycle bin's retained-window facts for one trashed item. `trashedAt` is
 * the item's own lifecycle timestamp — the exact anchor the purge path compares
 * against the retention cutoff — so the surface never has to guess a window.
 */
export interface TrashedKnowledgeRetention {
  trashedAt: string;
  purgeEligibleAt: string;
  purgeable: boolean;
}

export type RejectionReasonCode = "not_relevant" | "duplicate" | "unsafe";

/**
 * The client identity of one review decision: the operation number the client
 * keeps across a lost response, the submission version it was read at, and the
 * content hash that makes a reused number with different content a conflict.
 */
export interface ReviewDecisionOperation {
  operationId: string;
  expectedVersion: string | undefined;
  requestHash: string;
}

export type DecisionReceiptKind = "review.publish" | "review.reject" | "review.request_revision";

export interface DecisionReceipt {
  requestHash: string;
  responseJson: string;
}

export interface DecisionReceiptWrite {
  submissionId: string;
  kind: DecisionReceiptKind;
  actorId: string;
  operation: ReviewDecisionOperation;
}

/** The four administrator writes that change a knowledge item's lifecycle. */
export type KnowledgeLifecycleOperationKind =
  | "knowledge.trash"
  | "knowledge.restore"
  | "knowledge.purge"
  | "knowledge.rollback";

/**
 * The client identity of one lifecycle write. Every write names the knowledge
 * item in its path and nothing else (rollback additionally names the target
 * revision), so the number alone is enough to replay the recorded answer.
 */
export interface KnowledgeLifecycleOperation {
  operationId: string;
  requestHash: string;
}

export interface LifecycleReceiptWrite {
  knowledgeItemId: string;
  kind: KnowledgeLifecycleOperationKind;
  actorId: string;
  operation: KnowledgeLifecycleOperation;
}

export interface ReviewDecision {
  submissionId: string;
  reviewerId: string;
  decision: "rejected" | "revision_requested";
  reasonCode: RejectionReasonCode | "needs_revision";
  note: string;
  title: string;
  visibility: KnowledgeVisibility;
  createdAt: string;
}

/**
 * The client identity of one batch item, carried inside the action. Both fields
 * are optional (an action without them keeps the legacy natural identity) and
 * must appear together, exactly like a single decision.
 */
export interface BatchReviewActionIdentity {
  operationId?: string;
  expectedUpdatedAt?: string;
}

export type BatchReviewAction =
  | ({ submissionId: string; action: "publish" } & PublishSubmissionInput & BatchReviewActionIdentity)
  | ({ submissionId: string; action: "reject"; reasonCode: RejectionReasonCode; note: string } & BatchReviewActionIdentity)
  | ({ submissionId: string; action: "request_revision"; reasonCode: "needs_revision"; note: string } & BatchReviewActionIdentity);

export type BatchReviewItem =
  | { submissionId: string; action: BatchReviewAction["action"]; status: "succeeded"; result: PublishedRevision | ReviewDecision }
  | { submissionId: string; action: BatchReviewAction["action"]; status: "failed"; error: { code: string; status: number; retryable: boolean } };

export interface BatchReviewResult {
  requested: number;
  succeeded: number;
  failed: number;
  items: BatchReviewItem[];
}

export interface PublicationRepositoryPort {
  getPreview(submissionId: string): Promise<ReviewSubmissionSnapshot | null>;
  validateTarget(input: PublishSubmissionInput): Promise<void>;
  createOrReadIntent(
    submissionId: string,
    reviewerId: string,
    input: PublishSubmissionInput,
    operation?: ReviewDecisionOperation,
  ): Promise<PublicationIntent>;
  markContentWritten(submissionId: string, receipt: PublishedContentReceipt): Promise<void>;
  markIntentFailedTerminal(submissionId: string): Promise<void>;
  finalize(intent: PublicationIntent, chunks: ChunkDraft[]): Promise<PublishedRevision>;
  rollback(knowledgeItemId: string, revisionId: string, reviewerId: string): Promise<RollbackResult>;
  trash(knowledgeItemId: string, reviewerId: string): Promise<GovernedKnowledgeItem>;
  restore(knowledgeItemId: string, reviewerId: string): Promise<GovernedKnowledgeItem>;
  listTrashed(request: PageRequest): Promise<GovernedKnowledgePage>;
  preparePurge(knowledgeItemId: string, cutoff: string): Promise<PurgePlan | { alreadyPurged: true }>;
  finalizePurge(plan: PurgePlan, reviewerId: string): Promise<PurgeResult>;
  processIndexJob(revisionId: string): Promise<SearchStatus>;
  rebuildChunkReport(revisionId: string): Promise<ChunkRebuildReport | null>;
  reject(
    submissionId: string,
    reviewerId: string,
    input: { reasonCode: RejectionReasonCode; note: string },
    operation?: ReviewDecisionOperation,
  ): Promise<ReviewDecision>;
  requestRevision(
    submissionId: string,
    reviewerId: string,
    input: { reasonCode: "needs_revision"; note: string },
    operation?: ReviewDecisionOperation,
  ): Promise<ReviewDecision>;
  findDecisionReceipt(submissionId: string, operationId: string): Promise<DecisionReceipt | null>;
  recordDecisionReceipt<T extends PublishedRevision | ReviewDecision>(
    write: DecisionReceiptWrite,
    response: T,
  ): Promise<T>;
  findLifecycleReceipt(knowledgeItemId: string, operationId: string): Promise<DecisionReceipt | null>;
  recordLifecycleReceipt<T extends GovernedKnowledgeItem | RollbackResult | PurgeResult>(
    write: LifecycleReceiptWrite,
    response: T,
  ): Promise<T>;
  listPendingIntents(limit: number): Promise<PublicationIntent[]>;
  listRecoverableIndexRevisionIds(limit: number): Promise<string[]>;
}

export interface PublishedContentCommitter {
  commit(input: {
    spaceId: string;
    knowledgeItemId: string;
    revisionId: string;
    contentSha256: string;
    markdown: string;
  }): Promise<PublishedContentReceipt>;
}

export interface PurgePlan {
  knowledgeItemId: string;
  currentRevisionId: string;
  revisionIds: string[];
  contentPaths: string[];
  sourceVersionIds: string[];
  sourceIds: string[];
  submissionIds: string[];
  trashedAt: string;
}

export interface PurgeResult {
  knowledgeItemId: string;
  status: "purged";
  purgedRevisionCount: number;
  alreadyPurged?: boolean;
}

export type { PublishedContentRemover };

export interface PublicationRecoveryFailure {
  resourceId: string;
  code: "PUBLICATION_RECOVERY_FAILED" | "INDEX_RECOVERY_FAILED";
}

export interface PublicationRecoveryResult {
  recoveredIntents: number;
  recoveredIndexJobs: number;
  failures: PublicationRecoveryFailure[];
}
