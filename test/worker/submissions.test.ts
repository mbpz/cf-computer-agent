/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { AuditRepository } from "../../src/audit/repository";
import type { CreateAuditEvent } from "../../src/audit/types";
import { SubmissionsRepository } from "../../src/submissions/repository";
import { SubmissionsService } from "../../src/submissions/service";
import { SourcesRepository } from "../../src/sources/repository";
import type { CreateSubmissionWithSourceVersion } from "../../src/submissions/repository";
import type { SubmissionStatusFilter } from "../../src/submissions/types";
import { MIGRATIONS } from "../fixtures/d1";

describe("submissions D1 control plane", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedMembers();
  });

  it("persists the complete M1-v2 SourceVersion contract while legacy rows retain null metadata", async () => {
    const submissions = new SubmissionsRepository(env.DB, new AuditRepository(env.DB));
    const sourceVersions = new SourcesRepository(env.DB);
    const fresh = submissionInput("fresh-source-submission");
    const legacy = submissionInput("legacy-source-submission");
    await submissions.createWithAudit(fresh, { ...auditInput("fresh-source-audit"), resourceId: fresh.id });
    await submissions.createWithAudit(legacy, { ...auditInput("legacy-source-audit"), resourceId: legacy.id });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('fresh-source', 'member-a', 'default', NULL, 'code', 'Fresh', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('legacy-source', 'member-a', 'default', NULL, 'text', 'Legacy', ?, ?)").bind(now, now),
      sourceVersions.prepareCreateVersion({
        id: "fresh-version", sourceId: "fresh-source", submissionId: fresh.id, ordinal: 1,
        content: "```javascript\\nconst x = 1;\\n```\\n", contentSha256: "a".repeat(64), parserVersion: "m1-v1",
        parserSchemaVersion: "m1-v2", sourceIdentitySha256: "b".repeat(64),
        codeMetadata: { language: "javascript", fileLabel: "main.js", lineBaseline: 7 }, createdAt: now,
      }),
      sourceVersions.prepareCreateVersion({
        id: "legacy-version", sourceId: "legacy-source", submissionId: legacy.id, ordinal: 1,
        content: "legacy", contentSha256: "c".repeat(64), parserVersion: "m1-v1", createdAt: now,
      }),
    ]);
    await expect(env.DB.prepare(
      "SELECT id, parser_schema_version, source_identity_sha256, code_language, file_label, line_baseline FROM source_versions ORDER BY id",
    ).all()).resolves.toMatchObject({ results: [
      { id: "fresh-version", parser_schema_version: "m1-v2", source_identity_sha256: "b".repeat(64), code_language: "javascript", file_label: "main.js", line_baseline: 7 },
      { id: "legacy-version", parser_schema_version: "m1-v1", source_identity_sha256: null, code_language: null, file_label: null, line_baseline: 1 },
    ] });
  });

  it("rejects incomplete M1-v2 source identity at the repository boundary", () => {
    const repository = new SourcesRepository(env.DB);
    const base = {
      id: "invalid-m1-version", sourceId: "missing-source", submissionId: "missing-submission", ordinal: 1,
      content: "body", contentSha256: "a".repeat(64), parserVersion: "m1-v1" as const,
      parserSchemaVersion: "m1-v2" as const, codeMetadata: null, createdAt: now,
    };
    for (const sourceIdentitySha256 of [null, "", "f".repeat(63), "G".repeat(64)]) {
      expect(() => repository.prepareCreateVersion({ ...base, sourceIdentitySha256 }))
        .toThrow(/source identity/u);
    }
  });

  it("keeps contributor pages ownership-scoped across cursor-shaped inputs while admin pending pages see both users", async () => {
    const service = createService();
    await service.create("member-a", { requestedSpaceId: "default", kind: "text", title: "A one", content: "a" });
    await service.create("member-b", { requestedSpaceId: "default", kind: "markdown", title: "B one", content: "b" });
    await service.create("member-a", { requestedSpaceId: "default", kind: "code", title: "A two", content: "c" });

    const first = await service.listOwn("member-a", { limit: 1 });
    const second = await service.listOwn("member-a", { limit: 1, cursor: first.nextCursor });
    expect([...first.items, ...second.items].map((item) => item.submitterId)).toEqual(["member-a", "member-a"]);
    const copiedAdminCursor = (await service.listPending({ limit: 2 })).nextCursor;
    await expect(service.listOwn("member-a", { limit: 10, cursor: copiedAdminCursor }))
      .rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    await expect(service.listOwn("member-a", { limit: 1, cursor: "member-b" })).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    await expect(service.listPending({ limit: 10 })).resolves.toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ submitterId: "member-a", status: "review_pending" }),
      expect.objectContaining({ submitterId: "member-b", status: "review_pending" }),
    ]) });
  });

  it("pages an owner's exact status with a scope-bound opaque cursor and the selective index", async () => {
    const statuses: SubmissionStatusFilter[] = [
      "review_pending", "published", "rejected", "revision_requested",
    ];
    const statements = [];
    for (const owner of ["member-a", "member-b"] as const) {
      for (let index = 0; index < 60; index += 1) {
        const status = statuses[index % statuses.length]!;
        const createdAt = `2026-08-13T00:00:${String(Math.floor(index / 3)).padStart(2, "0")}.000Z`;
        statements.push(env.DB.prepare(
          `INSERT INTO submissions (
             id, submitter_id, requested_space_id, requested_collection_id, requested_visibility,
             kind, status, title, content, created_at, updated_at
           ) VALUES (?, ?, 'default', NULL, 'shared', 'text', ?, ?, 'Body', ?, ?)`,
        ).bind(`page-${owner}-${String(index).padStart(2, "0")}`, owner, status, `Title ${index}`, createdAt, createdAt));
      }
    }
    await env.DB.batch(statements);
    const service = createService();

    const expected = Array.from({ length: 15 }, (_, ordinal) => 56 - ordinal * 4)
      .map((index) => `page-member-a-${String(index).padStart(2, "0")}`)
      .sort((left, right) => right.localeCompare(left));
    const actual: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await service.listOwn("member-a", { limit: 4, cursor, status: "review_pending" });
      expect(result.items.every((submission) => submission.submitterId === "member-a"
        && submission.status === "review_pending")).toBe(true);
      actual.push(...result.items.map((submission) => submission.id));
      cursor = result.nextCursor;
    } while (cursor);
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);

    const first = await service.listOwn("member-a", { limit: 4, status: "published" });
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    const decoded = JSON.parse(atob(first.nextCursor!.replace(/-/gu, "+").replace(/_/gu, "/"))) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(["id", "key", "sort", "v"]);
    expect(decoded).not.toHaveProperty("memberId");
    expect(decoded).not.toHaveProperty("status");
    await expect(service.listOwn("member-b", {
      limit: 4, status: "published", cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: "PAGE_INVALID", status: 400 });
    await expect(service.listOwn("member-a", {
      limit: 4, status: "rejected", cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: "PAGE_INVALID", status: 400 });
    await expect(service.listOwn("member-a", {
      limit: 4, status: "draft" as SubmissionStatusFilter,
    })).rejects.toMatchObject({ code: "PAGE_INVALID", status: 400 });

    await expect(service.listOwn("member-a", { status: "published" })).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(service.listOwn("member-a", { limit: 50 })).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(service.listOwn("member-a", { limit: 51 })).rejects.toMatchObject({ code: "PAGE_INVALID", status: 400 });
    expect((await service.listOwn("member-a", { status: "published" })).items).toHaveLength(15);
    expect((await service.listOwn("member-a")).items).toHaveLength(20);
    expect((await service.listOwn("member-a", { limit: 50 })).items).toHaveLength(50);

    const plan = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT id FROM submissions WHERE submitter_id = ? AND status = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    ).bind("member-a", "review_pending", 5).all<{ detail: string }>();
    expect(plan.results.map((row) => row.detail).join("\n")).toContain("submissions_owner_status_page");
  });

  it("enforces target state in the conditional persistence insert", async () => {
    const service = createService();
    await env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('other-space', 'other', 'Other', '', 'shared', 'active', 1, 0, ?, ?)")
      .bind(now, now).run();
    await env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('other-collection', 'other-space', NULL, 'Other', '', 'active', 0, ?, ?)")
      .bind(now, now).run();
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'default'").run();

    await expect(service.create("member-a", { requestedSpaceId: "default", kind: "text", title: "Blocked", content: "Body" }))
      .rejects.toMatchObject({ code: "SUBMISSION_TARGET_INVALID", status: 400 });
    await expect(env.DB.prepare("SELECT id FROM audit_events").all()).resolves.toMatchObject({ results: [] });
    await env.DB.prepare("UPDATE spaces SET status = 'active' WHERE id = 'default'").run();
    await expect(service.create("member-a", { requestedSpaceId: "default", requestedCollectionId: "other-collection", kind: "text", title: "Blocked", content: "Body" }))
      .rejects.toMatchObject({ code: "SUBMISSION_TARGET_INVALID", status: 400 });
  });

  it("rolls back submission and linked audit rows when a real dependent audit statement fails", async () => {
    const audit = new AuditRepository(env.DB);
    await audit.writeAudit(auditInput("duplicate-audit"));
    const repository = new SubmissionsRepository(env.DB, audit);
    const submission = submissionInput("failed-submission");
    const duplicateAudit = { ...auditInput("duplicate-audit"), resourceId: submission.id };

    await expect(repository.createWithAudit(submission, duplicateAudit)).rejects.toThrow();
    await expect(env.DB.prepare("SELECT id FROM submissions WHERE id = 'failed-submission'").first()).resolves.toBeNull();
    await expect(env.DB.prepare("SELECT id FROM audit_events WHERE resource_id = 'failed-submission'").first()).resolves.toBeNull();
    await expect(env.DB.prepare("SELECT id, resource_id FROM audit_events WHERE id = 'duplicate-audit'").first()).resolves.toEqual({ id: "duplicate-audit", resource_id: "submission-1" });
  });

  it("accepts an active same-space Collection and pages audit events by created_at and id", async () => {
    await env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('default-collection', 'default', NULL, 'Default collection', '', 'active', 0, ?, ?)")
      .bind(now, now).run();
    const service = createService();
    await expect(service.create("member-a", { requestedSpaceId: "default", requestedCollectionId: "default-collection", kind: "code", title: "Accepted", content: "const answer = 42;" }))
      .resolves.toMatchObject({ requestedCollectionId: "default-collection", status: "review_pending" });
    const audit = new AuditRepository(env.DB);
    await audit.writeAudit({ ...auditInput("later-audit"), createdAt: "2026-08-13T00:00:01.000Z" });

    const first = await audit.listAudit({ limit: 1 });
    const second = await audit.listAudit({ limit: 1, cursor: first.nextCursor });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((event) => event.id))).toEqual(new Set(["id-1", "later-audit"]));
  });

  it("filters audit keyset pages by action without gaps or mixed actions", async () => {
    const audit = new AuditRepository(env.DB);
    for (let index = 0; index < 12; index += 1) {
      await audit.writeAudit(index % 2 === 0 ? {
        id: `login-${String(index).padStart(2, "0")}`, actorKind: "member", actorId: `member-${index}`,
        action: "member.login", resourceType: "member", resourceId: `member-${index}`,
        metadata: { role: "contributor" }, createdAt: `2026-08-13T00:00:${String(index).padStart(2, "0")}.000Z`,
      } : {
        ...auditInput(`submission-${String(index).padStart(2, "0")}`),
        createdAt: `2026-08-13T00:00:${String(index).padStart(2, "0")}.000Z`,
      });
    }

    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await audit.listAudit({ limit: 2, cursor }, "member.login");
      expect(page.items.every((event) => event.action === "member.login")).toBe(true);
      ids.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(["login-10", "login-08", "login-06", "login-04", "login-02", "login-00"]);
  });

  it("rejects an actor-mismatched audit before the D1 batch can persist a submission", async () => {
    const repository = new SubmissionsRepository(env.DB, new AuditRepository(env.DB));
    const submission = submissionInput("actor-mismatch");
    const audit = { ...auditInput("actor-mismatch-audit"), actorId: "member-b", resourceId: submission.id };

    await expect(repository.createWithAudit(submission, audit)).rejects.toThrow(/audit/i);
    await expect(env.DB.prepare("SELECT id FROM submissions WHERE id = 'actor-mismatch'").first()).resolves.toBeNull();
  });

  it("rejects a resource-mismatched audit before the D1 batch can persist a submission", async () => {
    const repository = new SubmissionsRepository(env.DB, new AuditRepository(env.DB));
    const submission = submissionInput("resource-mismatch");
    const audit = { ...auditInput("resource-mismatch-audit"), resourceId: "other-submission" };

    await expect(repository.createWithAudit(submission, audit)).rejects.toThrow(/audit/i);
    await expect(env.DB.prepare("SELECT id FROM submissions WHERE id = 'resource-mismatch'").first()).resolves.toBeNull();
  });

  it("returns an exact replay and rejects changed content or target for the same member key", async () => {
    const service = createService();
    const input = {
      requestedSpaceId: "default", kind: "text" as const, title: "Replay", content: "A\r\nB", idempotencyKey: "replay-key-00001",
    };

    const created = await service.createWithSourceVersion("member-a", input);
    const replayed = await service.createWithSourceVersion("member-a", input);
    expect(replayed).toEqual(created);
    expect(created.submission).not.toHaveProperty("idempotencyKey");

    await expect(service.createWithSourceVersion("member-a", { ...input, content: "Changed" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(service.createWithSourceVersion("member-a", { ...input, requestedSpaceId: "other-space" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    await expect(counts()).resolves.toEqual({ submissions: 1, sources: 1, sourceVersions: 1, audits: 1 });
  });

  it("maps a concurrent same-member/key loser with different content to a stable 409", async () => {
    const common = {
      requestedSpaceId: "default", kind: "text" as const, title: "Concurrent", idempotencyKey: "concurrent-key-01",
    };
    const results = await Promise.allSettled([
      createService("first").createWithSourceVersion("member-a", { ...common, content: "First body" }),
      createService("second").createWithSourceVersion("member-a", { ...common, content: "Second body" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(counts()).resolves.toEqual({ submissions: 1, sources: 1, sourceVersions: 1, audits: 1 });
  });

  it("returns a duplicate candidate for a different key and creates no second source version", async () => {
    const service = createService();
    const first = await service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "markdown", title: "First", content: "# Same  \r\n", idempotencyKey: "duplicate-key-001",
    });
    const duplicate = await service.createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "markdown", title: "Second", content: "# Same\n", idempotencyKey: "duplicate-key-002",
    });

    expect(duplicate).toEqual({
      submission: null,
      source: null,
      sourceVersion: null,
      duplicateCandidate: {
        submissionId: first.submission!.id,
        sourceId: first.source!.id,
        sourceVersionId: first.sourceVersion!.id,
      },
    });
    await expect(counts()).resolves.toEqual({ submissions: 1, sources: 1, sourceVersions: 1, audits: 1 });
    await expect(env.DB.prepare("SELECT status FROM submissions").first()).resolves.toEqual({ status: "review_pending" });
  });

  it("does not expose or block on a different member's same-hash source", async () => {
    const first = await createService("member-a-first").createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "markdown", title: "Member A", content: "# Shared hash\n", idempotencyKey: "member-a-hash-001",
    });
    const second = await createService("member-b-second").createWithSourceVersion("member-b", {
      requestedSpaceId: "default", kind: "markdown", title: "Member B", content: "# Shared hash\n", idempotencyKey: "member-b-hash-001",
    });

    expect(second.duplicateCandidate).toBeNull();
    expect(second.submission?.submitterId).toBe("member-b");
    expect(second.sourceVersion?.id).not.toBe(first.sourceVersion?.id);
    await expect(counts()).resolves.toEqual({ submissions: 2, sources: 2, sourceVersions: 2, audits: 2 });
  });

  it("does not expose or block on the same member's same-hash source in another Space", async () => {
    await env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('other-space', 'other', 'Other', '', 'shared', 'active', 1, 0, ?, ?)")
      .bind(now, now).run();
    const first = await createService("default-first").createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "text", title: "Default", content: "Scoped hash", idempotencyKey: "default-hash-key1",
    });
    const second = await createService("other-second").createWithSourceVersion("member-a", {
      requestedSpaceId: "other-space", kind: "text", title: "Other", content: "Scoped hash", idempotencyKey: "other-hash-key-01",
    });

    expect(second.duplicateCandidate).toBeNull();
    expect(second.submission?.requestedSpaceId).toBe("other-space");
    expect(second.sourceVersion?.id).not.toBe(first.sourceVersion?.id);
    await expect(counts()).resolves.toEqual({ submissions: 2, sources: 2, sourceVersions: 2, audits: 2 });
  });

  it("keeps null-key legacy submissions readable and outside replay matching", async () => {
    const legacy = submissionInput("legacy-null-key");
    await new SubmissionsRepository(env.DB, new AuditRepository(env.DB)).createWithAudit(legacy, {
      ...auditInput("legacy-null-key-audit"), resourceId: legacy.id,
    });

    const created = await createService().createWithSourceVersion("member-a", {
      requestedSpaceId: "default", kind: "text", title: "Legacy body", content: "Body", idempotencyKey: "legacy-key-00001",
    });
    expect(created.submission?.id).not.toBe(legacy.id);
    await expect(createService().listOwn("member-a", { limit: 10 })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: legacy.id })]),
    });
  });

  it.each(["source", "source_version", "audit"] as const)(
    "rolls back all new rows when the dependent %s insert fails",
    async (failure) => {
      const repository = new SubmissionsRepository(env.DB, new AuditRepository(env.DB));
      const input = await sourceCreationInput(failure);

      await expect(repository.createWithSourceVersion(input)).rejects.toThrow();
      await expect(env.DB.prepare("SELECT id FROM submissions WHERE id = 'rollback-submission'").first()).resolves.toBeNull();
      if (failure === "source") {
        await expect(env.DB.prepare("SELECT id, title FROM sources WHERE id = 'rollback-source'").first())
          .resolves.toEqual({ id: "rollback-source", title: "Existing" });
      } else {
        await expect(env.DB.prepare("SELECT id FROM sources WHERE id = 'rollback-source'").first()).resolves.toBeNull();
      }
      await expect(env.DB.prepare("SELECT id FROM source_versions WHERE submission_id = 'rollback-submission'").first()).resolves.toBeNull();
      await expect(env.DB.prepare("SELECT id FROM audit_events WHERE resource_id = 'rollback-submission'").first()).resolves.toBeNull();
    },
  );

  it("rolls back a resubmission, Source, SourceVersion, and conditional audit on an audit-ID collision", async () => {
    const prior = await createService("prior").createWithSourceVersion("member-a", {
      requestedSpaceId: "default", requestedVisibility: "admin_only", kind: "text",
      title: "Prior", content: "Prior body", idempotencyKey: "prior-resubmit-key",
    });
    const priorId = prior.submission!.id;
    await env.DB.prepare("UPDATE submissions SET status = 'revision_requested' WHERE id = ?").bind(priorId).run();
    await new AuditRepository(env.DB).writeAudit({ ...auditInput("resubmit-3"), resourceId: priorId });

    await expect(createService("resubmit").resubmit("member-a", priorId, {
      kind: "text", title: "Revised", content: "Revised body",
    }, "new-resubmit-key1")).rejects.toThrow();

    await expect(env.DB.prepare(
      "SELECT count(*) AS count FROM submissions WHERE supersedes_submission_id = ?",
    ).bind(priorId).first()).resolves.toEqual({ count: 0 });
    await expect(env.DB.prepare(
      "SELECT count(*) AS count FROM sources WHERE id = 'resubmit-1'",
    ).first()).resolves.toEqual({ count: 0 });
    await expect(env.DB.prepare(
      "SELECT count(*) AS count FROM source_versions WHERE id = 'resubmit-2'",
    ).first()).resolves.toEqual({ count: 0 });
    await expect(env.DB.prepare("SELECT status FROM submissions WHERE id = ?").bind(priorId).first())
      .resolves.toEqual({ status: "revision_requested" });
  });

  it("rejects admin-only visibility widening at the authoritative resubmission insert boundary", async () => {
    const prior = await createService("private-prior").createWithSourceVersion("member-a", {
      requestedSpaceId: "default", requestedVisibility: "admin_only", kind: "text",
      title: "Prior", content: "Prior body", idempotencyKey: "private-prior-key1",
    });
    const priorId = prior.submission!.id;
    await env.DB.prepare("UPDATE submissions SET status = 'revision_requested' WHERE id = ?").bind(priorId).run();
    const repository = new SubmissionsRepository(env.DB, new AuditRepository(env.DB));
    const submission = {
      ...submissionInput("widened-resubmission"), idempotencyKey: "widened-resubmit-key",
      requestedVisibility: "shared" as const, supersedesSubmissionId: priorId,
      title: "Widened", content: "Widened body",
    };

    await expect(repository.createResubmissionWithSourceVersion({
      submission,
      source: {
        id: "widened-source", ownerId: "member-a", spaceId: "default", collectionId: null,
        kind: "text", title: "Widened", createdAt: now, updatedAt: now,
      },
      sourceVersion: {
        id: "widened-version", sourceId: "widened-source", submissionId: submission.id, ordinal: 1,
        content: "Widened body", contentSha256: "e".repeat(64), parserVersion: "m1-v1",
        parserSchemaVersion: "m1-v2", sourceIdentitySha256: "f".repeat(64),
        codeMetadata: null, createdAt: now,
      },
      audit: {
        id: "widened-audit", actorKind: "member", actorId: "member-a",
        action: "submission.resubmitted", resourceType: "submission", resourceId: submission.id,
        metadata: {
          supersedesSubmissionId: priorId, requestedSpaceId: "default", requestedVisibility: "shared",
        },
        createdAt: now,
      },
    })).rejects.toThrow();

    await expect(env.DB.prepare(
      `SELECT
         (SELECT count(*) FROM submissions WHERE id = 'widened-resubmission') AS submissions,
         (SELECT count(*) FROM sources WHERE id = 'widened-source') AS sources,
         (SELECT count(*) FROM source_versions WHERE id = 'widened-version') AS versions,
         (SELECT count(*) FROM audit_events WHERE id = 'widened-audit') AS audits`,
    ).first()).resolves.toEqual({ submissions: 0, sources: 0, versions: 0, audits: 0 });
  });

});

