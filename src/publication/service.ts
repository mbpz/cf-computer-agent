import { AppError } from "../http";
import { chunkDocument } from "../sources/chunker";
import { hasSemanticSourceContent, MAX_REVISION_CHUNKS } from "../sources/limits";
import type { ChunkDraft } from "../sources/chunker";
import type {
  KnowledgeVisibility,
  PublicationIntent,
  PublicationRecoveryResult,
  PublicationRepositoryPort,
  PublicationReviewer,
  PublishedContentCommitter,
  PublishedRevision,
  PublishSubmissionInput,
  RejectionReasonCode,
  ReviewDecision,
  ReviewPreview,
  ReviewSubmissionSnapshot,
} from "./types";

const MAX_TITLE_CODE_POINTS = 200;
const MAX_TITLE_BYTES = 512;
const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_REVIEW_NOTE_BYTES = 4_000;
const MAX_TAGS = 20;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

export class PublicationService {
  constructor(
    private readonly repository: PublicationRepositoryPort,
    private readonly content: PublishedContentCommitter,
  ) {}

  async preview(reviewer: PublicationReviewer, submissionId: string): Promise<ReviewPreview> {
    requireActiveAdmin(reviewer);
    const preview = await this.repository.getPreview(requireId(submissionId));
    if (!preview) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    const chunks = await validatedPublicationChunks(preview);
    return { ...preview, chunks: reviewChunkPreviews(chunks) };
  }

  async publish(
    reviewer: PublicationReviewer,
    submissionId: string,
    input: PublishSubmissionInput,
  ): Promise<PublishedRevision> {
    requireActiveAdmin(reviewer);
    const stableSubmissionId = requireId(submissionId);
    const normalized = normalizePublishInput(input);
    const preview = await this.repository.getPreview(stableSubmissionId);
    if (!preview) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    const expandsVisibility = preview.requestedVisibility === "admin_only" && normalized.visibility === "shared";
    if (expandsVisibility && normalized.visibilityReasonCode !== "admin_visibility_expansion") {
      throw new AppError(
        "PUBLICATION_VISIBILITY_EXPANSION_CONFIRMATION_REQUIRED",
        "Expanding requested visibility requires explicit administrator confirmation",
        400,
      );
    }
    if (!expandsVisibility && normalized.visibilityReasonCode !== undefined) throw invalidPublicationInput();
    try {
      await this.repository.validateTarget(normalized);
    } catch (error) {
      throwPublicationError(error);
    }
    const chunks = await validatedPublicationChunks(preview);
    let intent: PublicationIntent;
    try {
      intent = await this.repository.createOrReadIntent(stableSubmissionId, reviewer.id, normalized);
    } catch (error) {
      throwPublicationError(error);
    }
    assertStableIntent(intent, preview, reviewer.id, normalized);
    return this.resumeIntent(intent, chunks);
  }

  async reject(
    reviewer: PublicationReviewer,
    submissionId: string,
    input: { reasonCode: RejectionReasonCode; note: string },
  ): Promise<ReviewDecision> {
    requireActiveAdmin(reviewer);
    if (!isRejectionReason(input?.reasonCode)) throw invalidDecision();
    try {
      return await this.repository.reject(requireId(submissionId), reviewer.id, {
        reasonCode: input.reasonCode,
        note: normalizeReviewNote(input.note),
      });
    } catch (error) {
      throwDecisionError(error);
    }
  }

  async requestRevision(
    reviewer: PublicationReviewer,
    submissionId: string,
    input: { reasonCode: "needs_revision"; note: string },
  ): Promise<ReviewDecision> {
    requireActiveAdmin(reviewer);
    if (input?.reasonCode !== "needs_revision") throw invalidDecision();
    try {
      return await this.repository.requestRevision(requireId(submissionId), reviewer.id, {
        reasonCode: "needs_revision",
        note: normalizeReviewNote(input.note),
      });
    } catch (error) {
      throwDecisionError(error);
    }
  }

