import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import { parseSource } from "../sources/parser";
import {
  SubmissionsRepositoryConflictError,
  type PersistedSubmission,
  type SubmissionsRepositoryPort,
} from "./repository";
import type { Submission, SubmissionCreateResult, SubmissionKind, SubmissionPage } from "./types";

export interface CreateSubmissionInput { requestedSpaceId: string; requestedCollectionId?: string | null; kind: SubmissionKind; title: string; content: string; }
export interface CreateSourceSubmissionInput extends CreateSubmissionInput { idempotencyKey: string; language?: string; }
export interface SubmissionsServiceOptions { id?: () => string; now?: () => Date; }

const maxContentBytes = 128 * 1024;

export class SubmissionsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: SubmissionsRepositoryPort, options: SubmissionsServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
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
    if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(input.idempotencyKey)) {
      throw new AppError("IDEMPOTENCY_KEY_INVALID", "Idempotency key is invalid", 400);
    }
    const normalized = normalize(input);
    const parsed = await parseSource({ kind: normalized.kind, content: normalized.content, language: input.language });
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
      parserVersion: parsed.parserVersion, createdAt: now,
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

  listOwn(submitterId: string, request?: PageRequest): Promise<SubmissionPage> { return this.repository.listOwned(submitterId, parsePageRequest(request?.limit, request?.cursor)); }
  listPending(request?: PageRequest): Promise<SubmissionPage> { return this.repository.listPending(parsePageRequest(request?.limit, request?.cursor)); }
}

function normalize(input: CreateSubmissionInput): Pick<Submission, "requestedSpaceId" | "requestedCollectionId" | "kind" | "title" | "content"> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 200 || !isSubmissionKind(input.kind) || typeof input.requestedSpaceId !== "string" || !input.requestedSpaceId || (input.requestedCollectionId !== undefined && input.requestedCollectionId !== null && (typeof input.requestedCollectionId !== "string" || !input.requestedCollectionId)) || typeof input.content !== "string" || !input.content || new TextEncoder().encode(input.content).byteLength > maxContentBytes) {
    throw new AppError("SUBMISSION_INVALID", "Submission fields are invalid", 400);
  }
  return { requestedSpaceId: input.requestedSpaceId, requestedCollectionId: input.requestedCollectionId ?? null, kind: input.kind, title, content: input.content };
}

function isSubmissionKind(value: unknown): value is SubmissionKind { return value === "text" || value === "markdown" || value === "code"; }

function submissionAudit(id: string, submission: Submission, createdAt: string) {
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
