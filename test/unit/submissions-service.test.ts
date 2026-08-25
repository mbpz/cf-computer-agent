import { describe, expect, it } from "vitest";
import { SubmissionsService } from "../../src/submissions/service";
import {
  SubmissionsRepositoryConflictError,
  type CreateSubmissionWithSourceVersion,
  type SubmissionsRepositoryPort,
} from "../../src/submissions/repository";
import type { CreateSubmission, Submission, SubmissionCreateResult, SubmissionPage } from "../../src/submissions/types";
import type { CreateAuditEvent } from "../../src/audit/types";
import { m1ParserCases } from "../fixtures/m1-parser-cases";

describe("SubmissionsService", () => {
  it.each(m1ParserCases.filter((fixture) => !fixture.expected.ok))(
    "does not persist invalid independent fixture $id",
    async (fixture) => {
      const expected = fixture.expected;
      if (expected.ok) throw new Error("Expected an invalid parser fixture");
      const repository = new FakeSubmissionsRepository();
      const service = serviceFor(repository);
      const contentBase64 = base64Of(fixture.bytes);

      await expect(service.createWithSourceVersion("member-a", {
        requestedSpaceId: "default", kind: fixture.kind, title: "Fixture", contentBase64,
        idempotencyKey: "abcdefghijklmnop", ...fixture.metadata,
      })).rejects.toMatchObject({ code: expected.code, status: 400 });
      expect(repository.sourceCreation).toBeUndefined();
    },
  );

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

  it("saves partial drafts and only the owner can continue editing", async () => {
    const repository = new FakeSubmissionsRepository();
    const service = serviceFor(repository);
    const draft = await service.createDraft("member-a", {
      requestedSpaceId: "default", kind: "markdown", title: "", content: "",
    });
    expect(draft).toMatchObject({ id: "submission-1", status: "draft", submitterId: "member-a" });
    repository.draft = draft;
    await expect(service.getDraft("member-a", draft.id)).resolves.toMatchObject({ status: "draft" });
    await expect(service.getDraft("member-b", draft.id)).rejects.toMatchObject({ code: "SUBMISSION_NOT_FOUND", status: 404 });
    await expect(service.updateDraft("member-a", draft.id, {
      requestedSpaceId: "default", kind: "markdown", title: "Updated", content: "# Body",
    })).resolves.toMatchObject({ title: "Updated", content: "# Body", status: "draft" });
    repository.draft = { ...draft, status: "review_pending" };
    await expect(service.updateDraft("member-a", draft.id, {
      requestedSpaceId: "default", kind: "markdown", title: "No", content: "No",
    })).rejects.toMatchObject({ code: "SUBMISSION_NOT_FOUND", status: 404 });
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
        parserSchemaVersion: "m1-v2",
        sourceIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
  });

  it.each([
    ["text", `!${"a".repeat(128 * 1024 - 1)}`],
    ["markdown", "a".repeat(128 * 1024)],
    ["code", "a".repeat(128 * 1024)],
  ] as const)("rejects normalized-oversize %s before any submission, source, or version persistence", async (kind, content) => {
    const repository = new FakeSubmissionsRepository();
    const service = serviceFor(repository);

    await expect(service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default",
      kind,
      title: "Title",
      content,
      idempotencyKey: "abcdefghijklmnop",
    })).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE", status: 400 });
    expect(repository.sourceCreation).toBeUndefined();
  });

  it.each([
    ["ordinary whitespace", " \t\r\n"],
    ["1,201-space oversized line", " ".repeat(1_201)],
  ])("rejects %s code before any submission, source, or version persistence", async (_label, content) => {
    const repository = new FakeSubmissionsRepository();
    const service = serviceFor(repository);

    await expect(service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default",
      kind: "code",
      title: "Title",
      content,
      idempotencyKey: "abcdefghijklmnop",
    })).rejects.toMatchObject({ code: "SOURCE_EMPTY", status: 400 });
    expect(repository.sourceCreation).toBeUndefined();
  });

  it("maps an exact-key payload or target mismatch to a typed 409", async () => {
    const repository = new FakeSubmissionsRepository();
    repository.conflict = new SubmissionsRepositoryConflictError("idempotency_conflict");
    const service = serviceFor(repository);

    await expect(service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "text", title: "Title", content: "Changed", idempotencyKey: "abcdefghijklmnop",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
  });

  it("creates an immutable owner resubmission with a new source/version and allowlisted audit", async () => {
    const repository = new FakeSubmissionsRepository();
    repository.prior = {
      id: "submission-old", submitterId: "member-a", requestedSpaceId: "default",
      requestedCollectionId: null, requestedVisibility: "admin_only", kind: "markdown",
      status: "revision_requested", title: "Old title", content: "Old body",
      createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
    } as Submission;
    const service = serviceFor(repository);

    const result = await service.resubmit("member-a", "submission-old", {
      kind: "markdown", title: "Revised title", content: "# Revised\n",
    }, "new-resubmit-key1");

    expect(result.submission).toMatchObject({
      id: "submission-1", submitterId: "member-a", status: "review_pending",
      supersedesSubmissionId: "submission-old", requestedSpaceId: "default",
      requestedVisibility: "admin_only",
    });
    expect(repository.resubmission?.sourceVersion.submissionId).toBe("submission-1");
    expect(repository.resubmission?.audit).toMatchObject({
      action: "submission.resubmitted", actorId: "member-a", resourceId: "submission-1",
      metadata: { supersedesSubmissionId: "submission-old", requestedSpaceId: "default", requestedVisibility: "admin_only" },
    });
  });

  it("rejects an owner attempt to widen an admin-only resubmission before parsing or persistence", async () => {
    const repository = new FakeSubmissionsRepository();
    repository.prior = {
      id: "submission-old", submitterId: "member-a", requestedSpaceId: "default",
      requestedCollectionId: null, requestedVisibility: "admin_only", kind: "markdown",
      status: "revision_requested", title: "Old title", content: "Old body",
      createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
    } as Submission;
    const service = serviceFor(repository);

    await expect(service.resubmit("member-a", "submission-old", {
      requestedVisibility: "shared", kind: "markdown", title: "Revised title",
      contentBase64: "not canonical base64",
    }, "new-resubmit-key1")).rejects.toMatchObject({
      code: "SUBMISSION_VISIBILITY_EXPANSION_FORBIDDEN", status: 400,
    });
    expect(repository.resubmission).toBeUndefined();
  });

  it("authorizes the prior owner/state before parsing resubmission input", async () => {
    const repository = new FakeSubmissionsRepository();
    const service = serviceFor(repository);

    await expect(service.resubmit("forged-owner", "submission-old", {
      kind: "markdown", title: "", contentBase64: "not base64",
    }, "new-resubmit-key1")).rejects.toMatchObject({ code: "SUBMISSION_NOT_FOUND", status: 404 });
    expect(repository.resubmission).toBeUndefined();
  });

  it("maps resubmission idempotency and state races without exposing another owner", async () => {
    const repository = new FakeSubmissionsRepository();
    repository.prior = {
      id: "submission-old", submitterId: "member-a", requestedSpaceId: "default",
      requestedCollectionId: null, requestedVisibility: "shared", kind: "text",
      status: "revision_requested", title: "Old", content: "Old",
      createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
    } as Submission;
    repository.conflict = new SubmissionsRepositoryConflictError("resubmission_conflict" as never);
    const service = serviceFor(repository);

    await expect(service.resubmit("member-a", "submission-old", {
      kind: "text", title: "Revised", content: "Revised",
    }, "new-resubmit-key1")).rejects.toMatchObject({ code: "RESUBMISSION_STATE_CONFLICT", status: 409 });
  });
});

