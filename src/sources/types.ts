import type { SubmissionKind } from "../submissions/types";

export interface ParseSourceInput {
  kind: SubmissionKind;
  content: string;
  language?: string;
}

export interface ParsedSource {
  normalizedMarkdown: string;
  contentSha256: string;
  parserVersion: "m1-v1";
  lineCount: number;
}

export interface Source {
  id: string;
  ownerId: string;
  spaceId: string;
  collectionId: string | null;
  kind: SubmissionKind;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceVersion {
  id: string;
  sourceId: string;
  submissionId: string;
  ordinal: number;
  content: string;
  contentSha256: string;
  parserVersion: "m1-v1";
  createdAt: string;
}

export interface DuplicateSourceCandidate {
  submissionId: string;
  sourceId: string;
  sourceVersionId: string;
}
