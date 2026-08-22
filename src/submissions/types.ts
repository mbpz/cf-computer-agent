import type { Page, PageRequest } from "../pagination";
import type { DuplicateSourceCandidate, Source, SourceVersion } from "../sources/types";

export type SubmissionKind = "text" | "markdown" | "code";
export type SubmissionStatusFilter = "review_pending" | "published" | "rejected" | "revision_requested";
export type SubmissionStatus = "draft" | SubmissionStatusFilter;

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
  /** Set only for an immutable resubmission of a prior terminal Submission. */
  supersedesSubmissionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateSubmission = Submission;
export type SubmissionCreateResult =
  | { submission: Submission; source: Source; sourceVersion: SourceVersion; duplicateCandidate: null }
  | { submission: null; source: null; sourceVersion: null; duplicateCandidate: DuplicateSourceCandidate };
export type SubmissionPage = Page<Submission>;
export interface SubmissionPageRequest {
  limit?: number;
  cursor?: string;
  status?: SubmissionStatusFilter;
}
export interface SubmissionPageRepositoryRequest extends PageRequest {
  status?: SubmissionStatusFilter;
  cursorKey: string;
}