function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

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
  prior: Submission | null = null;
  resubmission: CreateSubmissionWithSourceVersion | undefined;

  async createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission> {
    this.audit = audit;
    return submission;
  }

  draft: Submission | undefined;
  async createDraft(submission: CreateSubmission, _audit: CreateAuditEvent): Promise<Submission> {
    this.draft = { ...submission, status: "draft" };
    return this.draft;
  }
  async findOwnedDraft(submitterId: string, submissionId: string): Promise<Submission | null> {
    return this.draft?.submitterId === submitterId && this.draft.id === submissionId && this.draft.status === "draft"
      ? this.draft : null;
  }
  async updateDraft(submission: CreateSubmission, _audit: CreateAuditEvent): Promise<Submission | null> {
    if (!await this.findOwnedDraft(submission.submitterId, submission.id)) return null;
    this.draft = { ...submission, status: "draft" };
    return this.draft;
  }

  async createWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult> {
    this.sourceCreation = input;
    if (this.conflict) throw this.conflict;
    const { idempotencyKey: _idempotencyKey, ...submission } = input.submission;
    return { submission, source: input.source, sourceVersion: input.sourceVersion, duplicateCandidate: null };
  }

  async findResubmittable(memberId: string, priorSubmissionId: string): Promise<Submission | null> {
    return this.prior?.submitterId === memberId && this.prior.id === priorSubmissionId
      && this.prior.status === "revision_requested" ? this.prior : null;
  }

  async createResubmissionWithSourceVersion(input: CreateSubmissionWithSourceVersion): Promise<SubmissionCreateResult> {
    this.resubmission = input;
    if (this.conflict) throw this.conflict;
    const { idempotencyKey: _idempotencyKey, ...submission } = input.submission;
    return { submission, source: input.source, sourceVersion: input.sourceVersion, duplicateCandidate: null };
  }

  async listOwned(): Promise<SubmissionPage> { return { items: [] }; }
  async listPending(): Promise<SubmissionPage> { return { items: [] }; }
}
