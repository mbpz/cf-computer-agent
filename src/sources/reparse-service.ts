import { AppError } from "../http";
import type { SubmissionKind } from "../submissions/types";
import { buildManualReparseCandidate, buildReparseCandidate, sourceReparseFingerprint, type ReparseCandidate } from "./reparse";
import type { SourceVersion } from "./types";

export type SourceReparseJobStatus = "queued" | "processing" | "indexed" | "failed_retryable" | "failed_terminal";

export interface SourceReparseJob {
  id: string;
  sourceId: string;
  baseSourceVersionId: string;
  submissionId: string;
  requestedBy: string;
  parserVersion: "m2-v1";
  parserSchemaVersion: "m2-v1";
  sourceFingerprint: string;
  status: SourceReparseJobStatus;
  attempts: number;
  candidate?: ReparseCandidate;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceReparseSnapshot {
  sourceVersion: SourceVersion;
  kind: SubmissionKind;
  publishedRevisionId: string | null;
  ownerId: string;
  spaceId: string;
  collectionId: string | null;
  title: string;
  requestedVisibility: "shared" | "admin_only";
  publishedKnowledgeItemId: string | null;
}

export interface SourceReparsePromotion {
  submissionId: string;
  sourceId: string;
  sourceVersionId: string;
}

export interface SourceReparseRepositoryPort {
  findSourceVersionForReparse(sourceVersionId: string): Promise<SourceReparseSnapshot | null>;
  findJobByFingerprint(sourceId: string, sourceFingerprint: string): Promise<SourceReparseJob | null>;
  insertQueuedJob(job: SourceReparseJob): Promise<SourceReparseJob>;
  getJob(id: string): Promise<SourceReparseJob | null>;
  claimJob(id: string, now: string): Promise<SourceReparseJob | null>;
  completeJob(id: string, candidate: ReparseCandidate, now: string): Promise<boolean>;
  updateCandidate(id: string, actorId: string, candidate: ReparseCandidate, now: string): Promise<boolean>;
  failJob(id: string, code: string, terminal: boolean, now: string): Promise<boolean>;
  findPromotion(jobId: string): Promise<SourceReparsePromotion | null>;
  promoteJob(jobId: string, actorId: string, promotion: SourceReparsePromotion): Promise<SourceReparsePromotion>;
}

export interface SourceReparseServiceOptions {
  id?: () => string;
  now?: () => Date;
}

export class SourceReparseService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: SourceReparseRepositoryPort, options: SourceReparseServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(requestedBy: string, sourceVersionId: string): Promise<SourceReparseJob> {
    if (!requestedBy || !sourceVersionId) throw new AppError("SOURCE_REPARSE_INVALID", "Source reparse input is invalid", 400);
    const snapshot = await this.repository.findSourceVersionForReparse(sourceVersionId);
    if (!snapshot) throw new AppError("SOURCE_REPARSE_NOT_FOUND", "Source version not found", 404);
    const sourceFingerprint = await sourceReparseFingerprint(snapshot.sourceVersion);
    const existing = await this.repository.findJobByFingerprint(snapshot.sourceVersion.sourceId, sourceFingerprint);
    if (existing) return existing;
    const now = this.now().toISOString();
    return this.repository.insertQueuedJob({
      id: this.id(),
      sourceId: snapshot.sourceVersion.sourceId,
      baseSourceVersionId: snapshot.sourceVersion.id,
      submissionId: snapshot.sourceVersion.submissionId,
      requestedBy,
      parserVersion: "m2-v1",
      parserSchemaVersion: "m2-v1",
      sourceFingerprint,
      status: "queued",
      attempts: 0,
      candidate: undefined,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async process(jobId: string): Promise<SourceReparseJob> {
    const current = await this.repository.getJob(jobId);
    if (!current) throw new AppError("SOURCE_REPARSE_NOT_FOUND", "Source reparse job not found", 404);
    if (current.status === "indexed" || current.status === "failed_terminal") return current;
    const claimed = await this.repository.claimJob(jobId, this.now().toISOString());
    if (!claimed) return (await this.repository.getJob(jobId)) || current;
    try {
      const snapshot = await this.repository.findSourceVersionForReparse(claimed.baseSourceVersionId);
      if (!snapshot) throw new AppError("SOURCE_REPARSE_NOT_FOUND", "Source version not found", 404);
      const candidate = await buildReparseCandidate(snapshot.sourceVersion, {
        id: `${claimed.id}:candidate`,
        createdAt: this.now().toISOString(),
        kind: snapshot.kind,
      });
      if (candidate.sourceFingerprint !== claimed.sourceFingerprint) {
        throw new AppError("SOURCE_REPARSE_CONFLICT", "Source reparse fingerprint changed", 409);
      }
      const complete = await this.repository.completeJob(jobId, candidate, this.now().toISOString());
      if (!complete) throw new AppError("SOURCE_REPARSE_CONFLICT", "Source reparse job changed", 409, true);
    } catch (error) {
      const { code, terminal } = reparseFailure(error);
      await this.repository.failJob(jobId, code, terminal, this.now().toISOString());
    }
    return (await this.repository.getJob(jobId)) || claimed;
  }

  async correct(jobId: string, actorId: string, normalizedMarkdown: string): Promise<SourceReparseJob> {
    if (!jobId || !actorId || typeof normalizedMarkdown !== "string") {
      throw new AppError("SOURCE_REPARSE_INVALID", "Source reparse input is invalid", 400);
    }
    const job = await this.get(jobId);
    if (job.status !== "indexed" || !job.candidate) {
      throw new AppError("SOURCE_REPARSE_NOT_READY", "Source reparse candidate is not ready", 409, true);
    }
    const snapshot = await this.repository.findSourceVersionForReparse(job.baseSourceVersionId);
    if (!snapshot) throw new AppError("SOURCE_REPARSE_NOT_FOUND", "Source version not found", 404);
    const candidate = await buildManualReparseCandidate(snapshot.sourceVersion, {
      id: `${job.id}:candidate`,
      createdAt: this.now().toISOString(),
      kind: snapshot.kind,
      normalizedMarkdown,
    });
    candidate.sourceFingerprint = job.sourceFingerprint;
    const updated = await this.repository.updateCandidate(job.id, actorId, candidate, this.now().toISOString());
    if (!updated) throw new AppError("SOURCE_REPARSE_CONFLICT", "Source reparse job changed", 409, true);
    return (await this.repository.getJob(job.id)) || { ...job, candidate, updatedAt: candidate.createdAt };
  }

  async get(jobId: string): Promise<SourceReparseJob> {
    if (!jobId) throw new AppError("SOURCE_REPARSE_INVALID", "Source reparse input is invalid", 400);
    const job = await this.repository.getJob(jobId);
    if (!job) throw new AppError("SOURCE_REPARSE_NOT_FOUND", "Source reparse job not found", 404);
    return job;
  }

  async promote(jobId: string, actorId: string): Promise<SourceReparsePromotion> {
    if (!jobId || !actorId) throw new AppError("SOURCE_REPARSE_INVALID", "Source reparse input is invalid", 400);
    const job = await this.get(jobId);
    const existing = await this.repository.findPromotion(job.id);
    if (existing) return existing;
    if (job.status !== "indexed" || !job.candidate) {
      throw new AppError("SOURCE_REPARSE_NOT_READY", "Source reparse candidate is not ready", 409, true);
    }
    const promotion: SourceReparsePromotion = {
      submissionId: `${job.id}:submission`,
      sourceId: `${job.id}:source`,
      sourceVersionId: `${job.id}:source-version`,
    };
    try {
      return await this.repository.promoteJob(job.id, actorId, promotion);
    } catch (error) {
      const replay = await this.repository.findPromotion(job.id);
      if (replay) return replay;
      throw error;
    }
  }

  async snapshot(jobId: string): Promise<SourceReparseSnapshot> {
    const job = await this.get(jobId);
    const snapshot = await this.repository.findSourceVersionForReparse(job.baseSourceVersionId);
    if (!snapshot) throw new AppError("SOURCE_REPARSE_NOT_FOUND", "Source version not found", 404);
    return snapshot;
  }
}

function reparseFailure(error: unknown): { code: string; terminal: boolean } {
  if (error instanceof AppError) {
    return { code: safeErrorCode(error.code), terminal: !error.retryable };
  }
  return { code: "SOURCE_REPARSE_RETRYABLE", terminal: false };
}

function safeErrorCode(value: string): string {
  return /^SOURCE_[A-Z0-9_]+$/u.test(value) ? value : "SOURCE_REPARSE_RETRYABLE";
}