  async rollback(
    reviewer: PublicationReviewer,
    knowledgeItemId: string,
    revisionId: string,
  ): Promise<PublishedRevision> {
    requireActiveAdmin(reviewer);
    const itemId = requireId(knowledgeItemId);
    const targetRevisionId = requireId(revisionId);
    let result;
    try {
      result = await this.repository.rollback(itemId, targetRevisionId, reviewer.id);
    } catch (error) {
      if (isRepositoryConflict(error, "rollback_target_invalid")) {
        throw new AppError("ROLLBACK_TARGET_INVALID", "Revision does not belong to an active knowledge item", 400);
      }
      if (isRepositoryConflict(error, "rollback_conflict")) {
        throw new AppError("ROLLBACK_STATE_CONFLICT", "Knowledge item changed during rollback", 409);
      }
      throw error;
    }
    const searchStatus = await this.repository.processIndexJob(result.id);
    return { ...result, searchStatus };
  }

  async recoverPending(limit: number): Promise<PublicationRecoveryResult> {
    const boundedLimit = normalizeRecoveryLimit(limit);
    const result: PublicationRecoveryResult = {
      recoveredIntents: 0,
      recoveredIndexJobs: 0,
      failures: [],
    };
    const intents = await this.repository.listPendingIntents(boundedLimit);
    const attemptedRevisionIds = new Set<string>();
    for (const intent of intents) {
      let chunks: ChunkDraft[];
      try {
        chunks = await validatedPublicationChunks(intent);
      } catch (error) {
        if (isPublicationContentMismatch(error)) {
          try {
            await this.repository.markIntentFailedTerminal(intent.submissionId);
          } catch {
            // A failed terminal-state write remains recoverable for a later run.
          }
        }
        result.failures.push({ resourceId: intent.submissionId, code: "PUBLICATION_RECOVERY_FAILED" });
        continue;
      }
      try {
        const revision = await this.resumeIntent(intent, chunks);
        attemptedRevisionIds.add(revision.id);
        if (revision.searchStatus === "indexed") result.recoveredIntents += 1;
        else result.failures.push({ resourceId: revision.id, code: "INDEX_RECOVERY_FAILED" });
      } catch {
        result.failures.push({ resourceId: intent.submissionId, code: "PUBLICATION_RECOVERY_FAILED" });
      }
    }

    const remaining = Math.max(0, boundedLimit - intents.length);
    if (remaining === 0) return result;
    const revisionIds = (await this.repository.listRecoverableIndexRevisionIds(remaining))
      .filter((revisionId) => !attemptedRevisionIds.has(revisionId));
    for (const revisionId of revisionIds) {
      try {
        const status = await this.repository.processIndexJob(revisionId);
        if (status === "indexed") result.recoveredIndexJobs += 1;
        else result.failures.push({ resourceId: revisionId, code: "INDEX_RECOVERY_FAILED" });
      } catch {
        result.failures.push({ resourceId: revisionId, code: "INDEX_RECOVERY_FAILED" });
      }
    }
    return result;
  }

  private async resumeIntent(intent: PublicationIntent, chunks: ChunkDraft[]): Promise<PublishedRevision> {
    if (intent.state === "failed_terminal") throw publicationContentMismatch();

    if (intent.state === "pending_content") {
      const receipt = await this.content.commit({
        spaceId: intent.spaceId,
        knowledgeItemId: intent.knowledgeItemId,
        revisionId: intent.revisionId,
        contentSha256: intent.contentSha256,
        markdown: intent.sourceVersion.content,
      });
      assertReceipt(intent, receipt);
      await this.repository.markContentWritten(intent.submissionId, receipt);
      intent.state = "content_written";
    }

    const revision = await this.repository.finalize(intent, chunks);
    const searchStatus = await this.repository.processIndexJob(revision.id);
    return { ...revision, searchStatus };
  }
}

