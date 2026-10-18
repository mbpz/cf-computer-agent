import { AppError } from "../http";
import { APP_CONFIG } from "../config";
import { chunkDocument } from "../sources/chunker";
import { hasSemanticSourceContent, MAX_REVISION_CHUNKS } from "../sources/limits";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { PublishedContentRemover } from "../knowledge/types";
import { analyzeSensitiveContent } from "./sensitive-advisor";
import type { ChunkDraft } from "../sources/chunker";
import type {
  KnowledgeVisibility,
  AdminKnowledgeItemView,
  DecisionReceipt,
  KnowledgeLifecycleOperation,
  KnowledgeLifecycleOperationKind,
  PublicationIntent,
  PublicationRecoveryResult,
  BatchReviewAction,
  BatchReviewActionIdentity,
  BatchReviewResult,
  PublicationRepositoryPort,
  PublicationReviewer,
  ReviewDecisionOperation,
  GovernedKnowledgeItem,
  GovernedKnowledgePage,
  PurgePlan,
  PurgeResult,
  PublishedContentCommitter,
  PublishedRevision,
  PublishSubmissionInput,
  RejectionReasonCode,
  ReviewDecision,
  RollbackResult,
  ReviewPreview,
  ReviewSubmissionSnapshot,
  ChunkRebuildReport,
  TrashedKnowledgeRetention,
} from "./types";

const MAX_TITLE_CODE_POINTS = 200;
const MAX_TITLE_BYTES = 512;
const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_REVIEW_NOTE_BYTES = 4_000;
const MAX_TAGS = 20;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const SAFE_KNOWLEDGE_ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const STABLE_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/**
 * The client's decision identity. Both fields are optional so a client that
 * predates the contract keeps its natural-identity convergence.
 */
export interface ReviewDecisionOperationInput {
  operationId?: unknown;
  expectedUpdatedAt?: unknown;
}

/**
 * The client's lifecycle identity for one knowledge write. The operation number
 * is optional so a client that predates the contract keeps natural-identity
 * convergence; when it is present a lost response is replayed from its receipt
 * instead of acting a second time.
 */
export interface KnowledgeOperationInput {
  operationId?: unknown;
}

function isCanonicalTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function replayRecordedReceipt(
  receipt: DecisionReceipt,
  submissionId: string,
  operation: ReviewDecisionOperation,
): PublishedRevision {
  if (receipt.requestHash !== operation.requestHash) {
    throw new AppError(
      "PUBLICATION_OPERATION_CONFLICT",
      "Operation number was already used for a different decision",
      409,
      false,
      { submissionId, operationId: operation.operationId },
    );
  }
  return JSON.parse(receipt.responseJson) as PublishedRevision;
}

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The recycle bin's retained window for one trashed item. It is derived from the
 * same constant the purge path enforces, so the surface can state the deadline
 * without owning a second copy of the policy, and `purgeable` is the honest
 * answer of the purge precondition itself (the cutoff comparison is inclusive
 * on the deadline, exactly like the repository's `updated_at > cutoff` refusal).
 */
export function trashRetention(trashedAt: string, now: Date = new Date()): TrashedKnowledgeRetention {
  const eligibleAt = new Date(Date.parse(trashedAt) + TRASH_RETENTION_MS);
  return {
    trashedAt,
    purgeEligibleAt: eligibleAt.toISOString(),
    purgeable: now.getTime() >= eligibleAt.getTime(),
  };
}

function replayLifecycleReceipt<T>(
  receipt: DecisionReceipt,
  knowledgeItemId: string,
  operation: KnowledgeLifecycleOperation,
): T {
  if (receipt.requestHash !== operation.requestHash) {
    throw new AppError(
      "KNOWLEDGE_OPERATION_CONFLICT",
      "Operation number was already used for a different knowledge write",
      409,
      false,
      { knowledgeItemId, operationId: operation.operationId },
    );
  }
  return JSON.parse(receipt.responseJson) as T;
}

export class PublicationService {
  constructor(
    private readonly repository: PublicationRepositoryPort,
    private readonly content: PublishedContentCommitter,
    private readonly contentRemover?: PublishedContentRemover,
  ) {}

  async preview(reviewer: PublicationReviewer, submissionId: string): Promise<ReviewPreview> {
    requireActiveAdmin(reviewer);
    const preview = await this.repository.getPreview(requireId(submissionId));
    if (!preview) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    const chunks = await validatedPublicationChunks(preview);
    return {
      ...preview,
      chunks: reviewChunkPreviews(chunks),
      safety: analyzeSensitiveContent(`${preview.title}\n${preview.rawContent}`),
    };
  }

  async rebuildChunkReport(reviewer: PublicationReviewer, revisionId: string): Promise<ChunkRebuildReport> {
    requireActiveAdmin(reviewer);
    const report = await this.repository.rebuildChunkReport(requireId(revisionId));
    if (!report) throw new AppError("KNOWLEDGE_NOT_FOUND", "Revision not found", 404);
    return report;
  }

  async publish(
    reviewer: PublicationReviewer,
    submissionId: string,
    input: PublishSubmissionInput,
    operationInput?: ReviewDecisionOperationInput,
  ): Promise<PublishedRevision> {
    requireActiveAdmin(reviewer);
    const stableSubmissionId = requireId(submissionId);
    const normalized = normalizePublishInput(input);
    const operation = operationInput === undefined
      ? undefined
      : await this.decisionOperation(
        operationInput,
        (): AppError => invalidPublicationInput(),
        [stableSubmissionId, reviewer.id, "review.publish", normalized.title, normalized.visibility,
          normalized.spaceId, normalized.collectionId, [...normalized.tagIds].sort(),
          normalized.knowledgeItemId ?? null, normalized.visibilityReasonCode ?? null],
      );
    // A retried decision replays its recorded answer without touching target
    // validation or content storage again.
    if (operation) {
      const receipt = await this.repository.findDecisionReceipt(stableSubmissionId, operation.operationId);
      if (receipt) return replayRecordedReceipt(receipt, stableSubmissionId, operation);
    }
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
      intent = await this.repository.createOrReadIntent(stableSubmissionId, reviewer.id, normalized, operation);
    } catch (error) {
      throwPublicationError(error);
    }
    assertStableIntent(intent, preview, reviewer.id, normalized);
    return this.resumeIntent(intent, chunks, operation);
  }

  async reject(
    reviewer: PublicationReviewer,
    submissionId: string,
    input: { reasonCode: RejectionReasonCode; note: string },
    operationInput?: ReviewDecisionOperationInput,
  ): Promise<ReviewDecision> {
    requireActiveAdmin(reviewer);
    if (!isRejectionReason(input?.reasonCode)) throw invalidDecision();
    const stableSubmissionId = requireId(submissionId);
    const note = normalizeReviewNote(input.note);
    const operation = operationInput === undefined
      ? undefined
      : await this.decisionOperation(
        operationInput,
        (): AppError => invalidDecision(),
        [stableSubmissionId, reviewer.id, "review.reject", input.reasonCode, note],
      );
    try {
      return await this.repository.reject(stableSubmissionId, reviewer.id, {
        reasonCode: input.reasonCode,
        note,
      }, operation);
    } catch (error) {
      throwDecisionError(error);
    }
  }

  async requestRevision(
    reviewer: PublicationReviewer,
    submissionId: string,
    input: { reasonCode: "needs_revision"; note: string },
    operationInput?: ReviewDecisionOperationInput,
  ): Promise<ReviewDecision> {
    requireActiveAdmin(reviewer);
    if (input?.reasonCode !== "needs_revision") throw invalidDecision();
    const stableSubmissionId = requireId(submissionId);
    const note = normalizeReviewNote(input.note);
    const operation = operationInput === undefined
      ? undefined
      : await this.decisionOperation(
        operationInput,
        (): AppError => invalidDecision(),
        [stableSubmissionId, reviewer.id, "review.request_revision", "needs_revision", note],
      );
    try {
      return await this.repository.requestRevision(stableSubmissionId, reviewer.id, {
        reasonCode: "needs_revision",
        note,
      }, operation);
    } catch (error) {
      throwDecisionError(error);
    }
  }

  /**
   * Normalizes the client's operation number and expected submission version,
   * then hashes the whole request so a reused number with different content is
   * a conflict instead of a silent replay of the wrong decision.
   */
  private async decisionOperation(
    input: ReviewDecisionOperationInput,
    invalid: () => AppError,
    requestFields: readonly unknown[],
  ): Promise<ReviewDecisionOperation> {
    const operationId = input.operationId;
    if (operationId !== undefined
      && (typeof operationId !== "string" || !STABLE_OPERATION_ID.test(operationId))) throw invalid();
    const expectedVersion = input.expectedUpdatedAt;
    if (expectedVersion !== undefined && !isCanonicalTimestamp(expectedVersion)) throw invalid();
    if (operationId === undefined) {
      if (expectedVersion === undefined) throw invalid();
      return {
        operationId: `version:${expectedVersion}`,
        expectedVersion,
        requestHash: await sha256Hex(JSON.stringify([...requestFields, expectedVersion])),
      };
    }
    return {
      operationId,
      expectedVersion,
      requestHash: await sha256Hex(JSON.stringify([...requestFields, expectedVersion ?? null])),
    };
  }

  async batchReview(reviewer: PublicationReviewer, actions: unknown): Promise<BatchReviewResult> {
    requireActiveAdmin(reviewer);
    const normalized = normalizeBatchReviewActions(actions);
    const items: BatchReviewResult["items"] = [];
    for (const action of normalized) {
      try {
        // Each item carries its own decision identity, so a replayed batch
        // re-uses the receipts of the items that already committed and a failed
        // item can be retried alone without deciding its neighbours twice.
        const identity: ReviewDecisionOperationInput | undefined =
          action.operationId === undefined && action.expectedUpdatedAt === undefined
            ? undefined
            : { operationId: action.operationId, expectedUpdatedAt: action.expectedUpdatedAt };
        const result = action.action === "publish"
          ? await this.publish(reviewer, action.submissionId, action, identity)
          : action.action === "reject"
            ? await this.reject(reviewer, action.submissionId, action, identity)
            : await this.requestRevision(reviewer, action.submissionId, action, identity);
        items.push({ submissionId: action.submissionId, action: action.action, status: "succeeded", result });
      } catch (error) {
        const appError = error instanceof AppError
          ? error
          : new AppError("INTERNAL_ERROR", "Internal error", 500, true);
        items.push({
          submissionId: action.submissionId,
          action: action.action,
          status: "failed",
          error: { code: appError.code, status: appError.status, retryable: appError.retryable },
        });
      }
    }
    const succeeded = items.filter((item) => item.status === "succeeded").length;
    return { requested: items.length, succeeded, failed: items.length - succeeded, items };
  }

  async rollback(
    reviewer: PublicationReviewer,
    knowledgeItemId: string,
    revisionId: string,
    operationInput?: KnowledgeOperationInput,
  ): Promise<RollbackResult> {
    requireActiveAdmin(reviewer);
    const itemId = requireId(knowledgeItemId);
    const targetRevisionId = requireId(revisionId);
    const identity = await this.lifecycleOperation(operationInput, [
      itemId, reviewer.id, "knowledge.rollback", targetRevisionId,
    ]);
    const recorded = await this.replayLifecycle<RollbackResult>(itemId, identity);
    if (recorded) return recorded;
    let result: RollbackResult;
    try {
      result = await this.repository.rollback(itemId, targetRevisionId, reviewer.id, identity?.operationId);
    } catch (error) {
      const concurrent = await this.replayLifecycle<RollbackResult>(itemId, identity);
      if (concurrent) return concurrent;
      if (isRepositoryConflict(error, "rollback_target_invalid")) {
        throw new AppError("ROLLBACK_TARGET_INVALID", "Revision does not belong to an active knowledge item", 400);
      }
      if (isRepositoryConflict(error, "rollback_conflict")) {
        throw new AppError("ROLLBACK_STATE_CONFLICT", "Knowledge item changed during rollback", 409);
      }
      throw error;
    }
    const searchStatus = await this.repository.processIndexJob(result.id);
    const answer: RollbackResult = { ...result, searchStatus };
    if (!identity) return answer;
    // Recorded only after the rolled-back Revision and its index job exist, so a
    // replay answers with the rollback that actually committed.
    return this.recordLifecycle(itemId, "knowledge.rollback", reviewer.id, identity, answer);
  }

  /**
   * Authoritative readback for a client that never learned a write's outcome.
   * Only the administrator who claimed the operation may read it back, and the
   * answer is the recorded receipt, not a fresh evaluation of current state.
   */
  async findLifecycleOperation(
    reviewer: PublicationReviewer,
    knowledgeItemId: string,
    operationId: string,
  ): Promise<{ kind: KnowledgeLifecycleOperationKind; response: unknown } | null> {
    requireActiveAdmin(reviewer);
    const itemId = requireId(knowledgeItemId);
    if (typeof operationId !== "string" || !STABLE_OPERATION_ID.test(operationId)) throw invalidLifecycleRequest();
    const receipt = await this.repository.findLifecycleOperation(itemId, operationId);
    if (!receipt || receipt.actorId !== reviewer.id) return null;
    let response: unknown;
    try {
      response = JSON.parse(receipt.responseJson) as unknown;
    } catch {
      throw new AppError("KNOWLEDGE_DATA_INVALID", "Published knowledge data is invalid", 500);
    }
    return { kind: receipt.kind, response };
  }

  /**
   * Content-free administrator read of one item, active or trashed. It is the
   * item surface's own read, so a trashed item stays inspectable without the
   * reader path and without its published content.
   */
  async adminKnowledgeItem(reviewer: PublicationReviewer, knowledgeItemId: string): Promise<AdminKnowledgeItemView> {
    requireActiveAdmin(reviewer);
    const itemId = requireId(knowledgeItemId);
    const item = await this.repository.findAdminKnowledgeItem(itemId);
    if (!item || item.id !== itemId) throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge item was not found", 404);
    return item;
  }

  async trash(
    reviewer: PublicationReviewer,
    knowledgeItemId: string,
    operationInput?: KnowledgeOperationInput,
  ): Promise<GovernedKnowledgeItem> {
    requireActiveAdmin(reviewer);
    const itemId = requireId(knowledgeItemId);
    return this.changeLifecycle(reviewer.id, itemId, "trash", await this.lifecycleOperation(operationInput, [
      itemId, reviewer.id, "knowledge.trash",
    ]));
  }

  async restore(
    reviewer: PublicationReviewer,
    knowledgeItemId: string,
    operationInput?: KnowledgeOperationInput,
  ): Promise<GovernedKnowledgeItem> {
    requireActiveAdmin(reviewer);
    const itemId = requireId(knowledgeItemId);
    return this.changeLifecycle(reviewer.id, itemId, "restore", await this.lifecycleOperation(operationInput, [
      itemId, reviewer.id, "knowledge.restore",
    ]));
  }

  async listTrashed(reviewer: PublicationReviewer, request: PageRequest = { limit: 20 }): Promise<GovernedKnowledgePage> {
    requireActiveAdmin(reviewer);
    return this.repository.listTrashed(parsePageRequest(request.limit, request.cursor));
  }

  async purge(
    reviewer: PublicationReviewer,
    knowledgeItemId: string,
    now: Date = new Date(),
    operationInput?: KnowledgeOperationInput,
  ): Promise<PurgeResult> {
    requireActiveAdmin(reviewer);
    if (!this.contentRemover) {
      throw new AppError("KNOWLEDGE_PURGE_UNAVAILABLE", "Knowledge purge storage is unavailable", 503, true);
    }
    const itemId = requireId(knowledgeItemId);
    const identity = await this.lifecycleOperation(operationInput, [itemId, reviewer.id, "knowledge.purge"]);
    // A replayed purge answers with the revision count the first attempt
    // destroyed; it never falls through to the "already purged" tombstone, which
    // can only state that nothing was left to do.
    const recorded = await this.replayLifecycle<PurgeResult>(itemId, identity);
    if (recorded) return recorded;
    const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS).toISOString();
    let plan: PurgePlan | { alreadyPurged: true };
    try {
      plan = await this.repository.preparePurge(itemId, cutoff);
    } catch (error) {
      const concurrent = await this.replayLifecycle<PurgeResult>(itemId, identity);
      if (concurrent) return concurrent;
      if (isRepositoryConflict(error, "purge_target_invalid")) {
        throw new AppError("KNOWLEDGE_PURGE_TARGET_INVALID", "Knowledge item is not in the recycle bin", 400);
      }
      if (isRepositoryConflict(error, "purge_retention_active")) {
        throw new AppError("KNOWLEDGE_PURGE_RETENTION_ACTIVE", "Knowledge item has not reached its retention deadline", 409);
      }
      throw error;
    }
    if ("alreadyPurged" in plan) {
      const nothingToDo: PurgeResult = {
        knowledgeItemId: itemId, status: "purged", purgedRevisionCount: 0, alreadyPurged: true,
      };
      if (!identity) return nothingToDo;
      return this.recordLifecycle(itemId, "knowledge.purge", reviewer.id, identity, nothingToDo);
    }
    try {
      await this.contentRemover.remove(plan.contentPaths);
    } catch {
      throw new AppError("KNOWLEDGE_PURGE_CONTENT_UNAVAILABLE", "Published content cleanup is temporarily unavailable", 503, true);
    }
    let result: PurgeResult;
    try {
      result = await this.repository.finalizePurge(plan, reviewer.id);
    } catch (error) {
      const concurrent = await this.replayLifecycle<PurgeResult>(itemId, identity);
      if (concurrent) return concurrent;
      if (isRepositoryConflict(error, "purge_conflict")) {
        throw new AppError("KNOWLEDGE_PURGE_CONFLICT", "Knowledge item changed during cleanup", 409, true);
      }
      throw error;
    }
    if (!identity) return result;
    return this.recordLifecycle(itemId, "knowledge.purge", reviewer.id, identity, result);
  }

  /**
   * Normalizes the client's operation number into the write's identity. The
   * number is optional so a client that predates the contract keeps its
   * natural-identity convergence, and the hashed request makes a reused number
   * with different content a conflict instead of a replay of the wrong write.
   */
  private async lifecycleOperation(
    input: KnowledgeOperationInput | undefined,
    requestFields: readonly unknown[],
  ): Promise<KnowledgeLifecycleOperation | undefined> {
    const operationId = input?.operationId;
    if (operationId === undefined) return undefined;
    if (typeof operationId !== "string" || !STABLE_OPERATION_ID.test(operationId)) throw invalidLifecycleRequest();
    return { operationId, requestHash: await sha256Hex(JSON.stringify(requestFields)) };
  }

  /** The recorded answer of an operation that already committed, if any. */
  private async replayLifecycle<T>(
    knowledgeItemId: string,
    identity: KnowledgeLifecycleOperation | undefined,
  ): Promise<T | undefined> {
    if (!identity) return undefined;
    const receipt = await this.repository.findLifecycleReceipt(knowledgeItemId, identity.operationId);
    return receipt ? replayLifecycleReceipt<T>(receipt, knowledgeItemId, identity) : undefined;
  }

  private async recordLifecycle<T extends GovernedKnowledgeItem | RollbackResult | PurgeResult>(
    knowledgeItemId: string,
    kind: KnowledgeLifecycleOperationKind,
    actorId: string,
    identity: KnowledgeLifecycleOperation,
    response: T,
  ): Promise<T> {
    try {
      return await this.repository.recordLifecycleReceipt({
        knowledgeItemId, kind, actorId, operation: identity,
      }, response);
    } catch (error) {
      if (isRepositoryConflict(error, "operation_conflict")) {
        throw new AppError(
          "KNOWLEDGE_OPERATION_CONFLICT",
          "Operation number was already used for a different knowledge write",
          409,
          false,
          { knowledgeItemId, operationId: identity.operationId },
        );
      }
      throw error;
    }
  }

  private async changeLifecycle(
    reviewerId: string,
    knowledgeItemId: string,
    operation: "trash" | "restore",
    identity?: KnowledgeLifecycleOperation,
  ): Promise<GovernedKnowledgeItem> {
    const replay = await this.replayLifecycle<GovernedKnowledgeItem>(knowledgeItemId, identity);
    if (replay) return replay;
    let item;
    try {
      item = operation === "trash"
        ? await this.repository.trash(knowledgeItemId, reviewerId)
        : await this.repository.restore(knowledgeItemId, reviewerId);
    } catch (error) {
      const concurrent = await this.replayLifecycle<GovernedKnowledgeItem>(knowledgeItemId, identity);
      if (concurrent) return concurrent;
      if (isRepositoryConflict(error, "lifecycle_target_invalid")) {
        throw new AppError("KNOWLEDGE_LIFECYCLE_TARGET_INVALID", "Knowledge item lifecycle state is invalid", 400);
      }
      if (isRepositoryConflict(error, "lifecycle_conflict")) {
        throw new AppError("KNOWLEDGE_LIFECYCLE_CONFLICT", "Knowledge item changed during lifecycle update", 409);
      }
      throw error;
    }
    const searchStatus = await this.repository.processIndexJob(item.revisionId);
    const answer: GovernedKnowledgeItem = { ...item, searchStatus };
    if (!identity) return answer;
    return this.recordLifecycle(
      knowledgeItemId,
      operation === "trash" ? "knowledge.trash" : "knowledge.restore",
      reviewerId,
      identity,
      answer,
    );
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

  private async resumeIntent(
    intent: PublicationIntent,
    chunks: ChunkDraft[],
    operation?: ReviewDecisionOperation,
  ): Promise<PublishedRevision> {
    if (operation) {
      const recorded = await this.repository.findDecisionReceipt(intent.submissionId, operation.operationId);
      if (recorded) return replayRecordedReceipt(recorded, intent.submissionId, operation);
    }
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
    const published: PublishedRevision = { ...revision, searchStatus };
    if (!operation) return published;
    // Recorded only after the immutable Revision and its index job exist, so a
    // replay answers with the decision that actually committed.
    return this.repository.recordDecisionReceipt({
      submissionId: intent.submissionId,
      kind: "review.publish",
      actorId: intent.reviewerId,
      operation,
    }, published);
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

function normalizeBatchReviewActions(value: unknown): BatchReviewAction[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > APP_CONFIG.maxBatchReviewActions) {
    throw new AppError("BATCH_REVIEW_REQUEST_INVALID", "Batch review request is invalid", 400);
  }
  const ids = new Set<string>();
  return value.map((candidate) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) throw batchReviewInvalid();
    const record = candidate as Record<string, unknown>;
    const submissionId = record.submissionId;
    if (!isBoundedId(submissionId) || ids.has(submissionId)) throw batchReviewInvalid();
    ids.add(submissionId);
    if (record.action === "publish") {
      if (!hasOnlyKeys(record, ["submissionId", "action", "operationId", "expectedUpdatedAt", "title", "visibility", "spaceId", "collectionId", "tagIds", "knowledgeItemId", "visibilityReasonCode"])) throw batchReviewInvalid();
      try {
        return { submissionId, action: "publish", ...normalizePublishInput({
          title: record.title as string,
          visibility: record.visibility as KnowledgeVisibility,
          spaceId: record.spaceId as string,
          collectionId: record.collectionId as string | null,
          tagIds: record.tagIds as string[],
          ...(record.knowledgeItemId === undefined ? {} : { knowledgeItemId: record.knowledgeItemId as string }),
          ...(record.visibilityReasonCode === undefined ? {} : { visibilityReasonCode: record.visibilityReasonCode as "admin_visibility_expansion" }),
        }), ...batchItemIdentity(record) } satisfies BatchReviewAction;
      } catch {
        throw batchReviewInvalid();
      }
    }
    if (record.action === "reject") {
      if (!hasOnlyKeys(record, ["submissionId", "action", "operationId", "expectedUpdatedAt", "reasonCode", "note"])
        || !isRejectionReason(record.reasonCode)) throw batchReviewInvalid();
      try {
        return { submissionId, action: "reject", reasonCode: record.reasonCode, note: normalizeReviewNote(record.note as string), ...batchItemIdentity(record) } satisfies BatchReviewAction;
      } catch {
        throw batchReviewInvalid();
      }
    }
    if (record.action === "request_revision") {
      if (!hasOnlyKeys(record, ["submissionId", "action", "operationId", "expectedUpdatedAt", "reasonCode", "note"])
        || record.reasonCode !== "needs_revision") throw batchReviewInvalid();
      try {
        return { submissionId, action: "request_revision", reasonCode: "needs_revision", note: normalizeReviewNote(record.note as string), ...batchItemIdentity(record) } satisfies BatchReviewAction;
      } catch {
        throw batchReviewInvalid();
      }
    }
    throw batchReviewInvalid();
  });
}

