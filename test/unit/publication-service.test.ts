import { describe, expect, it } from "vitest";
import { parseSource } from "../../src/sources/parser";
import { chunkDocument } from "../../src/sources/chunker";
import { PublicationService } from "../../src/publication/service";
import type {
  PublicationIntent,
  PublicationRepositoryPort,
  PublishSubmissionInput,
  PublishedRevision,
  PublicationReviewer,
  ReviewDecision,
  ReviewSubmissionSnapshot,
} from "../../src/publication/types";
import { TagsService } from "../../src/tags/service";
import type { Tag, TagsRepositoryPort } from "../../src/tags/types";

const reviewer = { id: "admin-1", role: "admin" as const, status: "active" as const };
const publishInput: PublishSubmissionInput = {
  title: "Trusted title",
  visibility: "shared",
  spaceId: "default",
  collectionId: "collection-1",
  tagIds: ["tag-1", "tag-2"],
};

describe("PublicationService", () => {
  it("requires an active administrator to rollback a knowledge item revision", async () => {
    const revision: PublishedRevision = {
      id: "revision-previous",
      knowledgeItemId: "knowledge-1",
      sourceVersionId: "source-version-previous",
      normalizedPath: "/workspace/published/default/knowledge-1/revision-previous.md",
      contentSha256: "a".repeat(64),
      title: "Previous",
      tagIds: [],
      visibility: "shared",
      publishedBy: "admin-1",
      publishedAt: "2026-08-22T00:00:00.000Z",
      searchStatus: "pending",
    };
    const repository = {
      async rollback() { return revision; },
      async processIndexJob() { return "indexed" as const; },
    };
    const service = new PublicationService(
      repository as never,
      { commit: async () => ({ path: "", contentSha256: "", bytes: 0 }) },
    );

    await expect((service as unknown as {
      rollback(reviewer: PublicationReviewer, knowledgeItemId: string, revisionId: string): Promise<PublishedRevision>;
    }).rollback(reviewer, "knowledge-1", "revision-previous")).resolves.toMatchObject({
      id: "revision-previous", searchStatus: "indexed",
    });
    await expect((service as unknown as {
      rollback(reviewer: PublicationReviewer, knowledgeItemId: string, revisionId: string): Promise<PublishedRevision>;
    }).rollback({ ...reviewer, role: "contributor" } as PublicationReviewer, "knowledge-1", "revision-previous"))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it.each([
    ["splitting", "markdown", `# Split\n\n${"x".repeat(1_350)}\n`],
    ["heading-only", "markdown", "# Only heading\n"],
    ["fenced-code-heading", "markdown", "# Real heading\n\n```text\n# not a heading\nvalue\n```\n"],
    ["absolute-lines", "markdown", "# One\n\nfirst\n\n## Two\n\nsecond\n"],
  ] as const)("returns %s preview locations from the exact publication chunker", async (_case, kind, content) => {
    const fixture = await publicationFixture();
    await replaceFixtureSource(fixture.intent, content, kind);

    const preview = await fixture.service.preview(reviewer, "submission-1");
    const publicationChunks = chunkDocument({ normalizedMarkdown: content, kind });

    expect(preview.chunks).toEqual(publicationChunks.map((chunk) => ({
      headingPath: chunk.headingPath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      excerpt: [...chunk.body].slice(0, 240).join(""),
    })));
    expect(preview.chunks.every((chunk) => [...chunk.excerpt].length <= 240)).toBe(true);
    expect(JSON.stringify(preview.chunks)).not.toMatch(/normalizedPath|contentSha256|sourceVersionId/u);
    if (_case === "splitting") expect(preview.chunks.length).toBeGreaterThan(1);
    if (_case === "heading-only") expect(preview.chunks).toEqual([
      { headingPath: ["Only heading"], startLine: 1, endLine: 1, excerpt: "# Only heading" },
    ]);
    if (_case === "fenced-code-heading") {
      expect(preview.chunks).toEqual([expect.objectContaining({ headingPath: ["Real heading"], startLine: 3, endLine: 6 })]);
      expect(preview.chunks.flatMap((chunk) => chunk.headingPath)).not.toContain("not a heading");
    }
    if (_case === "absolute-lines") expect(preview.chunks.at(-1)).toMatchObject({ startLine: 7, endLine: 7 });
  });

  it("returns admin-only sensitive advice without changing requested visibility", async () => {
    const fixture = await publicationFixture();
    fixture.preview.rawContent = "部署说明：Authorization: Bearer ghp_1234567890abcdefghijklmnop";

    const preview = await fixture.service.preview(reviewer, "submission-1");
    expect(preview.safety).toMatchObject({
      status: "advisory",
      findings: [expect.objectContaining({ code: "credential", severity: "high" })],
    });
    expect(JSON.stringify(preview.safety)).not.toContain("ghp_1234567890abcdefghijklmnop");
    await expect(fixture.service.publish(reviewer, "submission-1", publishInput)).resolves.toMatchObject({ visibility: "shared" });
  });

  it("moves a stable intent through content, atomic finalization, and a separate index job", async () => {
    const fixture = await publicationFixture();
    const result = await fixture.service.publish(reviewer, "submission-1", publishInput);

    expect(result).toMatchObject({
      id: "revision-1",
      knowledgeItemId: "knowledge-1",
      visibility: "shared",
      searchStatus: "indexed",
    });
    expect(fixture.events).toEqual([
      "validate-target",
      "create-intent",
      "commit-content",
      "mark-content-written",
      "finalize:2",
      "process-index",
    ]);
    expect(fixture.commits).toEqual([{
      spaceId: "default",
      knowledgeItemId: "knowledge-1",
      revisionId: "revision-1",
      contentSha256: fixture.intent.contentSha256,
      markdown: fixture.intent.sourceVersion.content,
    }]);
    expect(fixture.finalizedChunks).toEqual([
      expect.objectContaining({ ordinal: 0, headingPath: ["Trusted"], startLine: 3, endLine: 3, body: "First paragraph." }),
      expect.objectContaining({ ordinal: 1, headingPath: ["Trusted"], startLine: 5, endLine: 5, body: "Second paragraph." }),
    ]);
  });

  it("replays an ambiguous content-RPC response and completes exactly the same intent", async () => {
    const fixture = await publicationFixture({ contentResponseLoss: true });

    await expect(fixture.service.publish(reviewer, "submission-1", publishInput)).rejects.toThrow("response lost");
    expect(fixture.intent.state).toBe("pending_content");

    const recovery = await fixture.service.recoverPending(20);
    expect(recovery).toEqual({ recoveredIntents: 1, recoveredIndexJobs: 0, failures: [] });
    expect(fixture.intent.state).toBe("completed");
    expect(fixture.commits).toHaveLength(2);
    expect(fixture.commits[1]).toEqual(fixture.commits[0]);
    expect(fixture.finalizeCount).toBe(1);
  });

  it("resumes after a lost D1 mark response without writing content a second time", async () => {
    const fixture = await publicationFixture({ markResponseLoss: true });

    await expect(fixture.service.publish(reviewer, "submission-1", publishInput)).rejects.toThrow("mark response lost");
    expect(fixture.intent.state).toBe("content_written");
    await expect(fixture.service.recoverPending(20)).resolves.toMatchObject({ recoveredIntents: 1, failures: [] });

    expect(fixture.commits).toHaveLength(1);
    expect(fixture.finalizeCount).toBe(1);
  });

  it("leaves an intent recoverable after VFS or D1 finalization failure", async () => {
    const vfs = await publicationFixture({ vfsFailure: true });
    await expect(vfs.service.publish(reviewer, "submission-1", publishInput)).rejects.toThrow("VFS unavailable");
    expect(vfs.intent.state).toBe("pending_content");
    expect(vfs.finalizeCount).toBe(0);

    const d1 = await publicationFixture({ finalizeFailure: true });
    await expect(d1.service.publish(reviewer, "submission-1", publishInput)).rejects.toThrow("D1 unavailable");
    expect(d1.intent.state).toBe("content_written");
    await expect(d1.service.recoverPending(20)).resolves.toMatchObject({ recoveredIntents: 1, failures: [] });
    expect(d1.intent.state).toBe("completed");
    expect(d1.finalizeCount).toBe(1);
  });

  it("recovers a finalized response loss by replaying only its durable index job", async () => {
    const fixture = await publicationFixture({ finalizeResponseLoss: true });
    await expect(fixture.service.publish(reviewer, "submission-1", publishInput)).rejects.toThrow("finalize response lost");
    expect(fixture.intent.state).toBe("completed");

    const recovery = await fixture.service.recoverPending(20);
    expect(recovery).toEqual({ recoveredIntents: 0, recoveredIndexJobs: 1, failures: [] });
    expect(fixture.finalizeCount).toBe(1);
    expect(fixture.indexCount).toBe(1);
  });

  it("denies non-admin and disabled reviewers before reading submission data", async () => {
    const fixture = await publicationFixture();
    for (const denied of [
      { id: "contributor-1", role: "contributor" as const, status: "active" as const },
      { id: "admin-1", role: "admin" as const, status: "disabled" as const },
    ]) {
      await expect(fixture.service.publish(denied, "submission-1", publishInput))
        .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    expect(fixture.events).toEqual([]);
  });

  it.each([
    [{ ...publishInput, title: "line\nbreak" }, "PUBLICATION_INPUT_INVALID"],
    [{ ...publishInput, title: "x".repeat(201) }, "PUBLICATION_INPUT_INVALID"],
    [{ ...publishInput, visibility: "public" }, "PUBLICATION_INPUT_INVALID"],
    [{ ...publishInput, visibilityReasonCode: "unbounded-reason" }, "PUBLICATION_INPUT_INVALID"],
    [{ ...publishInput, tagIds: ["tag-1", "tag-1"] }, "PUBLICATION_INPUT_INVALID"],
    [{ ...publishInput, tagIds: Array.from({ length: 21 }, (_, index) => `tag-${index}`) }, "PUBLICATION_INPUT_INVALID"],
  ])("rejects malformed publish input before creating an intent", async (input, code) => {
    const fixture = await publicationFixture();
    await expect(fixture.service.publish(reviewer, "submission-1", input as PublishSubmissionInput))
      .rejects.toMatchObject({ code, status: 400 });
    expect(fixture.events).toEqual([]);
  });

  it("rejects inactive or cross-space targets and refuses visibility/content drift on replay", async () => {
    const inactive = await publicationFixture({ targetFailure: true });
    await expect(inactive.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_TARGET_INVALID", status: 400 });
    expect(inactive.events).toEqual(["validate-target"]);

    const visibility = await publicationFixture();
    visibility.intent.visibility = "admin_only";
    await expect(visibility.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_STATE_CONFLICT", status: 409 });
    expect(visibility.commits).toHaveLength(0);

    const content = await publicationFixture();
    content.intent.contentSha256 = "0".repeat(64);
    await expect(content.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_CONTENT_MISMATCH", status: 409 });
    expect(content.commits).toHaveLength(0);
  });

  it("permits narrowing but requires the exact second-confirmation reason to expand requested visibility", async () => {
    const narrowing = await publicationFixture();
    narrowing.preview.requestedVisibility = "shared";
    narrowing.intent.visibility = "admin_only";
    await expect(narrowing.service.publish(reviewer, "submission-1", {
      ...publishInput, visibility: "admin_only",
    })).resolves.toMatchObject({ visibility: "admin_only" });

    const expansion = await publicationFixture();
    expansion.preview.requestedVisibility = "admin_only";
    await expect(expansion.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_VISIBILITY_EXPANSION_CONFIRMATION_REQUIRED", status: 400 });
    expect(expansion.events).toEqual([]);

    const confirmed = await publicationFixture();
    confirmed.preview.requestedVisibility = "admin_only";
    confirmed.intent.visibilityReasonCode = "admin_visibility_expansion";
    await expect(confirmed.service.publish(reviewer, "submission-1", {
      ...publishInput, visibilityReasonCode: "admin_visibility_expansion",
    })).resolves.toMatchObject({ visibility: "shared" });
  });

  it("treats any normalized patch retry drift, including target and expansion reason, as a stable state conflict", async () => {
    const fixture = await publicationFixture();
    fixture.intent.spaceId = "other-space";
    fixture.intent.collectionId = null;
    await expect(fixture.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_STATE_CONFLICT", status: 409 });
    expect(fixture.commits).toHaveLength(0);

    const reason = await publicationFixture();
    reason.intent.visibilityReasonCode = "admin_visibility_expansion";
    await expect(reason.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_STATE_CONFLICT", status: 409 });
  });

  it("rejects a legacy normalized-oversize SourceVersion before creating a publication intent", async () => {
    const fixture = await publicationFixture();
    const oversized = `${"a".repeat(128 * 1024)}\n`;
    fixture.intent.sourceVersion.content = oversized;
    fixture.intent.sourceVersion.contentSha256 = await sha256(oversized);
    fixture.intent.contentSha256 = fixture.intent.sourceVersion.contentSha256;

    await expect(fixture.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_CONTENT_MISMATCH", status: 409 });
    expect(fixture.events).toEqual(["validate-target"]);
    expect(fixture.commits).toHaveLength(0);
  });

  it.each([
    ["257 paragraph chunks", Array.from({ length: 257 }, (_, index) => `paragraph ${index + 1}`).join("\n\n") + "\n", "markdown"],
    ["whitespace-only legacy code", `\`\`\`text\n${" ".repeat(1_201)}\n\`\`\`\n`, "code"],
  ] as const)("rejects %s before creating an intent or committing content", async (_label, content, kind) => {
    const fixture = await publicationFixture();
    await replaceFixtureSource(fixture.intent, content, kind);

    await expect(fixture.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_CONTENT_MISMATCH", status: 409 });
    expect(fixture.events).toEqual(["validate-target"]);
    expect(fixture.commits).toHaveLength(0);
  });

  it.each([
    ["257 chunks", Array.from({ length: 257 }, (_, index) => `paragraph ${index + 1}`).join("\n\n") + "\n", "markdown"],
    ["semantically empty code", "```text\n   \n```\n", "code"],
  ] as const)("terminalizes a legacy pending intent with %s so recovery does not retry forever", async (_label, content, kind) => {
    const fixture = await publicationFixture();
    await replaceFixtureSource(fixture.intent, content, kind);

    await expect(fixture.service.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 0,
      recoveredIndexJobs: 0,
      failures: [{ resourceId: "submission-1", code: "PUBLICATION_RECOVERY_FAILED" }],
    });
    expect(fixture.intent.state).toBe("failed_terminal");
    expect(fixture.events).toEqual(["terminalize-intent"]);
    expect(fixture.commits).toHaveLength(0);

    await expect(fixture.service.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 0,
      recoveredIndexJobs: 0,
      failures: [],
    });
    expect(fixture.events).toEqual(["terminalize-intent"]);
  });

  it("maps a target invalidated between validation and intent creation to the public target error", async () => {
    const fixture = await publicationFixture({ createIntentTargetFailure: true });
    await expect(fixture.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_TARGET_INVALID", status: 400 });
    expect(fixture.commits).toHaveLength(0);
  });

  it("maps a submission terminalized before intent creation to a stable publication-state conflict", async () => {
    const fixture = await publicationFixture({ createIntentStateFailure: true });
    await expect(fixture.service.publish(reviewer, "submission-1", publishInput))
      .rejects.toMatchObject({ code: "PUBLICATION_STATE_CONFLICT", status: 409 });
    expect(fixture.commits).toHaveLength(0);
  });

  it("bounds recovery by resources scanned even when an intent recovery fails", async () => {
    const fixture = await publicationFixture({ vfsFailure: true });
    let indexCalls = 0;
    fixture.repository.listRecoverableIndexRevisionIds = async () => ["other-revision"];
    fixture.repository.processIndexJob = async () => { indexCalls += 1; return "indexed"; };

    await expect(fixture.service.recoverPending(1)).resolves.toEqual({
      recoveredIntents: 0,
      recoveredIndexJobs: 0,
      failures: [{ resourceId: "submission-1", code: "PUBLICATION_RECOVERY_FAILED" }],
    });
    expect(indexCalls).toBe(0);
  });

  it("does not report a retryable degraded index job as recovered", async () => {
    const fixture = await publicationFixture();
    fixture.intent.state = "completed";
    fixture.repository.listRecoverableIndexRevisionIds = async () => [fixture.intent.revisionId];
    fixture.repository.processIndexJob = async () => "search_degraded";

    await expect(fixture.service.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 0,
      recoveredIndexJobs: 0,
      failures: [{ resourceId: "revision-1", code: "INDEX_RECOVERY_FAILED" }],
    });
  });

  it("reports one index failure when a content-written recovery publishes but remains search-degraded", async () => {
    const fixture = await publicationFixture();
    fixture.intent.state = "content_written";
    fixture.repository.processIndexJob = async () => "search_degraded";
    fixture.repository.listRecoverableIndexRevisionIds = async () => [fixture.intent.revisionId];

    await expect(fixture.service.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 0,
      recoveredIndexJobs: 0,
      failures: [{ resourceId: "revision-1", code: "INDEX_RECOVERY_FAILED" }],
    });
    expect(fixture.finalizeCount).toBe(1);
  });

  it("stores reject and revision-request notes in review records but passes only allowlisted reason codes", async () => {
    const fixture = await publicationFixture();
    const rejected = await fixture.service.reject(reviewer, "submission-1", {
      reasonCode: "unsafe",
      note: "Free text stays in the review row",
    });
    expect(rejected).toMatchObject({ decision: "rejected", reasonCode: "unsafe", note: "Free text stays in the review row" });
    expect(fixture.rejectionInputs).toEqual([{ reasonCode: "unsafe", note: "Free text stays in the review row" }]);

    const revision = await fixture.service.requestRevision(reviewer, "submission-2", {
      reasonCode: "needs_revision",
      note: "Clarify the source location",
    });
    expect(revision).toMatchObject({ decision: "revision_requested", reasonCode: "needs_revision" });
    expect(fixture.revisionInputs).toEqual([{ reasonCode: "needs_revision", note: "Clarify the source location" }]);
  });

  it("runs bounded batch review actions independently and reports partial failures", async () => {
    const fixture = await publicationFixture();
    fixture.repository.reject = async (submissionId, _reviewerId, input) => {
      if (submissionId === "submission-fail") throw new Error("missing submission");
      fixture.rejectionInputs.push(input);
      return {
        submissionId, reviewerId: "admin-1", decision: "rejected", reasonCode: input.reasonCode,
        note: input.note, title: "Submitted title", visibility: "admin_only", createdAt: "2026-08-22T00:00:00.000Z",
      };
    };
    fixture.repository.requestRevision = async (submissionId, _reviewerId, input) => {
      fixture.revisionInputs.push(input);
      return {
        submissionId, reviewerId: "admin-1", decision: "revision_requested", reasonCode: "needs_revision",
        note: input.note, title: "Submitted title", visibility: "admin_only", createdAt: "2026-08-22T00:00:00.000Z",
      };
    };

    const batchReview = (fixture.service as unknown as {
      batchReview(reviewer: PublicationReviewer, actions: unknown[]): Promise<unknown>;
    }).batchReview.bind(fixture.service);
    await expect(batchReview(reviewer, [
      { submissionId: "submission-1", action: "reject", reasonCode: "unsafe", note: "Unsafe" },
      { submissionId: "submission-2", action: "request_revision", reasonCode: "needs_revision", note: "Clarify" },
      { submissionId: "submission-fail", action: "reject", reasonCode: "duplicate", note: "Missing" },
    ])).resolves.toEqual({
      requested: 3,
      succeeded: 2,
      failed: 1,
      items: [
        { submissionId: "submission-1", action: "reject", status: "succeeded", result: expect.objectContaining({ decision: "rejected" }) },
        { submissionId: "submission-2", action: "request_revision", status: "succeeded", result: expect.objectContaining({ decision: "revision_requested" }) },
        { submissionId: "submission-fail", action: "reject", status: "failed", error: { code: "INTERNAL_ERROR", status: 500, retryable: true } },
      ],
    });
    expect(fixture.rejectionInputs).toHaveLength(1);
    expect(fixture.revisionInputs).toHaveLength(1);
  });

  it("rejects empty, duplicate, and oversized batch review requests before any write", async () => {
    const fixture = await publicationFixture();
    const batchReview = (fixture.service as unknown as {
      batchReview(reviewer: PublicationReviewer, actions: unknown[]): Promise<unknown>;
    }).batchReview.bind(fixture.service);
    await expect(batchReview(reviewer, [])).rejects.toMatchObject({ code: "BATCH_REVIEW_REQUEST_INVALID", status: 400 });
    await expect(batchReview(reviewer, [
      { submissionId: "submission-1", action: "reject", reasonCode: "unsafe", note: "A" },
      { submissionId: "submission-1", action: "reject", reasonCode: "unsafe", note: "B" },
    ])).rejects.toMatchObject({ code: "BATCH_REVIEW_REQUEST_INVALID", status: 400 });
    await expect(batchReview(reviewer, Array.from({ length: 21 }, (_, index) => ({
      submissionId: `submission-${index}`, action: "reject", reasonCode: "unsafe", note: "A",
    })))).rejects.toMatchObject({ code: "BATCH_REVIEW_REQUEST_INVALID", status: 400 });
    expect(fixture.rejectionInputs).toEqual([]);
  });

  it("maps repository decision races to a stable review-state conflict", async () => {
    const fixture = await publicationFixture({ decisionConflict: true });
    await expect(fixture.service.reject(reviewer, "submission-1", { reasonCode: "duplicate", note: "Already handled" }))
      .rejects.toMatchObject({ code: "REVIEW_STATE_CONFLICT", status: 409 });
    await expect(fixture.service.requestRevision(reviewer, "submission-1", { reasonCode: "needs_revision", note: "Already handled" }))
      .rejects.toMatchObject({ code: "REVIEW_STATE_CONFLICT", status: 409 });
  });
});

describe("TagsService", () => {
  it("binds paginated tag requests to a stable non-reversible Space scope key", async () => {
    const requests: Array<{ spaceId: string; cursorKey?: string }> = [];
    const repository: TagsRepositoryPort = {
      async create(tag) { return tag; },
      async listActive() { return []; },
      async listActivePage(spaceId, request) {
        requests.push({ spaceId, cursorKey: request.cursorKey });
        return { items: [] };
      },
      async findActiveByIds() { return []; },
    };
    const service = new TagsService(repository);

    await service.listActivePage("space-a", { limit: 2 });
    await service.listActivePage("space-a", { limit: 2 });
    await service.listActivePage("space-b", { limit: 2 });

    expect(requests.map(({ cursorKey }) => cursorKey)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      requests[0]?.cursorKey,
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    ]);
    expect(requests[2]?.cursorKey).not.toBe(requests[0]?.cursorKey);
    expect(requests.map(({ cursorKey }) => cursorKey)).not.toContain("space-a");
  });

  it("normalizes a tag and delegates active-space persistence", async () => {
    const created: Tag[] = [];
    const repository: TagsRepositoryPort = {
      async create(tag) { created.push(tag); return tag; },
      async listActive() { return created.filter((tag) => tag.status === "active"); },
      async listActivePage() { return { items: [] }; },
      async findActiveByIds(_spaceId, ids) { return created.filter((tag) => ids.includes(tag.id)); },
    };
    const service = new TagsService(repository, {
      id: () => "tag-1",
      now: () => new Date("2026-08-22T00:00:00.000Z"),
    });

    await expect(service.create({ spaceId: "default", slug: "trusted-source", name: " Trusted Source " }))
      .resolves.toEqual({
        id: "tag-1", spaceId: "default", slug: "trusted-source", name: "Trusted Source", status: "active",
        createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z",
      });
    await expect(service.listActive("default")).resolves.toHaveLength(1);
  });

  it.each([
    { spaceId: "", slug: "valid", name: "Valid" },
    { spaceId: "default", slug: "Not Valid", name: "Valid" },
    { spaceId: "default", slug: "valid", name: "line\nbreak" },
  ])("rejects malformed tags without persistence", async (input) => {
    let writes = 0;
    const repository: TagsRepositoryPort = {
      async create(tag) { writes += 1; return tag; },
      async listActive() { return []; },
      async listActivePage() { return { items: [] }; },
      async findActiveByIds() { return []; },
    };
    await expect(new TagsService(repository).create(input)).rejects.toMatchObject({ code: "TAG_INVALID", status: 400 });
    expect(writes).toBe(0);
  });
});

interface PublicationFixtureOptions {
  contentResponseLoss?: boolean;
  markResponseLoss?: boolean;
  vfsFailure?: boolean;
  finalizeFailure?: boolean;
  finalizeResponseLoss?: boolean;
  targetFailure?: boolean;
  createIntentTargetFailure?: boolean;
  createIntentStateFailure?: boolean;
  decisionConflict?: boolean;
}

async function publicationFixture(options: PublicationFixtureOptions = {}) {
  const parsed = await parseSource({
    kind: "markdown",
    content: "# Trusted\n\nFirst paragraph.\n\nSecond paragraph.\n",
  });
  const intent: PublicationIntent = {
    submissionId: "submission-1",
    revisionId: "revision-1",
    knowledgeItemId: "knowledge-1",
    reviewerId: "admin-1",
    title: publishInput.title,
    visibility: publishInput.visibility,
    spaceId: publishInput.spaceId,
    collectionId: publishInput.collectionId,
    tagIds: [...publishInput.tagIds],
    visibilityReasonCode: undefined,
    normalizedPath: "/workspace/published/default/knowledge-1/revision-1.md",
    contentSha256: parsed.contentSha256,
    state: "pending_content",
    sourceVersion: {
      id: "source-version-1",
      kind: "markdown",
      content: parsed.normalizedMarkdown,
      contentSha256: parsed.contentSha256,
      parserVersion: "m1-v1",
    },
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
  const events: string[] = [];
  const commits: unknown[] = [];
  const rejectionInputs: Array<{ reasonCode: "not_relevant" | "duplicate" | "unsafe"; note: string }> = [];
  const revisionInputs: Array<{ reasonCode: "needs_revision"; note: string }> = [];
  let contentResponseLost = false;
  let markResponseLost = false;
  let finalizeFailed = false;
  let finalizeResponseLost = false;
  let finalizeCount = 0;
  let indexCount = 0;
  let finalizedChunks: unknown[] = [];
  const preview: ReviewSubmissionSnapshot = {
    submissionId: "submission-1",
    submitterId: "member-1",
    status: "review_pending",
    requestedSpaceId: "default",
    requestedCollectionId: "collection-1",
    requestedVisibility: "shared",
    kind: "markdown",
    title: "Submitted title",
    rawContent: "# Submitted title\n\nBody\n",
    requestedTarget: {
      space: { id: "default", slug: "default", name: "Default", status: "active" },
      collection: { id: "collection-1", name: "Collection 1", status: "active" },
      available: true,
    },
    sourceVersion: intent.sourceVersion,
  };
  const revision: PublishedRevision = {
    id: "revision-1",
    knowledgeItemId: "knowledge-1",
    sourceVersionId: "source-version-1",
    normalizedPath: intent.normalizedPath,
    contentSha256: intent.contentSha256,
    title: intent.title,
    tagIds: [...intent.tagIds],
    visibility: intent.visibility,
    publishedBy: "admin-1",
    publishedAt: "2026-08-22T00:00:00.000Z",
    searchStatus: "pending",
  };
  const rejectionDecision: ReviewDecision = {
    submissionId: "submission-1", reviewerId: "admin-1", decision: "rejected",
    reasonCode: "unsafe", note: "Free text stays in the review row", title: "Submitted title",
    visibility: "admin_only", createdAt: "2026-08-22T00:00:00.000Z",
  };
  const revisionDecision: ReviewDecision = {
    submissionId: "submission-2", reviewerId: "admin-1", decision: "revision_requested",
    reasonCode: "needs_revision", note: "Clarify the source location", title: "Submitted title",
    visibility: "admin_only", createdAt: "2026-08-22T00:00:00.000Z",
  };

  const repository: PublicationRepositoryPort = {
    async getPreview(submissionId) { return submissionId === "submission-1" ? preview : null; },
    async validateTarget() {
      events.push("validate-target");
      if (options.targetFailure) throw Object.assign(new Error("invalid target"), { kind: "target_invalid" });
    },
    async createOrReadIntent() {
      events.push("create-intent");
      if (options.createIntentTargetFailure) throw Object.assign(new Error("invalidated target"), { kind: "target_invalid" });
      if (options.createIntentStateFailure) throw Object.assign(new Error("submission terminalized"), { kind: "submission_not_pending" });
      return intent;
    },
    async markContentWritten(_submissionId, receipt) {
      events.push("mark-content-written");
      expect(receipt).toMatchObject({ path: intent.normalizedPath, contentSha256: intent.contentSha256 });
      intent.state = "content_written";
      if (options.markResponseLoss && !markResponseLost) { markResponseLost = true; throw new Error("mark response lost"); }
    },
    async markIntentFailedTerminal() {
      events.push("terminalize-intent");
      intent.state = "failed_terminal";
    },
    async finalize(_stableIntent, chunks) {
      finalizedChunks = chunks;
      events.push(`finalize:${chunks.length}`);
      if (options.finalizeFailure && !finalizeFailed) { finalizeFailed = true; throw new Error("D1 unavailable"); }
      if (intent.state !== "content_written" && intent.state !== "completed") throw new Error("bad state");
      if (intent.state !== "completed") finalizeCount += 1;
      intent.state = "completed";
      if (options.finalizeResponseLoss && !finalizeResponseLost) { finalizeResponseLost = true; throw new Error("finalize response lost"); }
      return { ...revision, visibility: intent.visibility };
    },
    async rollback() { return { ...revision, previousRevisionId: revision.id }; },
    async trash() { return { id: "knowledge-1", spaceId: "default", collectionId: "collection-1", revisionId: revision.id, title: revision.title, visibility: revision.visibility, publishedAt: revision.publishedAt, status: "trashed" as const, searchStatus: "indexed" as const, updatedAt: revision.publishedAt }; },
    async restore() { return { id: "knowledge-1", spaceId: "default", collectionId: "collection-1", revisionId: revision.id, title: revision.title, visibility: revision.visibility, publishedAt: revision.publishedAt, status: "active" as const, searchStatus: "indexed" as const, updatedAt: revision.publishedAt }; },
    async listTrashed() { return { items: [] }; },
    async preparePurge() { return { alreadyPurged: true as const }; },
    async finalizePurge() { return { knowledgeItemId: "knowledge-1", status: "purged" as const, purgedRevisionCount: 1 }; },
    async processIndexJob() { events.push("process-index"); indexCount += 1; revision.searchStatus = "indexed"; return "indexed"; },
    async rebuildChunkReport() { return null; },
    async reject(_submissionId, _reviewerId, input) {
      if (options.decisionConflict) throw Object.assign(new Error("decision conflict"), { kind: "decision_conflict" });
      rejectionInputs.push(input);
      return rejectionDecision;
    },
    async requestRevision(_submissionId, _reviewerId, input) {
      if (options.decisionConflict) throw Object.assign(new Error("decision conflict"), { kind: "decision_conflict" });
      revisionInputs.push(input);
      return revisionDecision;
    },
    async listPendingIntents(limit) {
      return limit > 0 && intent.state !== "completed" && intent.state !== "failed_terminal" ? [intent] : [];
    },
    async listRecoverableIndexRevisionIds(limit) {
      return limit > 0 && intent.state === "completed" && indexCount === 0 ? [intent.revisionId] : [];
    },
  };
  const content = {
    async commit(input: unknown) {
      events.push("commit-content");
      commits.push(input);
      if (options.vfsFailure) throw new Error("VFS unavailable");
      if (options.contentResponseLoss && !contentResponseLost) { contentResponseLost = true; throw new Error("response lost"); }
      return { path: intent.normalizedPath, contentSha256: intent.contentSha256, bytes: new TextEncoder().encode(parsed.normalizedMarkdown).byteLength };
    },
  };
  const service = new PublicationService(repository, content);
  return {
    service, repository, intent, preview, events, commits, rejectionInputs, revisionInputs,
    get finalizedChunks() { return finalizedChunks; },
    get finalizeCount() { return finalizeCount; },
    get indexCount() { return indexCount; },
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function replaceFixtureSource(intent: PublicationIntent, content: string, kind: "markdown" | "code"): Promise<void> {
  const contentSha256 = await sha256(content);
  intent.sourceVersion.kind = kind;
  intent.sourceVersion.content = content;
  intent.sourceVersion.contentSha256 = contentSha256;
  intent.contentSha256 = contentSha256;
}
