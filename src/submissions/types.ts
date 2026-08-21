import type { Page, PageRequest } from "../pagination";
import type { DuplicateSourceCandidate, Source, SourceVersion } from "../sources/types";

export type SubmissionKind = "text" | "markdown" | "code";
export type SubmissionStatus = "review_pending";

export interface Submission {
  id: string;
  submitterId: string;
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  kind: SubmissionKind;
  status: SubmissionStatus;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateSubmission = Submission;
export type SubmissionCreateResult =
  | { submission: Submission; source: Source; sourceVersion: SourceVersion; duplicateCandidate: null }
  | { submission: null; source: null; sourceVersion: null; duplicateCandidate: DuplicateSourceCandidate };
export type SubmissionPage = Page<Submission>;
export type SubmissionPageRequest = PageRequest;