function requireActiveAdmin(reviewer: PublicationReviewer): void {
  if (!reviewer || typeof reviewer.id !== "string" || reviewer.id.length === 0
    || reviewer.role !== "admin" || reviewer.status !== "active") {
    throw new AppError("FORBIDDEN", "Active administrator access required", 403);
  }
}

function requireId(value: string): string {
  if (typeof value !== "string" || value.length === 0 || CONTROL_CHARACTERS.test(value)) {
    throw new AppError("PUBLICATION_INPUT_INVALID", "Publication input is invalid", 400);
  }
  return value;
}

function normalizePublishInput(input: PublishSubmissionInput): PublishSubmissionInput {
  if (!input || typeof input !== "object") throw invalidPublicationInput();
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || [...title].length > MAX_TITLE_CODE_POINTS
    || new TextEncoder().encode(title).byteLength > MAX_TITLE_BYTES
    || CONTROL_CHARACTERS.test(title) || hasMalformedSurrogate(title)
    || !isVisibility(input.visibility)
    || !isBoundedId(input.spaceId)
    || (input.collectionId !== null && !isBoundedId(input.collectionId))
    || !Array.isArray(input.tagIds) || input.tagIds.length > MAX_TAGS
    || input.tagIds.some((tagId) => !isBoundedId(tagId))
    || new Set(input.tagIds).size !== input.tagIds.length
    || (input.visibilityReasonCode !== undefined
      && input.visibilityReasonCode !== "admin_visibility_expansion")) {
    throw invalidPublicationInput();
  }
  return {
    title, visibility: input.visibility, spaceId: input.spaceId, collectionId: input.collectionId,
    tagIds: [...input.tagIds].sort(),
    ...(input.visibilityReasonCode === undefined ? {} : { visibilityReasonCode: input.visibilityReasonCode }),
  };
}

function normalizeReviewNote(value: string): string {
  if (typeof value !== "string" || CONTROL_CHARACTERS.test(value) || hasMalformedSurrogate(value)
    || new TextEncoder().encode(value).byteLength > MAX_REVIEW_NOTE_BYTES) {
    throw invalidDecision();
  }
  return value.trim();
}

function assertStableIntent(
  intent: PublicationIntent,
  preview: ReviewSubmissionSnapshot,
  reviewerId: string,
  input: PublishSubmissionInput,
): void {
  if (intent.submissionId !== preview.submissionId
    || intent.reviewerId !== reviewerId
    || intent.title !== input.title
    || intent.visibility !== input.visibility
    || intent.spaceId !== input.spaceId
    || intent.collectionId !== input.collectionId
    || intent.visibilityReasonCode !== input.visibilityReasonCode
    || !sameStrings(intent.tagIds, input.tagIds)) {
    throw new AppError("PUBLICATION_STATE_CONFLICT", "Publication intent does not match the original review", 409);
  }
  if (intent.sourceVersion.id !== preview.sourceVersion.id
    || intent.sourceVersion.contentSha256 !== preview.sourceVersion.contentSha256
    || intent.sourceVersion.content !== preview.sourceVersion.content
    || intent.contentSha256 !== intent.sourceVersion.contentSha256) {
    throw new AppError("PUBLICATION_CONTENT_MISMATCH", "Publication content does not match the stable intent", 409);
  }
}

function reviewChunkPreviews(chunks: ChunkDraft[]) {
  return chunks.map((chunk) => ({
    headingPath: [...chunk.headingPath],
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    excerpt: [...chunk.body].slice(0, 240).join(""),
  }));
}

async function assertSourceVersion(
  sourceVersion: ReviewSubmissionSnapshot["sourceVersion"],
  expectedSha256: string,
): Promise<void> {
  if (sourceVersion.parserVersion !== "m1-v1"
    || expectedSha256 !== sourceVersion.contentSha256
    || new TextEncoder().encode(sourceVersion.content).byteLength > MAX_SOURCE_BYTES
    || await sha256Hex(sourceVersion.content) !== expectedSha256) {
    throw new AppError("PUBLICATION_CONTENT_MISMATCH", "Publication content does not match the stable intent", 409);
  }
}

