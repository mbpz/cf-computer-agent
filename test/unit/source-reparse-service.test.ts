import { describe, expect, it } from "vitest";
import { SourceReparseService, type SourceReparseRepositoryPort } from "../../src/sources/reparse-service";
import type { SourceVersion } from "../../src/sources/types";

function sourceVersion(): SourceVersion {
  return {
    id: "source-version-1", sourceId: "source-1", submissionId: "submission-1", ordinal: 1,
    content: "# Stable\n\nBody\n", contentSha256: "a".repeat(64), parserVersion: "m1-v1",
    parserSchemaVersion: "m1-v2", sourceIdentitySha256: "b".repeat(64), codeMetadata: null,
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

function repository(): SourceReparseRepositoryPort & { jobs: Map<string, any>; snapshot: any } {
  const snapshot = { sourceVersion: sourceVersion(), kind: "markdown" as const, publishedRevisionId: "revision-current" };
  const store = {
    snapshot,
    jobs: new Map<string, any>(),
    promotions: new Map<string, any>(),
    async findSourceVersionForReparse() { return store.snapshot; },
    async findJobByFingerprint(_sourceId: string, fingerprint: string) {
      return [...store.jobs.values()].find((job) => job.sourceFingerprint === fingerprint) ?? null;
    },
    async insertQueuedJob(job: any) { store.jobs.set(job.id, { ...job }); return store.jobs.get(job.id)!; },
    async getJob(id: string) { return store.jobs.get(id) ?? null; },
    async claimJob(id: string, now: string) {
      const job = store.jobs.get(id);
      if (!job || !["queued", "failed_retryable"].includes(job.status) || job.attempts >= 3) return null;
      job.status = "processing"; job.attempts += 1; job.updatedAt = now; return { ...job };
    },
    async completeJob(id: string, candidate: any, now: string) {
      const job = store.jobs.get(id); if (!job || job.status !== "processing") return false;
      Object.assign(job, { status: "indexed", candidate, updatedAt: now }); return true;
    },
    async failJob(id: string, code: string, terminal: boolean, now: string) {
      const job = store.jobs.get(id); if (!job) return false;
      Object.assign(job, { status: terminal ? "failed_terminal" : "failed_retryable", lastErrorCode: code, updatedAt: now }); return true;
    },
    async findPromotion(id: string) { return store.promotions.get(id) ?? null; },
    async promoteJob(id: string, _actorId: string, promotion: any) {
      store.promotions.set(id, promotion);
      return promotion;
    },
  } as SourceReparseRepositoryPort & { jobs: Map<string, any>; promotions: Map<string, any>; snapshot: any };
  return store;
}

describe("SourceReparseService", () => {
  it("creates an idempotent queued job without changing a published revision", async () => {
    const repo = repository();
    const service = new SourceReparseService(repo, { id: () => "reparse-1", now: () => new Date("2026-08-26T01:00:00.000Z") });
    const first = await service.create("admin-1", "source-version-1");
    const replay = await service.create("admin-1", "source-version-1");
    expect(first).toMatchObject({ id: "reparse-1", status: "queued", baseSourceVersionId: "source-version-1", sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(replay).toEqual(first);
    expect(repo.snapshot.publishedRevisionId).toBe("revision-current");
  });

  it("processes a candidate into indexed state while retaining the old revision", async () => {
    const repo = repository();
    const service = new SourceReparseService(repo, { id: () => "reparse-2", now: () => new Date("2026-08-26T01:00:00.000Z") });
    const job = await service.create("admin-1", "source-version-1");
    const indexed = await service.process(job.id);
    expect(indexed.status).toBe("indexed");
    expect(indexed.candidate?.parserVersion).toBe("m2-v1");
    expect(indexed.candidate?.id).not.toBe("source-version-1");
    expect(repo.snapshot.publishedRevisionId).toBe("revision-current");
  });

  it("maps a candidate failure to a bounded retryable job state", async () => {
    const repo = repository();
    repo.snapshot.sourceVersion.content = "\0invalid";
    const service = new SourceReparseService(repo, { id: () => "reparse-3", now: () => new Date("2026-08-26T01:00:00.000Z") });
    const job = await service.create("admin-1", "source-version-1");
    const failed = await service.process(job.id);
    expect(failed).toMatchObject({ status: "failed_terminal", lastErrorCode: "SOURCE_METADATA_INVALID" });
  });

  it("materializes an indexed candidate once without changing the original revision", async () => {
    const repo = repository();
    const service = new SourceReparseService(repo, { id: () => "reparse-4", now: () => new Date("2026-08-26T01:00:00.000Z") });
    const job = await service.create("admin-1", "source-version-1");
    await service.process(job.id);
    const first = await service.promote(job.id, "admin-1");
    const replay = await service.promote(job.id, "admin-1");
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ submissionId: "reparse-4:submission", sourceVersionId: "reparse-4:source-version" });
    expect(repo.snapshot.publishedRevisionId).toBe("revision-current");
  });
});
