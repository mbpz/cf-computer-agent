import type { Page, PageRequest } from "../pagination";

export type DuplicateDecision = "associate" | "keep_separate" | "reject";

export interface DuplicateCandidate {
  submissionId: string;
  canonicalSubmissionId: string;
  canonicalSourceId: string;
  canonicalSourceVersionId: string;
  submissionTitle: string;
  canonicalTitle: string;
  decision: "pending" | DuplicateDecision;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

export type DuplicateCandidatePage = Page<DuplicateCandidate>;
export type DuplicateCandidatePageRequest = PageRequest;
