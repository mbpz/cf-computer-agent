/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDependencies } from "../../src/app";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const PASSWORD = "correct horse battery staple";
const WEAK = "short";
const IP = "203.0.113.42";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

describe("invitation-code password registration and login", () => {
  let now: number;
  let id: number;
  let audit: number;
  let codeSeed: number;

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('github-user', 'github:101', 'existing@example.test', 'contributor', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    now = Date.parse("2026-10-18T12:00:00.000Z");
    id = 0;
    audit = 0;
    codeSeed = 0;
  });

  function app(overrides: AppDependencies["passwordAuth"] = {}) {
    return createApp({
      passwordAuth: {
        now: () => new Date(now),
        id: () => `member-${++id}`,
        auditId: () => `audit-${++audit}`,
        registrationLimit: 5,
        loginFailureThreshold: 5,
        lockMs: 15 * 60 * 1_000,
        ...overrides,
      },
    });
  }

  it("registers an active contributor only by claiming an unused invitation code", async () => {
    const invitation = await seedInvitation();
    const response = await api(app(), "/auth/register", "POST", {
      email: " New@Example.Test ",
      password: PASSWORD,
      invitationCode: grouped(invitation).toLowerCase(),
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { member: { id: string; email: string; role: string } };
    expect(body.member).toMatchObject({ id: "member-1", email: "new@example.test", role: "contributor" });
    expect(body).not.toHaveProperty("recoveryCode");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-memory-session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/u);
    const token = cookie.split(";", 1)[0]!.slice("__Host-memory-session=".length);

    const row = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind("member-1")
      .first<{ access_sub: string; email: string; role: string; status: string; password_hash: string }>();
    expect(row).toMatchObject({ access_sub: "password:member-1", email: "new@example.test", role: "contributor", status: "active" });
    expect(row!.password_hash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/u);
    expect(row!.password_hash).not.toContain(PASSWORD);
    expect(JSON.stringify(row)).not.toContain(PASSWORD);

    // The member insert and the code claim committed together.
    expect(await invitationRow(invitation)).toMatchObject({
      status: "used",
      bound_member_id: "member-1",
      used_at: "2026-10-18T12:00:00.000Z",
    });
    expect(await count("SELECT COUNT(*) AS total FROM password_registration_attempts")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.login'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM invitations")).toBe(1);

    const session = await api(app(), "/api/session", "GET", undefined, token);
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({ member: { id: "member-1", email: "new@example.test", role: "contributor" } });
  });

  it("rejects malformed requests, missing/invalid invitation codes, weak passwords and methods", async () => {
    for (const body of [
      "{}",
      '{"email":"a@b.test"}',
      '{"email":"a@b.test","password":"x","extra":1}',
      "[]",
      "{",
    ]) {
      const response = await api(app(), "/auth/register", "POST", body);
      expect(response.status, body).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "PASSWORD_AUTH_REQUEST_INVALID" } });
    }

    const missing = await api(app(), "/auth/register", "POST", { email: "a@b.test", password: PASSWORD });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_INVITATION_REQUIRED" } });
    const empty = await api(app(), "/auth/register", "POST", { email: "a@b.test", password: PASSWORD, invitationCode: "   " });
    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_INVITATION_REQUIRED" } });

    for (const invitationCode of ["ABCD", "ABCDEFGHJKLMNOP1", "ABCD-EFGH-IJKL-MNOP", 42] as const) {
      const response = await api(app(), "/auth/register", "POST", { email: "a@b.test", password: PASSWORD, invitationCode });
      expect(response.status, String(invitationCode)).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_INVITATION_INVALID" } });
    }

    const invitation = await seedInvitation();
    const weak = await api(app(), "/auth/register", "POST", { email: "weak@example.test", password: WEAK, invitationCode: invitation });
    expect(weak.status).toBe(400);
    await expect(weak.json()).resolves.toMatchObject({ error: { code: "PASSWORD_POLICY_INVALID" } });

    const wrongMethod = await api(app(), "/auth/register", "GET");
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
    const query = await api(app(), "/auth/register?x=1", "POST", { email: "a@b.test", password: PASSWORD, invitationCode: invitation });
    expect(query.status).toBe(400);
    const crossOrigin = await api(app(), "/auth/register", "POST", { email: "a@b.test", password: PASSWORD, invitationCode: invitation }, undefined, "https://attacker.example");
    expect(crossOrigin.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'weak@example.test'")).toBe(0);
    expect(await invitationRow(invitation)).toMatchObject({ status: "unused", bound_member_id: null });
  });

  it("never lets registration claim an existing member, including a GitHub-only account", async () => {
    const invitation = await seedInvitation();
    const existing = await api(app(), "/auth/register", "POST", { email: "existing@example.test", password: PASSWORD, invitationCode: invitation });
    expect(existing.status).toBe(409);
    await expect(existing.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_EMAIL_TAKEN" } });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE LOWER(TRIM(email)) = 'existing@example.test'")).toBe(1);
    expect(await env.DB.prepare("SELECT password_hash FROM members WHERE id = 'github-user'").first()).toEqual({ password_hash: null });
    // A rejected registration never spends the code.
    expect(await invitationRow(invitation)).toMatchObject({ status: "unused", bound_member_id: null });
  });

  it("limits registration attempts per client IP", async () => {
    const codes = [await seedInvitation(), await seedInvitation(), await seedInvitation(), await seedInvitation()];
    const limited = app({ registrationLimit: 2 });
    expect((await api(limited, "/auth/register", "POST", { email: "one@example.test", password: PASSWORD, invitationCode: codes[0] })).status).toBe(201);
    expect((await api(limited, "/auth/register", "POST", { email: "two@example.test", password: PASSWORD, invitationCode: codes[1] })).status).toBe(201);
    const third = await api(limited, "/auth/register", "POST", { email: "three@example.test", password: PASSWORD, invitationCode: codes[2] });
    expect(third.status).toBe(429);
    await expect(third.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_RATE_LIMITED" } });
    const otherIp = await api(limited, "/auth/register", "POST", { email: "four@example.test", password: PASSWORD, invitationCode: codes[3] }, undefined, ORIGIN, "198.51.100.7");
    expect(otherIp.status).toBe(201);
    // The rate-limited attempt did not consume its code.
    expect(await invitationRow(codes[2])).toMatchObject({ status: "unused" });
  });

  it("logs in with the exact password and rejects wrong, unknown and malformed credentials", async () => {
    await register("login@example.test");
    const ok = await api(app(), "/auth/password", "POST", { email: " LOGIN@example.test ", password: PASSWORD });
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({ member: { email: "login@example.test", role: "contributor" } });
    expect(ok.headers.get("set-cookie")).toMatch(/^__Host-memory-session=/u);

    for (const [email, password] of [
      ["login@example.test", "wrong password value"],
      ["unknown@example.test", PASSWORD],
      ["existing@example.test", PASSWORD],
    ] as const) {
      const response = await api(app(), "/auth/password", "POST", { email, password });
      expect(response.status, email).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "PASSWORD_LOGIN_INVALID" } });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect((await api(app(), "/auth/password", "POST", "{}")).status).toBe(400);
  });

  it("locks an account for fifteen minutes after five failures", async () => {
    await register("locked@example.test");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await api(app(), "/auth/password", "POST", { email: "locked@example.test", password: "wrong password value" })).status).toBe(401);
    }
    expect((await api(app(), "/auth/password", "POST", { email: "locked@example.test", password: "wrong password value" })).status).toBe(429);
    expect(await env.DB.prepare("SELECT failed_login_count, locked_until FROM members WHERE email = 'locked@example.test'").first())
      .toEqual({ failed_login_count: 5, locked_until: "2026-10-18T12:15:00.000Z" });

    const locked = await api(app(), "/auth/password", "POST", { email: "locked@example.test", password: PASSWORD });
    expect(locked.status).toBe(429);
    await expect(locked.json()).resolves.toMatchObject({ error: { code: "PASSWORD_LOGIN_LOCKED", details: { retryAfterSeconds: 900 } } });

    now += 15 * 60 * 1_000 + 1;
    const unlocked = await api(app(), "/auth/password", "POST", { email: "locked@example.test", password: PASSWORD });
    expect(unlocked.status).toBe(200);
    expect(await env.DB.prepare("SELECT failed_login_count, locked_until FROM members WHERE email = 'locked@example.test'").first())
      .toEqual({ failed_login_count: 0, locked_until: null });
  });

  it("refuses a disabled member only after the password is verified", async () => {
    await register("disabled@example.test");
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE email = 'disabled@example.test'").run();
    const wrong = await api(app(), "/auth/password", "POST", { email: "disabled@example.test", password: "wrong password value" });
    expect(wrong.status).toBe(401);
    const correct = await api(app(), "/auth/password", "POST", { email: "disabled@example.test", password: PASSWORD });
    expect(correct.status).toBe(403);
    await expect(correct.json()).resolves.toMatchObject({ error: { code: "MEMBER_DISABLED" } });
    expect(correct.headers.get("set-cookie")).toBeNull();
  });

  it("lets exactly one concurrent registration for the same email win and keeps the losing code unused", async () => {
    const first = await seedInvitation();
    const second = await seedInvitation();
    const body = (invitationCode: string) => ({ email: "race@example.test", password: PASSWORD, invitationCode });
    const responses = await Promise.all([
      api(app(), "/auth/register", "POST", body(first)),
      api(app(), "/auth/register", "POST", body(second)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'race@example.test'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM invitations WHERE status = 'used'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.login'")).toBe(1);
  });

  it("uses a distinct salt for every password hash", async () => {
    await register("salt-a@example.test");
    await register("salt-b@example.test");
    const rows = await env.DB.prepare(
      "SELECT password_hash FROM members WHERE email IN ('salt-a@example.test','salt-b@example.test') ORDER BY email",
    ).all<{ password_hash: string }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]!.password_hash).not.toBe(rows.results[1]!.password_hash);
  });

  it("resets the password only with the invitation code bound to the member and revokes existing sessions", async () => {
    const account = await registerAccount("recover@example.test");
    const reset = await api(app(), "/auth/password/reset", "POST", {
      email: "recover@example.test",
      password: "a brand new password",
      invitationCode: account.invitationCode,
    });
    expect(reset.status).toBe(204);
    expect(await reset.text()).toBe("");
    expect((await api(app(), "/api/session", "GET", undefined, account.token)).status).toBe(401);
    expect((await api(app(), "/auth/password", "POST", { email: "recover@example.test", password: PASSWORD })).status).toBe(401);
    expect((await api(app(), "/auth/password", "POST", { email: "recover@example.test", password: "a brand new password" })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.password_reset'")).toBe(1);
    expect(await env.DB.prepare("SELECT failed_login_count, locked_until FROM members WHERE email = 'recover@example.test'").first())
      .toEqual({ failed_login_count: 0, locked_until: null });
    // The reset code stays claimed by the same member; it is not re-consumed.
    expect(await invitationRow(account.invitationCode)).toMatchObject({ status: "used", bound_member_id: account.memberId });

    // The same bound code can reset again; the previous password stops working.
    expect((await api(app(), "/auth/password/reset", "POST", {
      email: "recover@example.test",
      password: "another password value",
      invitationCode: grouped(account.invitationCode),
    })).status).toBe(204);
    expect((await api(app(), "/auth/password", "POST", { email: "recover@example.test", password: "a brand new password" })).status).toBe(401);
    expect((await api(app(), "/auth/password", "POST", { email: "recover@example.test", password: "another password value" })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.password_reset'")).toBe(2);
  });

  it("rejects resets without the exact bound invitation code", async () => {
    const account = await registerAccount("bound@example.test");
    const otherAccount = await registerAccount("other-bound@example.test");
    // A different, still unused code is not proof of identity.
    const otherUnused = await seedInvitation();

    for (const input of [
      { email: "unknown@example.test", password: "another password value", invitationCode: otherUnused },
      { email: "bound@example.test", password: "another password value", invitationCode: otherUnused },
      { email: "bound@example.test", password: "another password value", invitationCode: otherAccount.invitationCode },
      { email: "existing@example.test", password: "another password value", invitationCode: otherUnused },
      { email: "bound@example.test", password: "another password value" },
      { email: "bound@example.test", password: "another password value", invitationCode: "ABCD" },
      { email: "bound@example.test", password: "another password value", invitationCode: 42 },
    ] as const) {
      const response = await api(app(), "/auth/password/reset", "POST", input);
      expect(response.status, JSON.stringify(input)).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "PASSWORD_RESET_INVALID" } });
    }
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.password_reset'")).toBe(0);
    // The account's own code never leaked into any failure, and it still works.
    expect((await api(app(), "/auth/password/reset", "POST", {
      email: "bound@example.test",
      password: "a brand new password",
      invitationCode: account.invitationCode,
    })).status).toBe(204);
  });

  it("rejects a disabled member's reset and a member without a bound invitation", async () => {
    const account = await registerAccount("disabled-reset@example.test");
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(account.memberId).run();
    const disabled = await api(app(), "/auth/password/reset", "POST", {
      email: "disabled-reset@example.test",
      password: "a brand new password",
      invitationCode: account.invitationCode,
    });
    expect(disabled.status).toBe(401);
    await expect(disabled.json()).resolves.toMatchObject({ error: { code: "PASSWORD_RESET_INVALID" } });

    // Members created by the retired one-time-code login have no bound code.
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('legacy-code-user', 'code:legacy', 'legacy@example.test', 'contributor', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at) VALUES
       (?, 'legacy-code-user', '2026-10-18T12:00:00.000Z', '2026-11-18T12:00:00.000Z', '2026-10-18T12:00:00.000Z')`,
    ).bind("a".repeat(64)).run();
    const legacy = await api(app(), "/auth/password/reset", "POST", {
      email: "legacy@example.test",
      password: "a brand new password",
      invitationCode: account.invitationCode,
    });
    expect(legacy.status).toBe(401);
    expect(await count("SELECT COUNT(*) AS total FROM auth_sessions WHERE member_id = 'legacy-code-user'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.password_reset'")).toBe(0);
  });

  it("rejects weak passwords and malformed reset requests", async () => {
    const account = await registerAccount("other-reset@example.test");
    const weak = await api(app(), "/auth/password/reset", "POST", {
      email: "other-reset@example.test",
      password: WEAK,
      invitationCode: account.invitationCode,
    });
    expect(weak.status).toBe(400);
    await expect(weak.json()).resolves.toMatchObject({ error: { code: "PASSWORD_POLICY_INVALID" } });

    for (const body of [
      "{}",
      '{"email":"a@b.test"}',
      '{"email":"a@b.test","password":"x","extra":1}',
      '{"email":"a@b.test","recoveryCode":"AAAAAA-AAAAAA-AAAAAA-AAAAAA","password":"another password value"}',
      "[]",
      "{",
    ]) {
      const response = await api(app(), "/auth/password/reset", "POST", body);
      expect(response.status, body).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "PASSWORD_RESET_REQUEST_INVALID" } });
    }
    expect((await api(app(), "/auth/password/reset", "GET")).status).toBe(405);
  });

  async function registerAccount(email: string): Promise<{ token: string; invitationCode: string; memberId: string }> {
    const invitation = await seedInvitation();
    const response = await api(app(), "/auth/register", "POST", { email, password: PASSWORD, invitationCode: invitation });
    expect(response.status, email).toBe(201);
    const body = await response.json() as { member: { id: string } };
    const cookie = response.headers.get("set-cookie") ?? "";
    return {
      token: cookie.split(";", 1)[0]!.slice("__Host-memory-session=".length),
      invitationCode: invitation,
      memberId: body.member.id,
    };
  }

  async function register(email: string): Promise<Response> {
    const invitation = await seedInvitation();
    const response = await api(app(), "/auth/register", "POST", { email, password: PASSWORD, invitationCode: invitation });
    expect(response.status, email).toBe(201);
    return response;
  }

  /** A canonical code per seed; the base-32 alphabet keeps every code legal. */
  async function seedInvitation(options: {
    status?: "unused" | "used";
    boundMemberId?: string;
    createdAt?: string;
  } = {}): Promise<string> {
    codeSeed += 1;
    let value = codeSeed;
    let code = "";
    for (let index = 0; index < 16; index += 1) {
      code += ALPHABET[value % 32];
      value = Math.floor(value / 32);
    }
    const status = options.status ?? "unused";
    await env.DB.prepare(
      `INSERT INTO invitations (id, code, kind, owner_member_id, bound_member_id, status, created_by_member_id, created_at, used_at)
       VALUES (?, ?, 'admin', NULL, ?, ?, 'github-user', ?, ?)`,
    ).bind(
      `invitation-${code}`,
      code,
      options.boundMemberId ?? null,
      status,
      options.createdAt ?? "2026-10-18T11:00:00.000Z",
      status === "used" ? "2026-10-18T11:30:00.000Z" : null,
    ).run();
    return code;
  }
});

async function api(
  app: ExportedHandler<Env>,
  path: string,
  method: string,
  body?: unknown,
  token?: string,
  origin = ORIGIN,
  ip = IP,
): Promise<Response> {
  const headers = new Headers({
    origin,
    "cf-connecting-ip": ip,
  });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  const request = new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  const context = createExecutionContext();
  const response = await app.fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function count(sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<{ total: number }>();
  return row!.total;
}

async function invitationRow(code: string): Promise<{
  status: string;
  bound_member_id: string | null;
  used_at: string | null;
} | null> {
  return env.DB.prepare("SELECT status, bound_member_id, used_at FROM invitations WHERE code = ?")
    .bind(code).first();
}

function grouped(code: string): string {
  return code.match(/.{1,4}/gu)!.join("-");
}
