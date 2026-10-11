/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { AuditRepository } from "../../src/audit/repository";
import { SessionService } from "../../src/identity/session";
import { MemberInvitationsRepository } from "../../src/member-invitations/repository";
import { MemberInvitationsService } from "../../src/member-invitations/service";
import { MAX_CODE_LOGIN_ATTEMPTS } from "../../src/member-invitations/types";
import { MembersRepository } from "../../src/members/repository";
import { MembersService } from "../../src/members/service";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const CODE = /^[A-Za-z0-9_-]{43}$/u;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;

interface InvitationDto {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

describe("admin-issued one-time login codes", () => {
  let admin = "";
  let contributor = "";

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
    contributor = (await sessions.create((await members.findById("invitee-contributor"))!)).token;
  });

  it("issues a 43-character code and stores only its sha256 hex", async () => {
    const response = await api("/api/admin/member-invitations", {
      token: admin,
      method: "POST",
      body: JSON.stringify({ email: "  Newcomer@Example.Test  " }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json() as { invitation: InvitationDto; code: string };
    expect(payload.invitation).toEqual({
      id: expect.any(String),
      email: "newcomer@example.test",
      status: "pending",
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(Object.keys(payload.invitation).sort()).toEqual(["createdAt", "email", "expiresAt", "id", "status"]);
    expect(payload.code).toMatch(CODE);
    expect(Date.parse(payload.invitation.expiresAt) - Date.parse(payload.invitation.createdAt)).toBe(TWENTY_FOUR_HOURS_MS);

    const row = await env.DB.prepare("SELECT * FROM member_login_invitations WHERE id = ?").bind(payload.invitation.id).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      email: "newcomer@example.test",
      status: "pending",
      attempt_count: 0,
      redeemed_at: null,
      revoked_at: null,
      code_hash: await sha256Hex(payload.code),
    });
    expect(row!.code_hash).toMatch(/^[0-9a-f]{64}$/u);
    // The plaintext code is never persisted anywhere in the row.
    expect(Object.values(row!).some((value) => typeof value === "string" && value.includes(payload.code))).toBe(false);

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
    expect(audit!.metadata).not.toContain(payload.code);
  });

  it("lists invitations without ever exposing a code or its hash", async () => {
    const first = await issue(admin, "first@example.test");
    const second = await issue(admin, "second@example.test");
    const response = await api("/api/admin/member-invitations", { token: admin });
    expect(response.status).toBe(200);
    const body = await response.json() as { items: InvitationDto[] };
    expect(body.items.map((item) => item.email).sort()).toEqual(["first@example.test", "second@example.test"]);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(["createdAt", "email", "expiresAt", "id", "status"]);
      expect(item.status).toBe("pending");
    }
    const serialized = JSON.stringify(body);
    for (const code of [first.code, second.code]) {
      expect(serialized).not.toContain(code);
      expect(serialized).not.toContain(await sha256Hex(code));
    }
    expect(serialized).not.toContain("codeHash");
  });

  it("rejects a second pending invitation for the same canonical email", async () => {
    expect((await issue(admin, "duplicate@example.test")).code).toMatch(CODE);
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
    // `one_active_admin` (0001) allows exactly one active administrator, so the
    // suite's seeded inviter-admin is the only active one; a disabled
    // administrator is not covered by that partial index.
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
    const allowed = await issue(admin, "retired-admin@example.test");
    expect(allowed.code).toMatch(CODE);
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

  it("revokes a pending invitation once and reports missing or settled invitations", async () => {
    const issued = await issue(admin, "revocable@example.test");
    const revoked = await api(`/api/admin/member-invitations/${issued.invitation.id}/revoke`, { token: admin, method: "POST" });
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toEqual({
      invitation: { id: issued.invitation.id, email: "revocable@example.test", status: "revoked" },
    });
    const row = await env.DB.prepare("SELECT status, revoked_at FROM member_login_invitations WHERE id = ?").bind(issued.invitation.id).first();
    expect(row).toEqual({ status: "revoked", revoked_at: expect.any(String) });
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.invitation_revoked'")).toBe(1);

    const again = await api(`/api/admin/member-invitations/${issued.invitation.id}/revoke`, { token: admin, method: "POST" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: "INVITATION_NOT_PENDING" } });
    const missing = await api("/api/admin/member-invitations/does-not-exist/revoke", { token: admin, method: "POST" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "INVITATION_NOT_FOUND" } });
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.invitation_revoked'")).toBe(1);
  });

  it("redeems a code into an active contributor session for an email outside the GitHub allowlist", async () => {
    const issued = await issue(admin, "outsider@example.test");
    const response = await codeLogin("outsider@example.test", issued.code);
    expect(response.status).toBe(200);
    const body = await response.json() as { member: { id: string; email: string; role: string } };
    expect(body.member).toMatchObject({ email: "outsider@example.test", role: "contributor" });
    expect(body.member.id).toEqual(expect.any(String));

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-memory-session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/u);
    const token = cookie.split(";", 1)[0]!.slice("__Host-memory-session=".length);

    const member = await env.DB.prepare("SELECT * FROM members WHERE email = ?").bind("outsider@example.test")
      .first<{ id: string; access_sub: string; role: string; status: string }>();
    expect(member).toMatchObject({ id: body.member.id, role: "contributor", status: "active" });
    expect(member!.access_sub).toMatch(/^code:[0-9a-f-]{36}$/u);

    const invitation = await env.DB.prepare("SELECT status, attempt_count, redeemed_at FROM member_login_invitations WHERE id = ?")
      .bind(issued.invitation.id).first();
    expect(invitation).toEqual({ status: "redeemed", attempt_count: 0, redeemed_at: expect.any(String) });
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.login'")).toBe(1);

    // The cookie is a real session, and the account is a contributor, not an admin.
    const session = await api("/api/session", { token });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      member: { id: body.member.id, email: "outsider@example.test", role: "contributor" },
    });
    const denied = await api("/api/admin/member-invitations", { token });
    expect(denied.status).toBe(403);
  });

  it("matches an existing member by canonical email instead of creating a second one", async () => {
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('existing-member', 'github:777', 'existing-member@example.test', 'contributor', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')`,
    ).run();
    const issued = await issue(admin, " Existing-Member@Example.Test ");
    const response = await codeLogin("existing-member@example.test", issued.code);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      member: { id: "existing-member", email: "existing-member@example.test", role: "contributor" },
    });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE LOWER(TRIM(email)) = 'existing-member@example.test'")).toBe(1);
    // An existing member is not re-created, so no second login audit exists.
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.login'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(1);
  });

  it("refuses a code login whose matched member is disabled", async () => {
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('disabled-member', 'github:778', 'disabled-member@example.test', 'contributor', 'disabled', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')`,
    ).run();
    const issued = await issue(admin, "disabled-member@example.test");
    const response = await codeLogin("disabled-member@example.test", issued.code);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MEMBER_DISABLED" } });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a second redemption of the same code", async () => {
    const issued = await issue(admin, "single-use@example.test");
    const first = await codeLogin("single-use@example.test", issued.code);
    expect(first.status).toBe(200);
    const second = await codeLogin("single-use@example.test", issued.code);
    expect(second.status).toBe(401);
    expect(second.headers.get("set-cookie")).toBeNull();
    await expect(second.json()).resolves.toMatchObject({ error: { code: "CODE_LOGIN_INVALID" } });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'single-use@example.test'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM auth_sessions AS s JOIN members AS m ON m.id = s.member_id WHERE m.email = 'single-use@example.test'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(1);
  });

  it("lets exactly one of two simultaneous redemptions win", async () => {
    const issued = await issue(admin, "race@example.test");
    const body = JSON.stringify({ email: "race@example.test", code: issued.code });
    const responses = await Promise.all([
      api("/auth/code", { method: "POST", body }),
      api("/auth/code", { method: "POST", body }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(responses.filter((response) => response.headers.get("set-cookie") !== null)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'race@example.test'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(1);
    expect(await env.DB.prepare("SELECT status FROM member_login_invitations WHERE id = ?").bind(issued.invitation.id).first())
      .toEqual({ status: "redeemed" });
  });

  it("rejects an expired invitation and counts the attempt", async () => {
    const issued = await issue(admin, "expired@example.test");
    await env.DB.prepare("UPDATE member_login_invitations SET expires_at = ? WHERE id = ?")
      .bind(new Date(Date.parse(issued.invitation.expiresAt) - TWENTY_FOUR_HOURS_MS * 2).toISOString(), issued.invitation.id).run();
    const response = await codeLogin("expired@example.test", issued.code);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CODE_LOGIN_INVALID" } });
    expect(await env.DB.prepare("SELECT status, attempt_count FROM member_login_invitations WHERE id = ?").bind(issued.invitation.id).first())
      .toEqual({ status: "pending", attempt_count: 1 });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'expired@example.test'")).toBe(0);
    const denial = await env.DB.prepare("SELECT metadata FROM audit_events WHERE action = 'member.code_login_denied'").first<{ metadata: string }>();
    expect(JSON.parse(denial!.metadata)).toEqual({ email: "expired@example.test", reason: "expired" });
  });

  it("locks an invitation at the attempt ceiling and stops counting further failures", async () => {
    const issued = await issue(admin, "ceiling@example.test");
    const wrongCode = "z".repeat(43);
    for (let attempt = 0; attempt < MAX_CODE_LOGIN_ATTEMPTS; attempt += 1) {
      const response = await codeLogin("ceiling@example.test", wrongCode);
      expect(response.status, `attempt ${attempt}`).toBe(401);
    }
    expect(await env.DB.prepare("SELECT status, attempt_count FROM member_login_invitations WHERE id = ?").bind(issued.invitation.id).first())
      .toEqual({ status: "pending", attempt_count: MAX_CODE_LOGIN_ATTEMPTS });

    // The correct code no longer works, and further failures do not grow the counter.
    const locked = await codeLogin("ceiling@example.test", issued.code);
    expect(locked.status).toBe(401);
    await expect(locked.json()).resolves.toMatchObject({ error: { code: "CODE_LOGIN_INVALID" } });
    expect((await codeLogin("ceiling@example.test", wrongCode)).status).toBe(401);
    expect(await env.DB.prepare("SELECT status, attempt_count FROM member_login_invitations WHERE id = ?").bind(issued.invitation.id).first())
      .toEqual({ status: "pending", attempt_count: MAX_CODE_LOGIN_ATTEMPTS });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'ceiling@example.test'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login_denied'")).toBe(MAX_CODE_LOGIN_ATTEMPTS);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(0);
  });

  it("returns one indistinguishable 401 for every verification failure", async () => {
    const issued = await issue(admin, "unlinkable@example.test");
    const cases: Array<[string, string]> = [
      ["unknown@example.test", issued.code],
      ["unlinkable@example.test", "q".repeat(43)],
      ["other@example.test", issued.code],
      ["unlinkable@example.test", "short"],
      ["unlinkable@example.test", "a".repeat(44)],
      ["unlinkable@example.test", "a".repeat(43) + "!"],
    ];
    for (const [email, code] of cases) {
      const response = await codeLogin(email, code);
      expect(response.status, `${email} ${code.length}`).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "CODE_LOGIN_INVALID" } });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'other@example.test'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(0);

    // A revoked invitation is indistinguishable from an unknown code.
    const revokedCode = await issue(admin, "revoked-code@example.test");
    await api(`/api/admin/member-invitations/${revokedCode.invitation.id}/revoke`, { token: admin, method: "POST" });
    const revokedAttempt = await codeLogin("revoked-code@example.test", revokedCode.code);
    expect(revokedAttempt.status).toBe(401);
    await expect(revokedAttempt.json()).resolves.toMatchObject({ error: { code: "CODE_LOGIN_INVALID" } });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'revoked-code@example.test'")).toBe(0);
  });

  it("rejects malformed code logins with its own 400 and GET with 405", async () => {
    for (const body of ["{}", '{"email":"person@example.test"}', '{"code":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', '{"email":"person@example.test","code":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","extra":1}', "{"]) {
      const response = await api("/auth/code", { method: "POST", body });
      expect(response.status, body).toBe(400);
      const payload = await response.json() as { error: { code: string } };
      expect(payload.error.code, body).toBe("CODE_LOGIN_REQUEST_INVALID");
    }
    const wrongMethod = await api("/auth/code", {});
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
    const query = await api("/auth/code?email=person@example.test", { method: "POST", body: "{}" });
    expect(query.status).toBe(400);
    expect(await count("SELECT COUNT(*) AS total FROM member_login_invitations")).toBe(0);
  });

  it("forces the contributor role even when the invited email is the bootstrap administrator email", async () => {
    // `bootstrap-only@example.test` is this suite's BOOTSTRAP_ADMIN_EMAIL and
    // its GitHub allowlist entry. No active administrator *member* owns it, so
    // the invitation is allowed; the sole administrator is then disabled, which
    // leaves the database without any active administrator before redemption.
    const issued = await issue(admin, "bootstrap-only@example.test");
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'inviter-admin'").run();
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE role = 'admin' AND status = 'active'")).toBe(0);

    const response = await codeLogin("bootstrap-only@example.test", issued.code);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      member: { email: "bootstrap-only@example.test", role: "contributor" },
    });
    expect(await env.DB.prepare("SELECT role, status FROM members WHERE email = ?").bind("bootstrap-only@example.test").first())
      .toEqual({ role: "contributor", status: "active" });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE role = 'admin' AND status = 'active'")).toBe(0);
    const loginAudit = await env.DB.prepare("SELECT metadata FROM audit_events WHERE action = 'member.login'").first<{ metadata: string }>();
    expect(JSON.parse(loginAudit!.metadata)).toEqual({ role: "contributor" });
  });

  it("keeps concurrent conditional writes single-winner at the repository boundary", async () => {
    const audit = new AuditRepository(env.DB);
    const repository = new MemberInvitationsRepository(env.DB, audit);
    const issued = await issue(admin, "repository-race@example.test");
    const now = new Date().toISOString();
    const results = await Promise.all([
      repository.redeem(issued.invitation.id, now, MAX_CODE_LOGIN_ATTEMPTS, codeLoginAudit(issued.invitation.id, "repository-race@example.test", now)),
      repository.redeem(issued.invitation.id, now, MAX_CODE_LOGIN_ATTEMPTS, codeLoginAudit(issued.invitation.id, "repository-race@example.test", now)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(1);

    // The conditional insert and the partial unique index both refuse a second pending row.
    const service = invitationService();
    const inserts = await Promise.all([
      service.issue("inviter-admin", { email: "concurrent-email@example.test" }),
      service.issue("inviter-admin", { email: "concurrent-email@example.test" }),
    ].map((promise) => promise.then(() => "issued", (error: { code?: string }) => error.code)));
    expect(inserts.filter((value) => value === "issued")).toHaveLength(1);
    expect(inserts.filter((value) => value === "INVITATION_ALREADY_PENDING")).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS total FROM member_login_invitations WHERE email = 'concurrent-email@example.test' AND status = 'pending'")).toBe(1);
  });
});

function invitationService(): MemberInvitationsService {
  const members = new MembersService(new MembersRepository(env.DB), {}, { waitUntil: () => undefined });
  return new MemberInvitationsService(new MemberInvitationsRepository(env.DB, new AuditRepository(env.DB)), members);
}

function codeLoginAudit(invitationId: string, email: string, createdAt: string) {
  return {
    id: crypto.randomUUID(),
    actorKind: "member" as const,
    actorId: null,
    action: "member.code_login" as const,
    resourceType: "member_invitation" as const,
    resourceId: invitationId,
    metadata: { email },
    createdAt,
  };
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

function codeLogin(email: string, code: string): Promise<Response> {
  return api("/auth/code", { method: "POST", body: JSON.stringify({ email, code }) });
}

async function issue(token: string, email: string): Promise<{ invitation: InvitationDto; code: string }> {
  const response = await api("/api/admin/member-invitations", { token, method: "POST", body: JSON.stringify({ email }) });
  expect(response.status, email).toBe(201);
  return await response.json() as { invitation: InvitationDto; code: string };
}

async function count(sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<{ total: number }>();
  return row!.total;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
