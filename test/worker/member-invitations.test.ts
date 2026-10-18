/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { AuditRepository } from "../../src/audit/repository";
import { SessionService } from "../../src/identity/session";
import { MemberInvitationsRepository } from "../../src/member-invitations/repository";
import { MemberInvitationsService } from "../../src/member-invitations/service";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;

interface InvitationDto {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

describe("email authorization grants", () => {
  let admin = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('inviter-admin', 'subject-inviter-admin', 'inviter-admin@example.test', 'admin', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
       ('invitee-contributor', 'subject-invitee-contributor', 'invitee-contributor@example.test', 'contributor', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    admin = (await sessions.create((await members.findById("inviter-admin"))!)).token;
  });

  it("issues an authorization grant and never returns or stores a code", async () => {
    const response = await api("/api/admin/member-invitations", {
      token: admin,
      method: "POST",
      body: JSON.stringify({ email: "  Newcomer@Example.Test  " }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json() as { invitation: InvitationDto } & Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["invitation"]);
    expect(payload.invitation).toEqual({
      id: expect.any(String),
      email: "newcomer@example.test",
      status: "pending",
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(Object.keys(payload.invitation).sort()).toEqual(["createdAt", "email", "expiresAt", "id", "status"]);
    expect(Date.parse(payload.invitation.expiresAt) - Date.parse(payload.invitation.createdAt)).toBe(TWENTY_FOUR_HOURS_MS);

    const row = await env.DB.prepare("SELECT * FROM member_login_invitations WHERE id = ?").bind(payload.invitation.id).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      email: "newcomer@example.test",
      status: "pending",
      redeemed_at: null,
      revoked_at: null,
    });
    // The admin-issued code columns were removed with the emailed-code cutover.
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "created_at", "email", "expires_at", "id", "redeemed_at", "revoked_at", "status",
    ]);

    const audit = await env.DB.prepare(
      "SELECT * FROM audit_events WHERE action = 'member.invitation_issued'",
    ).first<{ actor_kind: string; actor_id: string; resource_type: string; resource_id: string; metadata: string }>();
    expect(audit).toMatchObject({
      actor_kind: "member",
      actor_id: "inviter-admin",
      resource_type: "member_invitation",
      resource_id: payload.invitation.id,
    });
    expect(JSON.parse(audit!.metadata)).toEqual({ email: "newcomer@example.test", expiresAt: payload.invitation.expiresAt });
  });

  it("lists grants without exposing any extra field", async () => {
    await issue(admin, "first@example.test");
    await issue(admin, "second@example.test");
    const response = await api("/api/admin/member-invitations", { token: admin });
    expect(response.status).toBe(200);
    const body = await response.json() as { items: InvitationDto[] };
    expect(body.items.map((item) => item.email).sort()).toEqual(["first@example.test", "second@example.test"]);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(["createdAt", "email", "expiresAt", "id", "status"]);
      expect(item.status).toBe("pending");
    }
    expect(JSON.stringify(body)).not.toContain("code");
    expect(JSON.stringify(body)).not.toContain("codeHash");
  });

  it("rejects a second pending grant for the same canonical email", async () => {
    await issue(admin, "duplicate@example.test");
    const duplicate = await api("/api/admin/member-invitations", {
      token: admin,
      method: "POST",
      body: JSON.stringify({ email: " DUPLICATE@example.test " }),
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: { code: "INVITATION_ALREADY_PENDING" } });
    expect(await count("SELECT COUNT(*) AS total FROM member_login_invitations")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.invitation_issued'")).toBe(1);
  });

  it("refuses an invitation for an email owned by an active administrator", async () => {
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('disabled-admin', 'subject-disabled-admin', 'retired-admin@example.test', 'admin', 'disabled', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z')`,
    ).run();

    const refused = await api("/api/admin/member-invitations", {
      token: admin,
      method: "POST",
      body: JSON.stringify({ email: " Inviter-Admin@Example.Test " }),
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { code: "INVITATION_ADMIN_EMAIL" } });
    expect(await count("SELECT COUNT(*) AS total FROM member_login_invitations")).toBe(0);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.invitation_issued'")).toBe(0);

    // Only an *active* administrator owns the email; a disabled one does not block it.
    await expect(issue(admin, "retired-admin@example.test")).resolves.toMatchObject({ email: "retired-admin@example.test" });
  });

  it("rejects malformed invitation requests", async () => {
    for (const body of ["{}", '{"email":1}', '{"email":"not-an-email"}', '{"email":"a@b.test","extra":1}', "[]", '"text"', "{"]) {
      const response = await api("/api/admin/member-invitations", { token: admin, method: "POST", body });
      expect(response.status, body).toBe(400);
      const payload = await response.json() as { error: { code: string } };
      expect(payload.error.code, body).toBe("INVITATION_REQUEST_INVALID");
    }
    expect(await count("SELECT COUNT(*) AS total FROM member_login_invitations")).toBe(0);
  });

  it("denies invitation management without the member:manage capability", async () => {
    const contributor = await contributorToken();
    const listed = await api("/api/admin/member-invitations", { token: contributor });
    expect(listed.status).toBe(403);
    const issued = await api("/api/admin/member-invitations", {
      token: contributor,
      method: "POST",
      body: JSON.stringify({ email: "outsider@example.test" }),
    });
    expect(issued.status).toBe(403);
    const revoked = await api("/api/admin/member-invitations/any-id/revoke", { token: contributor, method: "POST" });
    expect(revoked.status).toBe(403);
    const anonymous = await api("/api/admin/member-invitations", {});
    expect(anonymous.status).toBe(401);
    expect(await count("SELECT COUNT(*) AS total FROM member_login_invitations")).toBe(0);
  });

  it("revokes a pending grant once and reports missing or settled grants", async () => {
    const issued = await issue(admin, "revocable@example.test");
    const revoked = await api(`/api/admin/member-invitations/${issued.id}/revoke`, { token: admin, method: "POST" });
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toEqual({
      invitation: { id: issued.id, email: "revocable@example.test", status: "revoked" },
    });
    const row = await env.DB.prepare("SELECT status, revoked_at FROM member_login_invitations WHERE id = ?").bind(issued.id).first();
    expect(row).toEqual({ status: "revoked", revoked_at: expect.any(String) });
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.invitation_revoked'")).toBe(1);

    const again = await api(`/api/admin/member-invitations/${issued.id}/revoke`, { token: admin, method: "POST" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: "INVITATION_NOT_PENDING" } });
    const missing = await api("/api/admin/member-invitations/does-not-exist/revoke", { token: admin, method: "POST" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "INVITATION_NOT_FOUND" } });
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.invitation_revoked'")).toBe(1);
  });