/**
 * The optional identity of one batch item. Both fields must appear together and
 * be well formed — exactly the rule a single decision enforces — so a batch item
 * and its later single-surface retry resolve to the same recorded operation. A
 * malformed identity invalidates the whole request rather than silently
 * degrading the item to an unprotected write.
 */
function batchItemIdentity(record: Record<string, unknown>): BatchReviewActionIdentity {
  const { operationId, expectedUpdatedAt } = record;
  if (operationId === undefined && expectedUpdatedAt === undefined) return {};
  if (typeof operationId !== "string" || !STABLE_OPERATION_ID.test(operationId)
    || !isCanonicalTimestamp(expectedUpdatedAt)) throw batchReviewInvalid();
  return { operationId, expectedUpdatedAt };
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function batchReviewInvalid(): AppError {
  return new AppError("BATCH_REVIEW_REQUEST_INVALID", "Batch review request is invalid", 400);
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
    || (input.knowledgeItemId !== undefined
      && (!isBoundedId(input.knowledgeItemId) || !SAFE_KNOWLEDGE_ITEM_ID.test(input.knowledgeItemId)))
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
    ...(input.knowledgeItemId === undefined ? {} : { knowledgeItemId: input.knowledgeItemId }),
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
    || (input.knowledgeItemId !== undefined && intent.knowledgeItemId !== input.knowledgeItemId)
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
    ...(chunk.location ? { location: chunk.location } : {}),
    excerpt: [...chunk.body].slice(0, 240).join(""),
  }));
}

