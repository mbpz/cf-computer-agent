import type { PublishedContentReceipt } from "../knowledge/types";
import type { MemberRole, MemberStatus } from "../members/types";
import type { ChunkDraft } from "../sources/chunker";
import type { SourceVersion } from "../sources/types";
import type { SubmissionKind } from "../submissions/types";

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
  visibilityReasonCode?: "admin_visibility_expansion";
}

/** Compatibility name for callers that have not yet adopted review terminology. */
export type PublishSubmissionInput = ReviewMetadataPatch;

export interface PublicationSourceVersion extends Pick<SourceVersion,
  "id" | "content" | "contentSha256" | "parserVersion"> {
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
  status: "review_pending" | "published" | "rejected" | "revision_requested";
  requestedSpaceId: string;
  requestedCollectionId: string | null;
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
  excerpt: string;
}

export interface ReviewPreview extends ReviewSubmissionSnapshot {
  chunks: ReviewChunkPreview[];
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

export type RejectionReasonCode = "not_relevant" | "duplicate" | "unsafe";

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

export interface PublicationRepositoryPort {
  getPreview(submissionId: string): Promise<ReviewSubmissionSnapshot | null>;
  validateTarget(input: PublishSubmissionInput): Promise<void>;
  createOrReadIntent(
    submissionId: string,
    reviewerId: string,
    input: PublishSubmissionInput,
  ): Promise<PublicationIntent>;
  markContentWritten(submissionId: string, receipt: PublishedContentReceipt): Promise<void>;
  markIntentFailedTerminal(submissionId: string): Promise<void>;
  finalize(intent: PublicationIntent, chunks: ChunkDraft[]): Promise<PublishedRevision>;
  processIndexJob(revisionId: string): Promise<"indexed" | "search_degraded">;
  reject(
    submissionId: string,
    reviewerId: string,
    input: { reasonCode: RejectionReasonCode; note: string },
  ): Promise<ReviewDecision>;
  requestRevision(
    submissionId: string,
    reviewerId: string,
    input: { reasonCode: "needs_revision"; note: string },
  ): Promise<ReviewDecision>;
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

export interface PublicationRecoveryFailure {
  resourceId: string;
  code: "PUBLICATION_RECOVERY_FAILED" | "INDEX_RECOVERY_FAILED";
}

export interface PublicationRecoveryResult {
  recoveredIntents: number;
  recoveredIndexJobs: number;
  failures: PublicationRecoveryFailure[];
}
