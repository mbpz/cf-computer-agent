import { AppError } from "../http";
import { decodeSourceBytes } from "../sources/decoder";
import { deriveCursorScopeKey, parsePageRequest, type PageRequest } from "../pagination";
import { parseSource } from "../sources/parser";
import {
  SubmissionsRepositoryConflictError,
  type PersistedSubmission,
  type SubmissionsRepositoryPort,
} from "./repository";
import type {
  Submission,
  SubmissionCreateResult,
  SubmissionKind,
  SubmissionPage,
  SubmissionPageRequest,
  SubmissionStatusFilter,
} from "./types";

export interface CreateSubmissionInput { requestedSpaceId: string; requestedCollectionId?: string | null; requestedVisibility?: "shared" | "admin_only"; kind: SubmissionKind; title: string; content: string; }
export interface CreateSourceSubmissionInput extends Omit<CreateSubmissionInput, "content"> {
  content?: string;
  contentBase64?: string;
  idempotencyKey: string;
  language?: string;
  fileLabel?: string;
  lineBaseline?: number;
}
export interface ResubmitSourceSubmissionInput {
  requestedSpaceId?: string;
  requestedCollectionId?: string | null;
  requestedVisibility?: "shared" | "admin_only";
  kind: SubmissionKind;
  title: string;
  content?: string;
  contentBase64?: string;
  language?: string;
  fileLabel?: string;
  lineBaseline?: number;
}
export interface SubmissionsServiceOptions { id?: () => string; now?: () => Date; }

const maxContentBytes = 128 * 1024;

