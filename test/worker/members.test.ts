/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MembersRepository } from "../../src/members/repository";
import { MembersService } from "../../src/members/service";
import { AuditRepository } from "../../src/audit/repository";
import { MIGRATIONS } from "../fixtures/d1";

describe("members D1 control plane", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
  });

  it("keeps exactly one active admin during concurrent bootstrap logins", async () => {
    const service = () => new MembersService(new MembersRepository(env.DB, new AuditRepository(env.DB)), {
      BOOTSTRAP_ADMIN_EMAIL: "  BOOTSTRAP@EXAMPLE.TEST ",
      ALLOWED_MEMBER_EMAILS: "bootstrap@example.test",
    }, { waitUntil: () => undefined });

    const members = await Promise.all([
      service().resolveGitHubLogin({ subject: "github:101", githubUserId: "101", email: "bootstrap@example.test" }),
      service().resolveGitHubLogin({ subject: "github:102", githubUserId: "102", email: "bootstrap@example.test" }),
    ]);

    expect(members.map((member) => member.role).sort()).toEqual(["admin", "contributor"]);
    const activeAdmins = await env.DB.prepare(
      "SELECT id FROM members WHERE role = 'admin' AND status = 'active'",
    ).all<{ id: string }>();
    expect(activeAdmins.results).toHaveLength(1);
    const loginAudits = await env.DB.prepare(
      "SELECT actor_id, action, resource_type, resource_id, metadata FROM audit_events WHERE action = 'member.login' ORDER BY resource_id",
    ).all<{ actor_id: string; action: string; resource_type: string; resource_id: string; metadata: string }>();
    expect(loginAudits.results).toHaveLength(2);
    expect(loginAudits.results.every((event) => event.actor_id === event.resource_id && event.resource_type === "member")).toBe(true);
    expect(loginAudits.results.map((event) => JSON.parse(event.metadata))).toEqual(expect.arrayContaining([
      { role: "admin" },
      { role: "contributor" },
    ]));
  });

  it("audits only first account creation and not repeat login or last_seen work", async () => {
    const service = new MembersService(new MembersRepository(env.DB, new AuditRepository(env.DB)), {
      BOOTSTRAP_ADMIN_EMAIL: "repeat@example.test",
      ALLOWED_MEMBER_EMAILS: "repeat@example.test",
    }, { waitUntil: () => undefined });
    const identity = { subject: "github:103" as const, githubUserId: "103", email: "repeat@example.test" };

    const first = await service.resolveGitHubLogin(identity);
    await service.resolveGitHubLogin(identity);
    const audits = await env.DB.prepare("SELECT actor_id, resource_id, metadata FROM audit_events WHERE action = 'member.login'").all<{
      actor_id: string; resource_id: string; metadata: string;
    }>();
    expect(audits.results).toEqual([{ actor_id: first.id, resource_id: first.id, metadata: '{"role":"admin"}' }]);
  });

  it("atomically links one canonical-email legacy member and writes one redacted identity audit", async () => {
    const repository = new MembersRepository(env.DB, new AuditRepository(env.DB));
    const legacy = await repository.insert({
      id: "legacy-member",
      identitySubject: "legacy-access-subject",
      email: "  LEGACY@EXAMPLE.TEST ",
      role: "admin",
      status: "active",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
    const service = new MembersService(repository, {
      BOOTSTRAP_ADMIN_EMAIL: "legacy@example.test",
      ALLOWED_MEMBER_EMAILS: "legacy@example.test",
    }, {
      auditId: () => "identity-link-audit",
      now: () => new Date("2026-08-19T12:00:00.000Z"),
      waitUntil: () => undefined,
    });
    const identity = { subject: "github:104" as const, githubUserId: "104", email: "legacy@example.test" };

    const [linked, concurrent] = await Promise.all([
      service.resolveGitHubLogin(identity),
      service.resolveGitHubLogin(identity),
    ]);

    expect(linked).toMatchObject({
      id: legacy.id,
      identitySubject: identity.subject,
      email: legacy.email,
      role: legacy.role,
      status: legacy.status,
      createdAt: legacy.createdAt,
      updatedAt: "2026-08-19T12:00:00.000Z",
    });
    expect(concurrent).toMatchObject({ id: legacy.id, identitySubject: identity.subject });
    const members = await env.DB.prepare(
      "SELECT id, access_sub, email, role, status, created_at, updated_at FROM members WHERE id = ?",
    ).bind(legacy.id).all();
    expect(members.results).toEqual([{
      id: legacy.id,
      access_sub: identity.subject,
      email: legacy.email,
      role: legacy.role,
      status: legacy.status,
      created_at: legacy.createdAt,
      updated_at: "2026-08-19T12:00:00.000Z",
    }]);
    const audits = await env.DB.prepare(
      "SELECT actor_id, action, resource_type, resource_id, metadata FROM audit_events WHERE action = 'member.identity_linked'",
    ).all();
    expect(audits.results).toEqual([{
      actor_id: legacy.id,
      action: "member.identity_linked",
      resource_type: "member",
      resource_id: legacy.id,
      metadata: '{"provider":"github"}',
    }]);
    expect(JSON.stringify(audits.results)).not.toMatch(/legacy@example|github:104|"104"/i);
  });

  it("rolls back a legacy subject link when its paired identity audit fails", async () => {
    const audit = new AuditRepository(env.DB);
    const repository = new MembersRepository(env.DB, audit);
    const legacy = await repository.insert({
      id: "rollback-legacy",
      identitySubject: "rollback-access-subject",
      email: "rollback@example.test",
      role: "contributor",
      status: "active",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
    await audit.writeAudit({
      id: "duplicate-link-audit",
      actorKind: "member",
      actorId: legacy.id,
      action: "member.identity_linked",
      resourceType: "member",
      resourceId: legacy.id,
      metadata: { provider: "github" },
      createdAt: "2026-08-12T00:00:00.000Z",
    });
    const service = new MembersService(repository, {
      BOOTSTRAP_ADMIN_EMAIL: "rollback@example.test",
      ALLOWED_MEMBER_EMAILS: "rollback@example.test",
    }, {
      auditId: () => "duplicate-link-audit",
      now: () => new Date("2026-08-19T12:00:00.000Z"),
      waitUntil: () => undefined,
    });

    await expect(service.resolveGitHubLogin({
      subject: "github:105",
      githubUserId: "105",
      email: "rollback@example.test",
    })).rejects.toThrow();
    await expect(repository.findById(legacy.id)).resolves.toMatchObject({
      identitySubject: "rollback-access-subject",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
  });

  it("classifies the exact D1 subject conflict and leaves the member and audit unchanged", async () => {
    const repository = new MembersRepository(env.DB, new AuditRepository(env.DB));
    const legacy = await repository.insert({
      id: "conflicting-legacy",
      identitySubject: "conflicting-access-subject",
      email: "conflict@example.test",
      role: "contributor",
      status: "active",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
    await repository.insert({
      id: "subject-owner",
      identitySubject: "github:106",
      email: "owner@example.test",
      role: "contributor",
      status: "active",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });

    await expect(repository.linkIdentityWithAudit(
      legacy.id,
      legacy.identitySubject,
      "github:106",
      "2026-08-19T12:00:00.000Z",
      {
        id: "conflicting-link-audit",
        actorKind: "member",
        actorId: legacy.id,
        action: "member.identity_linked",
        resourceType: "member",
        resourceId: legacy.id,
        metadata: { provider: "github" },
        createdAt: "2026-08-19T12:00:00.000Z",
      },
    )).rejects.toMatchObject({ kind: "identity_subject" });
    await expect(repository.findById(legacy.id)).resolves.toMatchObject({
      identitySubject: "conflicting-access-subject",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
    await expect(env.DB.prepare(
      "SELECT id FROM audit_events WHERE id = 'conflicting-link-audit'",
    ).first()).resolves.toBeNull();
  });

  it("rolls back first member creation when its paired login audit fails", async () => {
    const audit = new AuditRepository(env.DB);
    await audit.writeAudit({
      id: "duplicate-audit", actorKind: "member", actorId: "existing", action: "member.login",
      resourceType: "member", resourceId: "existing", metadata: { role: "contributor" }, createdAt: "2026-08-13T00:00:00.000Z",
    });
    const service = new MembersService(new MembersRepository(env.DB, audit), {}, {
      id: () => "new-member", auditId: () => "duplicate-audit",
      now: () => new Date("2026-08-13T00:00:00.000Z"), waitUntil: () => undefined,
    });

    await expect(service.resolveFirstLogin({ identitySubject: "failed-subject", email: "failed@example.test" })).rejects.toThrow();
    await expect(env.DB.prepare("SELECT id FROM members WHERE id = 'new-member'").first()).resolves.toBeNull();
  });

  it("rolls back a contributor status mutation when its paired audit fails", async () => {
    const audit = new AuditRepository(env.DB);
    const repository = new MembersRepository(env.DB, audit);
    const admin = await repository.insert(memberInput("admin", "admin"));
    const contributor = await repository.insert(memberInput("contributor", "contributor"));
    await audit.writeAudit({
      id: "duplicate-status-audit", actorKind: "member", actorId: admin.id, action: "member.status_updated",
      resourceType: "member", resourceId: contributor.id,
      metadata: { previousStatus: "active", newStatus: "disabled" }, createdAt: "2026-08-13T00:00:00.000Z",
    });
    const service = new MembersService(repository, {}, {
      auditId: () => "duplicate-status-audit", now: () => new Date("2026-08-13T00:00:00.000Z"), waitUntil: () => undefined,
    });

    await expect(service.setContributorStatus(admin, contributor.id, "disabled")).rejects.toThrow();
    await expect(repository.findById(contributor.id)).resolves.toMatchObject({ status: "active" });
  });

  it("rejects an Access-approved subject after its member record is disabled", async () => {
    const service = new MembersService(new MembersRepository(env.DB), {}, { waitUntil: () => undefined });
    const created = await service.resolveFirstLogin({ identitySubject: "disabled-subject", email: "disabled@example.test" });
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(created.id).run();

    await expect(service.resolveFirstLogin({ identitySubject: "disabled-subject", email: "disabled@example.test" }))
      .rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
  });

  it("uses opaque versioned cursors and bounded member pages", async () => {
    const repository = new MembersRepository(env.DB);
    for (const id of ["member-a", "member-b", "member-c"]) {
      await repository.insert({
        id,
        identitySubject: `sub-${id}`,
        email: `${id}@example.test`,
        role: "contributor",
        status: "active",
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z",
      });
    }

    const first = await repository.listPage(2);
    expect(first.items.map((member) => member.id)).toEqual(["member-a", "member-b"]);
    expect(first.nextCursor).not.toContain("member-b");
    const second = await repository.listPage(2, first.nextCursor);
    expect(second.items).toMatchObject([{ id: "member-c" }]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("keeps status-filtered keyset pages bounded and gap-free in D1", async () => {
    const repository = new MembersRepository(env.DB);
    for (let index = 0; index < 55; index += 1) {
      const id = `member-${String(index).padStart(2, "0")}`;
      const member = await repository.insert({
        id,
        identitySubject: `sub-${id}`,
        email: `${id}@example.test`,
        role: "contributor",
        status: "active",
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z",
      });
      if (index % 2 === 1) await repository.updateContributorStatus(member.id, "disabled");
    }

    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repository.listPage(7, cursor, "disabled");
      expect(page.items.length).toBeLessThanOrEqual(7);
      expect(page.items.every((member) => member.status === "disabled")).toBe(true);
      ids.push(...page.items.map((member) => member.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(ids).toEqual(Array.from({ length: 27 }, (_, index) => `member-${String(index * 2 + 1).padStart(2, "0")}`));
    expect(new Set(ids)).toHaveLength(27);
  });

  it.each([NaN, 1.5, 0, 51])("rejects invalid member page limits: %s", async (limit) => {
    const repository = new MembersRepository(env.DB);

    await expect(repository.listPage(limit)).rejects.toMatchObject({ code: "PAGE_INVALID", status: 400 });
  });

  it("rejects an invalid member status filter at the repository boundary", async () => {
    const repository = new MembersRepository(env.DB);

    await expect(repository.listPage(20, undefined, "pending" as never))
      .rejects.toMatchObject({ code: "FILTER_INVALID", status: 400 });
  });

  it("uses a default page limit and rejects malformed oversized or wrong-version cursors", async () => {
    const repository = new MembersRepository(env.DB);
    const oversized = "a".repeat(1025);
    const wrongVersion = toBase64Url(JSON.stringify({ v: 2, id: "member-a" }));

    await expect(repository.listPage()).resolves.toMatchObject({ items: [] });
    for (const cursor of ["", "member-a", oversized, wrongVersion]) {
      await expect(repository.listPage(20, cursor)).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    }
  });
});

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function memberInput(id: string, role: "admin" | "contributor") {
  return {
    id, identitySubject: `sub-${id}`, email: `${id}@example.test`, role, status: "active" as const,
    createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
  };
}