  it("keeps concurrent conditional writes single-winner at the repository boundary", async () => {
    const audit = new AuditRepository(env.DB);
    const repository = new MemberInvitationsRepository(env.DB, audit);
    const service = new MemberInvitationsService(repository);
    const inserts = await Promise.all([
      service.issue("inviter-admin", { email: "concurrent-email@example.test" }),
      service.issue("inviter-admin", { email: "concurrent-email@example.test" }),
    ].map((promise) => promise.then(() => "issued", (error: { code?: string }) => error.code)));
    expect(inserts.filter((value) => value === "issued")).toHaveLength(1);
    expect(inserts.filter((value) => value === "INVITATION_ALREADY_PENDING")).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS total FROM member_login_invitations WHERE email = 'concurrent-email@example.test' AND status = 'pending'")).toBe(1);
  });
});

async function contributorToken(): Promise<string> {
  const members = new MembersRepository(env.DB);
  const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
  return (await sessions.create((await members.findById("invitee-contributor"))!)).token;
}

async function api(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", ORIGIN);
  if (init.token) headers.set("cookie", `__Host-memory-session=${init.token}`);
  const request = new Request(`${ORIGIN}${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function issue(token: string, email: string): Promise<InvitationDto> {
  const response = await api("/api/admin/member-invitations", { token, method: "POST", body: JSON.stringify({ email }) });
  expect(response.status, email).toBe(201);
  const payload = await response.json() as { invitation: InvitationDto };
  return payload.invitation;
}

async function count(sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<{ total: number }>();
  return row!.total;
}
