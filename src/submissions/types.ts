import type { Page, PageRequest } from "../pagination";

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
export type SubmissionPage = Page<Submission>;
export type SubmissionPageRequest = PageRequest;
