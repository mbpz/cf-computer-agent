/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { AuditRepository } from "../../src/audit/repository";
import type { CreateAuditEvent } from "../../src/audit/types";
import { SubmissionsRepository } from "../../src/submissions/repository";
import { SubmissionsService } from "../../src/submissions/service";
import { MIGRATIONS } from "../fixtures/d1";

describe("submissions D1 control plane", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedMembers();
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
    await expect(service.listOwn("member-a", { limit: 10, cursor: copiedAdminCursor })).resolves.toMatchObject({
      items: [expect.objectContaining({ submitterId: "member-a" })],
    });
    await expect(service.listOwn("member-a", { limit: 1, cursor: "member-b" })).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    await expect(service.listPending({ limit: 10 })).resolves.toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ submitterId: "member-a", status: "review_pending" }),
      expect.objectContaining({ submitterId: "member-b", status: "review_pending" }),
    ]) });
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

  it("uses a local D1 batch whose failed dependent audit write leaves no submission", async () => {
    const audit = new AuditRepository(env.DB);
    await audit.writeAudit(auditInput("duplicate-audit"));
    const repository = new SubmissionsRepository(env.DB, audit);

    await expect(repository.createWithAudit(submissionInput("failed-submission"), auditInput("duplicate-audit"))).rejects.toThrow();
    await expect(env.DB.prepare("SELECT id FROM submissions WHERE id = 'failed-submission'").first()).resolves.toBeNull();
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

  it("forces review_pending at the persistence boundary", async () => {
    const repository = new SubmissionsRepository(env.DB, new AuditRepository(env.DB));
    const input = { ...submissionInput("forced-status"), status: "rejected" } as never;

    await expect(repository.createWithAudit(input, auditInput("forced-status-audit"))).resolves.toMatchObject({ status: "review_pending" });
    await expect(env.DB.prepare("SELECT status FROM submissions WHERE id = 'forced-status'").first()).resolves.toEqual({ status: "review_pending" });
  });
});

const now = "2026-08-13T00:00:00.000Z";

function createService(): SubmissionsService {
  let next = 0;
  return new SubmissionsService(new SubmissionsRepository(env.DB, new AuditRepository(env.DB)), {
    id: () => `id-${next++}`,
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
  return { id, submitterId: "member-a", requestedSpaceId: "default", requestedCollectionId: null, kind: "text" as const, status: "review_pending" as const, title: "Title", content: "Body", createdAt: now, updatedAt: now };
}

function auditInput(id: string): CreateAuditEvent {
  return { id, actorKind: "member" as const, actorId: "member-a", action: "submission.created" as const, resourceType: "submission", resourceId: "submission-1", metadata: { kind: "text" as const, requestedSpaceId: "default" }, createdAt: now };
}