const now = "2026-08-13T00:00:00.000Z";

function createService(prefix = "id"): SubmissionsService {
  let next = 0;
  return new SubmissionsService(new SubmissionsRepository(env.DB, new AuditRepository(env.DB)), {
    id: () => `${prefix}-${next++}`,
    now: () => new Date(now),
  });
}

async function seedMembers(): Promise<void> {
  for (const id of ["member-a", "member-b"]) {
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?)")
      .bind(id, `sub-${id}`, `${id}@example.test`, now, now).run();
  }
}

function submissionInput(id: string) {
  return { id, submitterId: "member-a", requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" as const, kind: "text" as const, status: "review_pending" as const, title: "Title", content: "Body", createdAt: now, updatedAt: now };
}

function auditInput(id: string): CreateAuditEvent {
  return { id, actorKind: "member" as const, actorId: "member-a", action: "submission.created" as const, resourceType: "submission", resourceId: "submission-1", metadata: { kind: "text" as const, requestedSpaceId: "default" }, createdAt: now };
}

async function counts(): Promise<{ submissions: number; sources: number; sourceVersions: number; audits: number }> {
  const [submissions, sources, sourceVersions, audits] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM submissions").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM sources").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM source_versions").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM audit_events").first<{ count: number }>(),
  ]);
  return {
    submissions: submissions!.count,
    sources: sources!.count,
    sourceVersions: sourceVersions!.count,
    audits: audits!.count,
  };
}

