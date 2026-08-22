import type { SubmissionKind } from "../submissions/types";

export type ParserSchemaVersion = "m1-v1" | "m1-v2";

export interface CodeSourceMetadata {
  language: string;
  fileLabel: string;
  lineBaseline: number;
}

export interface ParseSourceInput {
  kind: SubmissionKind;
  content: string;
  language?: string;
  fileLabel?: string;
  lineBaseline?: number;
}

export interface ParsedSource {
  normalizedMarkdown: string;
  contentSha256: string;
  parserVersion: "m1-v1";
  parserSchemaVersion: "m1-v2";
  sourceIdentitySha256: string;
  warnings: string[];
  codeMetadata: CodeSourceMetadata | null;
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
  /** Present for M1-v2 source creation; NULL is retained for pre-0004 rows. */
  sourceIdentitySha256?: string | null;
  parserSchemaVersion?: ParserSchemaVersion;
  codeMetadata?: CodeSourceMetadata | null;
  createdAt: string;
}

export interface DuplicateSourceCandidate {
  submissionId: string;
  sourceId: string;
  sourceVersionId: string;
}
