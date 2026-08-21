import { describe, expect, it } from "vitest";
import { SubmissionsService } from "../../src/submissions/service";
import {
  SubmissionsRepositoryConflictError,
  type CreateSubmissionWithSourceVersion,
  type SubmissionsRepositoryPort,
} from "../../src/submissions/repository";
import type { CreateSubmission, Submission, SubmissionCreateResult, SubmissionPage } from "../../src/submissions/types";
import type { CreateAuditEvent } from "../../src/audit/types";

describe("SubmissionsService", () => {
  it("normalizes a title and creates only review-pending text submissions", async () => {
    const repository = new FakeSubmissionsRepository();
    const service = serviceFor(repository);

    await expect(service.create("member-a", {
      requestedSpaceId: "default", kind: "text", title: "  A useful note  ", content: "Body",
    })).resolves.toMatchObject({
      id: "submission-1", submitterId: "member-a", title: "A useful note", kind: "text", status: "review_pending",
    });
    expect(repository.audit?.action).toBe("submission.created");
    expect(repository.audit?.metadata).toEqual({ kind: "text", requestedSpaceId: "default" });
  });

  it.each(["rich_text", "html", ""])('rejects unsupported submission kind "%s"', async (kind) => {
    const service = serviceFor(new FakeSubmissionsRepository());

    await expect(service.create("member-a", { requestedSpaceId: "default", kind: kind as "text", title: "Title", content: "Body" }))
      .rejects.toMatchObject({ code: "SUBMISSION_INVALID", status: 400 });
  });

  it("rejects blank titles and content outside the 1..128KiB UTF-8 range", async () => {
    const service = serviceFor(new FakeSubmissionsRepository());
    const base = { requestedSpaceId: "default", kind: "markdown" as const, title: "Title", content: "Body" };

    await expect(service.create("member-a", { ...base, title: " \n " })).rejects.toMatchObject({ code: "SUBMISSION_INVALID", status: 400 });
    await expect(service.create("member-a", { ...base, content: "" })).rejects.toMatchObject({ code: "SUBMISSION_INVALID", status: 400 });
    await expect(service.create("member-a", { ...base, content: "界".repeat(43_690) })).resolves.toMatchObject({ kind: "markdown" });
    await expect(service.create("member-a", { ...base, content: "界".repeat(43_691) })).rejects.toMatchObject({ code: "SUBMISSION_INVALID", status: 400 });
  });

  it.each([
    "short",
    "contains+punctuation",
    "a".repeat(129),
  ])("rejects invalid idempotency key %j before persistence", async (idempotencyKey) => {
    const repository = new FakeSubmissionsRepository();
    const service = serviceFor(repository);

    await expect(service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "text", title: "Title", content: "Body", idempotencyKey,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_INVALID", status: 400 });
    expect(repository.sourceCreation).toBeUndefined();
  });

  it("persists a server-parsed source version with a validated key", async () => {
    const repository = new FakeSubmissionsRepository();
    const service = serviceFor(repository);

    await service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "markdown", title: " Title ", content: "# A  \r\n", idempotencyKey: "abcdefghijklmnop",
    });

    expect(repository.sourceCreation).toMatchObject({
      submission: { id: "submission-1", title: "Title", idempotencyKey: "abcdefghijklmnop" },
      source: { id: "source-1", title: "Title" },
      sourceVersion: {
        id: "source-version-1",
        content: "# A\n",
        contentSha256: "aa1237b773c38dbddef583c4868aaea7a44c5237ea7923aecca5513764b42d80",
        parserVersion: "m1-v1",
      },
    });
  });

  it("maps an exact-key payload or target mismatch to a typed 409", async () => {
    const repository = new FakeSubmissionsRepository();
    repository.conflict = new SubmissionsRepositoryConflictError("idempotency_conflict");
    const service = serviceFor(repository);

    await expect(service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "text", title: "Title", content: "Changed", idempotencyKey: "abcdefghijklmnop",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
  });
});

function serviceFor(repository: FakeSubmissionsRepository): SubmissionsService {
  let nextId = 0;
  const ids = ["submission-1", "source-1", "source-version-1", "audit-1"];
  return new SubmissionsService(repository, {
    id: () => ids[nextId++]!,
    now: () => new Date("2026-08-13T00:00:00.000Z"),
  });
}

class FakeSubmissionsRepository implements SubmissionsRepositoryPort {
  audit: CreateAuditEvent | undefined;
  sourceCreation: CreateSubmissionWithSourceVersion | undefined;
  conflict: SubmissionsRepositoryConflictError | undefined;

  async createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission> {
    this.audit = audit;
    return submission;
  }

  async createWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult> {
    this.sourceCreation = input;
    if (this.conflict) throw this.conflict;
    const { idempotencyKey: _idempotencyKey, ...submission } = input.submission;
    return { submission, source: input.source, sourceVersion: input.sourceVersion, duplicateCandidate: null };
  }

  async listOwned(): Promise<SubmissionPage> { return { items: [] }; }
  async listPending(): Promise<SubmissionPage> { return { items: [] }; }
}
