import { describe, expect, it } from "vitest";
import { SubmissionsService } from "../../src/submissions/service";
import type { SubmissionsRepositoryPort } from "../../src/submissions/repository";
import type { CreateSubmission, Submission, SubmissionPage } from "../../src/submissions/types";
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
});

function serviceFor(repository: FakeSubmissionsRepository): SubmissionsService {
  let nextId = 0;
  return new SubmissionsService(repository, {
    id: () => `${nextId++ === 0 ? "submission" : "audit"}-1`,
    now: () => new Date("2026-08-13T00:00:00.000Z"),
  });
}

class FakeSubmissionsRepository implements SubmissionsRepositoryPort {
  audit: CreateAuditEvent | undefined;

  async createWithAudit(submission: CreateSubmission, audit: CreateAuditEvent): Promise<Submission> {
    this.audit = audit;
    return submission;
  }

  async listOwned(): Promise<SubmissionPage> { return { items: [] }; }
  async listPending(): Promise<SubmissionPage> { return { items: [] }; }
}