async function assertSourceVersion(
  sourceVersion: ReviewSubmissionSnapshot["sourceVersion"],
  expectedSha256: string,
): Promise<void> {
  if (sourceVersion.parserVersion !== "m1-v1" && sourceVersion.parserVersion !== "m2-v1"
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
/** Machine-readable conflict context reported by the repository, if any. */
function repositoryConflictDetails(error: unknown): unknown {
  if (error === null || typeof error !== "object" || !("details" in error)) return undefined;
  return error.details;
}
function throwPublicationError(error: unknown): never {
  const details = repositoryConflictDetails(error);
  if (isRepositoryConflict(error, "target_invalid")) {
    throw new AppError(
      "PUBLICATION_TARGET_INVALID",
      "Publication target must be active, writable, and in one Space",
      400,
    );
  }
  if (isRepositoryConflict(error, "version_conflict")) {
    throw new AppError(
      "PUBLICATION_VERSION_CONFLICT",
      "Submission changed since it was read; reload before retrying",
      409,
      false,
      details,
    );
  }
  if (isRepositoryConflict(error, "operation_conflict")) {
    throw new AppError(
      "PUBLICATION_OPERATION_CONFLICT",
      "Operation number was already used for a different decision",
      409,
      false,
      details,
    );
  }
  if (isRepositoryConflict(error, "submission_not_pending")) {
    throw new AppError("PUBLICATION_STATE_CONFLICT", "Submission is no longer pending review", 409, false, details);
  }
  if (isRepositoryConflict(error, "intent_mismatch")) {
    throw new AppError("PUBLICATION_STATE_CONFLICT", "Publication intent does not match the original review", 409, false, details);
  }
  throw error;
}
function throwDecisionError(error: unknown): never {
  const details = repositoryConflictDetails(error);
  if (isRepositoryConflict(error, "operation_conflict")) {
    throw new AppError(
      "REVIEW_OPERATION_CONFLICT",
      "Operation number was already used for a different decision",
      409,
      false,
      details,
    );
  }
  if (isRepositoryConflict(error, "version_conflict")) {
    throw new AppError(
      "REVIEW_VERSION_CONFLICT",
      "Submission changed since it was read; reload before retrying",
      409,
      false,
      details,
    );
  }
  if (isRepositoryConflict(error, "decision_conflict") || isRepositoryConflict(error, "submission_not_pending")) {
    throw new AppError("REVIEW_STATE_CONFLICT", "Submission is no longer pending review", 409, false, details);
  }
  throw error;
}
function invalidPublicationInput(): AppError { return new AppError("PUBLICATION_INPUT_INVALID", "Publication input is invalid", 400); }
function invalidDecision(): AppError { return new AppError("REVIEW_DECISION_INVALID", "Review decision is invalid", 400); }
function invalidLifecycleRequest(): AppError {
  return new AppError("KNOWLEDGE_LIFECYCLE_REQUEST_INVALID", "Knowledge lifecycle request is invalid", 400);
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