export class SubmissionsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: SubmissionsRepositoryPort, options: SubmissionsServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async createDraft(submitterId: string, input: CreateSubmissionInput): Promise<Submission> {
    const normalized = normalizeDraft(input);
    const now = this.now().toISOString();
    const submission: Submission = { id: this.id(), submitterId, ...normalized, status: "draft", createdAt: now, updatedAt: now };
    try { return await this.repository.createDraft(submission, draftAudit(this.id(), submission, now)); }
    catch (error) {
      if (error instanceof SubmissionsRepositoryConflictError) {
        throw new AppError("SUBMISSION_TARGET_INVALID", "Submission target must be active and in the selected Space", 400);
      }
      throw error;
    }
  }

  async getDraft(submitterId: string, submissionId: string): Promise<Submission> {
    const draft = await this.repository.findOwnedDraft(submitterId, requireDraftId(submissionId));
    if (!draft) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    return draft;
  }

  async updateDraft(submitterId: string, submissionId: string, input: CreateSubmissionInput): Promise<Submission> {
    const id = requireDraftId(submissionId);
    const normalized = normalizeDraft(input);
    const existing = await this.repository.findOwnedDraft(submitterId, id);
    if (!existing) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    const candidate = {
      id, submitterId, ...normalized, status: "draft", createdAt: existing.createdAt, updatedAt: this.now().toISOString(),
    } as Submission;
    const updated = await this.repository.updateDraft(candidate, draftAudit(this.id(), candidate, candidate.updatedAt));
    if (!updated) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    return updated;
  }

  async create(submitterId: string, input: CreateSubmissionInput): Promise<Submission> {
    const normalized = normalize(input);
    const now = this.now().toISOString();
    const submission: Submission = { id: this.id(), submitterId, ...normalized, status: "review_pending", createdAt: now, updatedAt: now };
    const audit = submissionAudit(this.id(), submission, now);
    try { return await this.repository.createWithAudit(submission, audit); }
    catch (error) { if (error instanceof SubmissionsRepositoryConflictError) throw new AppError("SUBMISSION_TARGET_INVALID", "Submission target must be active and in the selected Space", 400); throw error; }
  }

  async createWithSourceVersion(submitterId: string, input: CreateSourceSubmissionInput): Promise<SubmissionCreateResult> {
    requireIdempotencyKey(input.idempotencyKey);
    const content = resolveSourceContent(input);
    const normalized = normalize({ ...input, content }, false);
    const parsed = await parseSource({
      kind: normalized.kind,
      content: normalized.content,
      language: input.language,
      fileLabel: input.fileLabel,
      lineBaseline: input.lineBaseline,
    });
    const now = this.now().toISOString();
    const submission: PersistedSubmission = {
      id: this.id(), submitterId, ...normalized, idempotencyKey: input.idempotencyKey,
      status: "review_pending", createdAt: now, updatedAt: now,
    };
    const source = {
      id: this.id(), ownerId: submitterId, spaceId: normalized.requestedSpaceId,
      collectionId: normalized.requestedCollectionId, kind: normalized.kind, title: normalized.title,
      createdAt: now, updatedAt: now,
    };
    const sourceVersion = {
      id: this.id(), sourceId: source.id, submissionId: submission.id, ordinal: 1,
      content: parsed.normalizedMarkdown, contentSha256: parsed.contentSha256,
      parserVersion: parsed.parserVersion, parserSchemaVersion: parsed.parserSchemaVersion,
      sourceIdentitySha256: parsed.sourceIdentitySha256, codeMetadata: parsed.codeMetadata, createdAt: now,
    };
    const audit = submissionAudit(this.id(), submission, now);
    try {
      return await this.repository.createWithSourceVersion({ submission, source, sourceVersion, audit });
    } catch (error) {
      if (error instanceof SubmissionsRepositoryConflictError) {
        if (error.kind === "target_invalid") {
          throw new AppError("SUBMISSION_TARGET_INVALID", "Submission target must be active and in the selected Space", 400);
        }
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for another submission", 409);
      }
      throw error;
    }
  }

  async assertResubmittable(memberId: string, priorSubmissionId: string): Promise<void> {
    if (!await this.repository.findResubmittable(memberId, requireResourceId(priorSubmissionId))) {
      throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    }
  }

  async resubmit(
    memberId: string,
    priorSubmissionId: string,
    input: ResubmitSourceSubmissionInput,
    idempotencyKey: string,
  ): Promise<SubmissionCreateResult> {
    const stablePriorId = requireResourceId(priorSubmissionId);
    const prior = await this.repository.findResubmittable(memberId, stablePriorId);
    if (!prior) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
    if (prior.requestedVisibility === "admin_only" && input.requestedVisibility === "shared") {
      throw new AppError(
        "SUBMISSION_VISIBILITY_EXPANSION_FORBIDDEN",
        "A resubmission cannot expand the requested visibility",
        400,
      );
    }
    requireIdempotencyKey(idempotencyKey);
    const content = resolveSourceContent({
      requestedSpaceId: input.requestedSpaceId ?? prior.requestedSpaceId,
      requestedCollectionId: input.requestedCollectionId,
      requestedVisibility: input.requestedVisibility,
      kind: input.kind,
      title: input.title,
      ...(input.content === undefined ? {} : { content: input.content }),
      ...(input.contentBase64 === undefined ? {} : { contentBase64: input.contentBase64 }),
      idempotencyKey,
      language: input.language,
      fileLabel: input.fileLabel,
      lineBaseline: input.lineBaseline,
    });
    const normalized = normalize({
      requestedSpaceId: input.requestedSpaceId ?? prior.requestedSpaceId,
      requestedCollectionId: input.requestedCollectionId === undefined
        ? prior.requestedCollectionId
        : input.requestedCollectionId,
      requestedVisibility: input.requestedVisibility ?? prior.requestedVisibility,
      kind: input.kind,
      title: input.title,
      content,
    }, false);
    const parsed = await parseSource({
      kind: normalized.kind,
      content: normalized.content,
      language: input.language,
      fileLabel: input.fileLabel,
      lineBaseline: input.lineBaseline,
    });
    const now = this.now().toISOString();
    const submission: PersistedSubmission = {
      id: this.id(), submitterId: memberId, ...normalized, idempotencyKey,
      supersedesSubmissionId: stablePriorId, status: "review_pending", createdAt: now, updatedAt: now,
    };
    const source = {
      id: this.id(), ownerId: memberId, spaceId: normalized.requestedSpaceId,
      collectionId: normalized.requestedCollectionId, kind: normalized.kind, title: normalized.title,
      createdAt: now, updatedAt: now,
    };
    const sourceVersion = {
      id: this.id(), sourceId: source.id, submissionId: submission.id, ordinal: 1,
      content: parsed.normalizedMarkdown, contentSha256: parsed.contentSha256,
      parserVersion: parsed.parserVersion, parserSchemaVersion: parsed.parserSchemaVersion,
      sourceIdentitySha256: parsed.sourceIdentitySha256, codeMetadata: parsed.codeMetadata, createdAt: now,
    };
    const audit = submissionAudit(this.id(), submission, now);
    try {
      return await this.repository.createResubmissionWithSourceVersion({ submission, source, sourceVersion, audit });
    } catch (error) {
      if (error instanceof SubmissionsRepositoryConflictError) {
        if (error.kind === "target_invalid") {
          throw new AppError("SUBMISSION_TARGET_INVALID", "Submission target must be active and in the selected Space", 400);
        }
        if (error.kind === "resubmission_conflict") {
          throw new AppError("RESUBMISSION_STATE_CONFLICT", "Submission is no longer available for resubmission", 409);
        }
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for another submission", 409);
      }
      throw error;
    }
  }

  async listOwn(submitterId: string, request: SubmissionPageRequest = {}): Promise<SubmissionPage> {
    const status = validateStatusFilter(request.status);
    const page = parsePageRequest(request.limit, request.cursor);
    return this.repository.listOwned(submitterId, {
      ...page,
      ...(status === undefined ? {} : { status }),
      cursorKey: await deriveCursorScopeKey("own-submissions", {
        memberId: submitterId,
        status: status ?? null,
        sort: "created_at-desc-id-desc",
      }),
    });
  }
  listPending(request?: PageRequest): Promise<SubmissionPage> { return this.repository.listPending(parsePageRequest(request?.limit, request?.cursor)); }
}