async function sourceCreationInput(failure: "source" | "source_version" | "audit"): Promise<CreateSubmissionWithSourceVersion> {
  const existingSubmissionId = "existing-dependency-submission";
  const existingSourceId = failure === "source" ? "rollback-source" : "existing-dependency-source";
  const existingVersionId = failure === "source_version" ? "rollback-source-version" : "existing-dependency-version";
  const existingAuditId = failure === "audit" ? "rollback-audit" : "existing-dependency-audit";
  const legacy = submissionInput(existingSubmissionId);
  await new SubmissionsRepository(env.DB, new AuditRepository(env.DB)).createWithAudit(legacy, {
    ...auditInput(existingAuditId), resourceId: legacy.id,
  });
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-a', 'default', NULL, 'text', 'Existing', ?, ?)")
    .bind(existingSourceId, now, now).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, 'Existing unique body', ?, 'm1-v1', ?)")
    .bind(existingVersionId, existingSourceId, existingSubmissionId, `existing-hash-${failure}`, now).run();

  const submission = {
    ...submissionInput("rollback-submission"), idempotencyKey: `rollback-${failure}-key`, content: "Rollback unique body",
  };
  return {
    submission,
    source: {
      id: "rollback-source", ownerId: "member-a", spaceId: "default", collectionId: null,
      kind: "text", title: "Rollback", createdAt: now, updatedAt: now,
    },
    sourceVersion: {
      id: "rollback-source-version", sourceId: "rollback-source", submissionId: submission.id, ordinal: 1,
      content: "Rollback unique body", contentSha256: `rollback-hash-${failure}`, parserVersion: "m1-v1",
      parserSchemaVersion: "m1-v2", sourceIdentitySha256: "d".repeat(64), codeMetadata: null, createdAt: now,
    },
    audit: { ...auditInput("rollback-audit"), resourceId: submission.id },
  };
}