async function validatedPublicationChunks(
  source: Pick<ReviewSubmissionSnapshot, "sourceVersion"> | PublicationIntent,
): Promise<ChunkDraft[]> {
  const expectedSha256 = "contentSha256" in source
    ? source.contentSha256
    : source.sourceVersion.contentSha256;
  await assertSourceVersion(source.sourceVersion, expectedSha256);
  if (!hasSemanticSourceContent(source.sourceVersion.kind, source.sourceVersion.content)) {
    throw publicationContentMismatch();
  }
  let chunks: ChunkDraft[];
  try {
    chunks = chunkDocument({
      normalizedMarkdown: source.sourceVersion.content,
      kind: source.sourceVersion.kind,
      ...(source.sourceVersion.codeMetadata ? { lineBaseline: source.sourceVersion.codeMetadata.lineBaseline } : {}),
    });
  } catch {
    throw publicationContentMismatch();
  }
  if (chunks.length < 1 || chunks.length > MAX_REVISION_CHUNKS
    || chunks.some((chunk) => chunk.body.trim().length === 0 || chunk.searchBody.trim().length === 0)) {
    throw publicationContentMismatch();
  }
  return chunks;
}

function publicationContentMismatch(): AppError {
  return new AppError("PUBLICATION_CONTENT_MISMATCH", "Publication content is invalid", 409);
}

function isPublicationContentMismatch(error: unknown): boolean {
  return error instanceof AppError && error.code === "PUBLICATION_CONTENT_MISMATCH";
}

function assertReceipt(intent: PublicationIntent, receipt: { path: string; contentSha256: string; bytes: number }): void {
  if (receipt.path !== intent.normalizedPath || receipt.contentSha256 !== intent.contentSha256
    || receipt.bytes !== new TextEncoder().encode(intent.sourceVersion.content).byteLength) {
    throw new AppError("PUBLICATION_CONTENT_MISMATCH", "Published content receipt does not match the stable intent", 409);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}
function normalizeRecoveryLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw invalidPublicationInput();
  return value;
}
function isVisibility(value: unknown): value is KnowledgeVisibility { return value === "shared" || value === "admin_only"; }
function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && [...value].length <= 128
    && new TextEncoder().encode(value).byteLength <= 512 && !CONTROL_CHARACTERS.test(value);
}
function isRejectionReason(value: unknown): value is RejectionReasonCode { return value === "not_relevant" || value === "duplicate" || value === "unsafe"; }
function isRepositoryConflict(error: unknown, kind: string): boolean { return (error as { kind?: unknown })?.kind === kind; }
function throwPublicationError(error: unknown): never {
  if (isRepositoryConflict(error, "target_invalid")) {
    throw new AppError(
      "PUBLICATION_TARGET_INVALID",
      "Publication target must be active, writable, and in one Space",
      400,
    );
  }
  if (isRepositoryConflict(error, "submission_not_pending")) {
    throw new AppError("PUBLICATION_STATE_CONFLICT", "Submission is no longer pending review", 409);
  }
  if (isRepositoryConflict(error, "intent_mismatch")) {
    throw new AppError("PUBLICATION_STATE_CONFLICT", "Publication intent does not match the original review", 409);
  }
  throw error;
}
function throwDecisionError(error: unknown): never {
  if (isRepositoryConflict(error, "decision_conflict") || isRepositoryConflict(error, "submission_not_pending")) {
    throw new AppError("REVIEW_STATE_CONFLICT", "Submission is no longer pending review", 409);
  }
  throw error;
}
function invalidPublicationInput(): AppError { return new AppError("PUBLICATION_INPUT_INVALID", "Publication input is invalid", 400); }
function invalidDecision(): AppError { return new AppError("REVIEW_DECISION_INVALID", "Review decision is invalid", 400); }
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
