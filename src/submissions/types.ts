import type { NumberedPage, NumberedPageRequest, Page, PageRequest } from "../pagination";
import type { DuplicateSourceCandidate, SimilarSourceCandidate, Source, SourceVersion } from "../sources/types";

export type SubmissionKind = "text" | "markdown" | "code";
export type SubmissionStatusFilter = "draft" | "review_pending" | "published" | "rejected" | "revision_requested";
export type SubmissionStatus = "draft" | SubmissionStatusFilter;

export type SubmissionReviewDecision = "rejected" | "revision_requested";
export type SubmissionReviewReasonCode = "not_relevant" | "duplicate" | "unsafe" | "needs_revision";

/** The only review data an owner may see on their own submission history. */
export interface SubmissionReview {
  decision: SubmissionReviewDecision;
  reasonCode: SubmissionReviewReasonCode;
  note: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  submitterId: string;
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  requestedVisibility: "shared" | "admin_only";
  kind: SubmissionKind;
  status: SubmissionStatus;
  title: string;
  content: string;
  /** Set when a successfully parsed private asset is atomically paired. */
  assetId?: string | null;
  /** Set only for an immutable resubmission of a prior terminal Submission. */
  supersedesSubmissionId?: string | null;
  review?: SubmissionReview;
  createdAt: string;
  updatedAt: string;
}

export type CreateSubmission = Submission;
export type SubmissionCreateResult =
  | { submission: Submission; source: Source; sourceVersion: SourceVersion; duplicateCandidate: null; similarCandidates?: readonly SimilarSourceCandidate[] }
  | { submission: Submission; source: null; sourceVersion: null; duplicateCandidate: DuplicateSourceCandidate; similarCandidates?: readonly SimilarSourceCandidate[] };
export type SubmissionPage = (NumberedPage<Submission> & { nextCursor?: undefined }) | (Page<Submission> & { pagination?: undefined });
export type SubmissionReviewPage = NumberedPage<Submission>;
export type SubmissionReviewPageRequest = NumberedPageRequest;
export interface SubmissionPageRequest extends Partial<NumberedPageRequest> {
  limit?: number;
  cursor?: string;
  status?: SubmissionStatusFilter;
}
export interface SubmissionPageRepositoryRequest extends NumberedPageRequest {
  status?: SubmissionStatusFilter;
}