function validateStatusFilter(status: unknown): SubmissionStatusFilter | undefined {
  if (status === undefined) return undefined;
  if (status === "draft" || status === "review_pending" || status === "published" || status === "rejected"
    || status === "revision_requested") return status;
  throw new AppError("PAGE_INVALID", "Submission status filter is invalid", 400);
}

function normalizeDraft(
  input: CreateSubmissionInput,
): Pick<Submission, "requestedSpaceId" | "requestedCollectionId" | "requestedVisibility" | "kind" | "title" | "content"> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length > 200 || !isSubmissionKind(input.kind)
    || !isBoundedId(input.requestedSpaceId)
    || (input.requestedCollectionId !== undefined && input.requestedCollectionId !== null
      && !isBoundedId(input.requestedCollectionId))
    || typeof input.content !== "string"
    || new TextEncoder().encode(input.content).byteLength > maxContentBytes) {
    throw new AppError("SUBMISSION_INVALID", "Submission fields are invalid", 400);
  }
  if (input.requestedVisibility !== undefined
    && input.requestedVisibility !== "shared" && input.requestedVisibility !== "admin_only") {
    throw new AppError("SUBMISSION_INVALID", "Submission fields are invalid", 400);
  }
  return {
    requestedSpaceId: input.requestedSpaceId,
    requestedCollectionId: input.requestedCollectionId ?? null,
    requestedVisibility: input.requestedVisibility ?? "shared",
    kind: input.kind,
    title,
    content: input.content,
  };
}

