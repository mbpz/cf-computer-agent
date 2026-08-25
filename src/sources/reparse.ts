import { AppError } from "../http";
import { APP_CONFIG } from "../config";
import { parseSource } from "./parser";
import { hasSemanticSourceContent } from "./limits";
import type { CodeSourceMetadata, SourceVersion } from "./types";
import type { SubmissionKind } from "../submissions/types";

export const REPARSE_PARSER_CONTRACT = Object.freeze({
  parserVersion: "m2-v1" as const,
  parserSchemaVersion: "m2-v1" as const,
});

export interface ReparseCandidate extends Omit<SourceVersion, "parserVersion" | "parserSchemaVersion"> {
  parserVersion: "m2-v1";
  parserSchemaVersion: "m2-v1";
  sourceFingerprint: string;
  lineCount: number;
}

export interface ReparseCandidateOptions {
  id: string;
  createdAt: string;
  kind: SubmissionKind;
}

/**
 * Build an immutable candidate for a future source-version write.
 *
 * This intentionally has no repository side effects: callers can persist the
 * candidate behind a queued/processing job and leave a published Revision
 * pointing at its original sourceVersionId until an administrator publishes
 * the candidate as a new Revision.
 */
export async function buildReparseCandidate(
  source: SourceVersion,
  options: ReparseCandidateOptions,
): Promise<ReparseCandidate> {
  assertCandidateInput(source, options);
  const content = await replayNormalizedSource(source, options.kind);
  const sourceFingerprint = await sourceReparseFingerprint(source);
  const candidate: ReparseCandidate = {
    id: options.id,
    sourceId: source.sourceId,
    submissionId: source.submissionId,
    ordinal: source.ordinal + 1,
    content: content.normalizedMarkdown,
    contentSha256: content.contentSha256,
    parserVersion: REPARSE_PARSER_CONTRACT.parserVersion,
    parserSchemaVersion: REPARSE_PARSER_CONTRACT.parserSchemaVersion,
    sourceIdentitySha256: content.sourceIdentitySha256,
    codeMetadata: content.codeMetadata,
    createdAt: options.createdAt,
    sourceFingerprint,
    lineCount: content.lineCount,
  };
  return candidate;
}

export async function buildManualReparseCandidate(
  source: SourceVersion,
  options: ReparseCandidateOptions & { normalizedMarkdown: string },
): Promise<ReparseCandidate> {
  assertCandidateInput(source, options);
  if (typeof options.normalizedMarkdown !== "string"
    || options.normalizedMarkdown.includes("\0")
    || hasMalformedSurrogate(options.normalizedMarkdown)) {
    throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
  }
  const bytes = new TextEncoder().encode(options.normalizedMarkdown);
  if (bytes.byteLength > APP_CONFIG.maxParsedAssetOutputBytes) {
    throw new AppError("SOURCE_TOO_LARGE", "Source content exceeds the limit", 400);
  }
  if (!hasSemanticSourceContent(options.kind, options.normalizedMarkdown)) {
    throw new AppError("SOURCE_EMPTY", "Source content is empty", 400);
  }
  // Reuse the canonical Markdown safety gates before persisting an edited
  // candidate; the candidate is still immutable input to the later publish.
  await parseSource({ kind: "markdown", content: options.normalizedMarkdown });
  const content = options.normalizedMarkdown.endsWith("\n")
    ? options.normalizedMarkdown
    : `${options.normalizedMarkdown}\n`;
  const [digest, identity] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([
      "m2-manual-correction-v1", options.kind, content, source.codeMetadata ?? null,
    ]))),
  ]);
  return {
    id: options.id,
    sourceId: source.sourceId,
    submissionId: source.submissionId,
    ordinal: source.ordinal + 1,
    content,
    contentSha256: hex(digest),
    parserVersion: REPARSE_PARSER_CONTRACT.parserVersion,
    parserSchemaVersion: REPARSE_PARSER_CONTRACT.parserSchemaVersion,
    sourceIdentitySha256: hex(identity),
    codeMetadata: source.codeMetadata ?? null,
    createdAt: options.createdAt,
    sourceFingerprint: "",
    lineCount: countLines(content),
  };
}

export async function sourceReparseFingerprint(source: SourceVersion): Promise<string> {
  return sha256(JSON.stringify([
    "m2-reparse-source-v1",
    source.id,
    source.contentSha256,
    source.sourceIdentitySha256 ?? null,
    REPARSE_PARSER_CONTRACT.parserVersion,
    REPARSE_PARSER_CONTRACT.parserSchemaVersion,
    source.codeMetadata ?? null,
  ]));
}

async function replayNormalizedSource(source: SourceVersion, kind: SubmissionKind) {
  if (kind !== "code") {
    if (source.content.includes("\0") || /[\uD800-\uDFFF]/u.test(source.content)) {
      throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
    }
    return {
      normalizedMarkdown: source.content,
      contentSha256: source.contentSha256,
      sourceIdentitySha256: source.sourceIdentitySha256 ?? source.contentSha256,
      codeMetadata: null as CodeSourceMetadata | null,
      lineCount: countLines(source.content),
    };
  }
  const metadata = source.codeMetadata;
  if (!metadata) throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
  const match = /^(?<fence>`{3,})[^\n]*\n(?<body>[\s\S]*?)\n\k<fence>\n$/u.exec(source.content);
  if (!match?.groups?.body) throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
  const parsed = await parseSource({
    kind,
    content: match.groups.body,
    language: metadata.language,
    fileLabel: metadata.fileLabel,
    lineBaseline: metadata.lineBaseline,
  });
  return parsed;
}

function assertCandidateInput(source: SourceVersion, options: ReparseCandidateOptions): void {
  if (!source || typeof source.id !== "string" || !source.id
    || typeof source.sourceId !== "string" || !source.sourceId
    || typeof source.submissionId !== "string" || !source.submissionId
    || !Number.isSafeInteger(source.ordinal) || source.ordinal < 1
    || typeof source.content !== "string" || !source.content
    || typeof options.id !== "string" || !options.id
    || typeof options.createdAt !== "string" || !options.createdAt
    || (options.kind !== "text" && options.kind !== "markdown" && options.kind !== "code")) {
    throw new AppError("SOURCE_REPARSE_INVALID", "Source reparse input is invalid", 400);
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function countLines(content: string): number {
  const withoutTerminalNewline = content.endsWith("\n") ? content.slice(0, -1) : content;
  return withoutTerminalNewline.split("\n").length;
}

function hasMalformedSurrogate(content: string): boolean {
  for (let index = 0; index < content.length; index += 1) {
    const unit = content.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = content.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}