function resolveSourceContent(input: CreateSourceSubmissionInput): string {
  if (input.content !== undefined && input.contentBase64 !== undefined) {
    throw new AppError("SUBMISSION_INVALID", "Submission fields are invalid", 400);
  }
  if (typeof input.content === "string") return input.content;
  if (typeof input.contentBase64 !== "string" || !isCanonicalBase64(input.contentBase64)) {
    throw new AppError("SOURCE_ENCODING_INVALID", "Source encoding is invalid", 400);
  }
  try {
    const binary = atob(input.contentBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return decodeSourceBytes(bytes.buffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SOURCE_ENCODING_INVALID", "Source encoding is invalid", 400);
  }
}

function isCanonicalBase64(value: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return false;
  try { return btoa(atob(value)) === value; } catch { return false; }
}

function normalize(
  input: CreateSubmissionInput,
  enforceContentBounds = true,
): Pick<Submission, "requestedSpaceId" | "requestedCollectionId" | "requestedVisibility" | "kind" | "title" | "content"> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 200 || !isSubmissionKind(input.kind)
    || !isBoundedId(input.requestedSpaceId)
    || (input.requestedCollectionId !== undefined && input.requestedCollectionId !== null
      && !isBoundedId(input.requestedCollectionId))
    || typeof input.content !== "string"
    || (enforceContentBounds && (!input.content || new TextEncoder().encode(input.content).byteLength > maxContentBytes))) {
    throw new AppError("SUBMISSION_INVALID", "Submission fields are invalid", 400);
  }
  if (input.requestedVisibility !== undefined
    && input.requestedVisibility !== "shared" && input.requestedVisibility !== "admin_only") {
    throw new AppError("SUBMISSION_INVALID", "Submission fields are invalid", 400);
  }
  return {
    requestedSpaceId: input.requestedSpaceId,
    requestedCollectionId: input.requestedCollectionId ?? null,
    requestedVisibility: input.requestedVisibility ?? "shared",
    kind: input.kind,
    title,
    content: input.content,
  };
}

function isSubmissionKind(value: unknown): value is SubmissionKind { return value === "text" || value === "markdown" || value === "code"; }
function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && [...value].length <= 128
    && new TextEncoder().encode(value).byteLength <= 512
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function submissionAudit(id: string, submission: Submission, createdAt: string) {
  if (submission.supersedesSubmissionId) {
    return {
      id, actorKind: "member" as const, actorId: submission.submitterId,
      action: "submission.resubmitted" as const,
      resourceType: "submission" as const, resourceId: submission.id,
      metadata: {
        supersedesSubmissionId: submission.supersedesSubmissionId,
        requestedSpaceId: submission.requestedSpaceId,
        ...(submission.requestedCollectionId ? { requestedCollectionId: submission.requestedCollectionId } : {}),
        requestedVisibility: submission.requestedVisibility,
      },
      createdAt,
    };
  }
  return {
    id, actorKind: "member" as const, actorId: submission.submitterId, action: "submission.created" as const,
    resourceType: "submission" as const, resourceId: submission.id,
    metadata: {
      kind: submission.kind,
      requestedSpaceId: submission.requestedSpaceId,
      ...(submission.requestedCollectionId ? { requestedCollectionId: submission.requestedCollectionId } : {}),
    },
    createdAt,
  };
}

function draftAudit(id: string, submission: Submission, createdAt: string) {
  return {
    id, actorKind: "member" as const, actorId: submission.submitterId,
    action: "submission.draft_saved" as const, resourceType: "submission" as const, resourceId: submission.id,
    metadata: {
      kind: submission.kind,
      requestedSpaceId: submission.requestedSpaceId,
      ...(submission.requestedCollectionId ? { requestedCollectionId: submission.requestedCollectionId } : {}),
    },
    createdAt,
  };
}

function requireIdempotencyKey(value: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(value)) {
    throw new AppError("IDEMPOTENCY_KEY_INVALID", "Idempotency key is invalid", 400);
  }
}

function requireResourceId(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
  }
  return value;
}

function requireDraftId(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found", 404);
  }
  return value;
}
