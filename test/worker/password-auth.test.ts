/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDependencies } from "../../src/app";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const PASSWORD = "correct horse battery staple";
const WEAK = "short";
const IP = "203.0.113.42";

describe("password registration and login", () => {
  let now: number;
  let id: number;
  let audit: number;

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

  it("registers an active contributor, hashes the password and opens a session", async () => {
    const response = await api(app(), "/auth/register", "POST", { email: " New@Example.Test ", password: PASSWORD });
    expect(response.status).toBe(201);
    const body = await response.json() as { member: { id: string; email: string; role: string }; recoveryCode: string };
    expect(body.member).toMatchObject({ id: "member-1", email: "new@example.test", role: "contributor" });
    expect(body.recoveryCode).toMatch(/^[A-Z2-7]{6}-[A-Z2-7]{6}-[A-Z2-7]{6}-[A-Z2-7]{6}$/u);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-memory-session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/u);
    const token = cookie.split(";", 1)[0]!.slice("__Host-memory-session=".length);

    const row = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind("member-1")
      .first<{ access_sub: string; email: string; role: string; status: string; password_hash: string; recovery_code_hash: string }>();
    expect(row).toMatchObject({ access_sub: "password:member-1", email: "new@example.test", role: "contributor", status: "active" });
    expect(row!.password_hash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/u);
    expect(row!.password_hash).not.toContain(PASSWORD);
    expect(row!.recovery_code_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(row)).not.toContain(body.recoveryCode.replaceAll("-", ""));
    expect(await count("SELECT COUNT(*) AS total FROM password_registration_attempts")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.login'")).toBe(1);

    const session = await api(app(), "/api/session", "GET", undefined, token);
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({ member: { id: "member-1", email: "new@example.test", role: "contributor" } });
  });

  it("rejects malformed requests, weak passwords and methods", async () => {
    for (const body of ["{}", '{"email":"a@b.test"}', '{"email":"a@b.test","password":"x","extra":1}', "[]", "{"]) {
      const response = await api(app(), "/auth/register", "POST", body);
      expect(response.status, body).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "PASSWORD_AUTH_REQUEST_INVALID" } });
    }
    const weak = await api(app(), "/auth/register", "POST", { email: "weak@example.test", password: WEAK });
    expect(weak.status).toBe(400);
    await expect(weak.json()).resolves.toMatchObject({ error: { code: "PASSWORD_POLICY_INVALID" } });
    const wrongMethod = await api(app(), "/auth/register", "GET");
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
    const query = await api(app(), "/auth/register?x=1", "POST", { email: "a@b.test", password: PASSWORD });
    expect(query.status).toBe(400);
    const crossOrigin = await api(app(), "/auth/register", "POST", { email: "a@b.test", password: PASSWORD }, undefined, "https://attacker.example");
    expect(crossOrigin.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'weak@example.test'")).toBe(0);
  });

  it("never lets registration claim an existing member, including a GitHub-only account", async () => {
    const existing = await api(app(), "/auth/register", "POST", { email: "existing@example.test", password: PASSWORD });
    expect(existing.status).toBe(409);
    await expect(existing.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_EMAIL_TAKEN" } });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE LOWER(TRIM(email)) = 'existing@example.test'")).toBe(1);
    expect(await env.DB.prepare("SELECT password_hash FROM members WHERE id = 'github-user'").first()).toEqual({ password_hash: null });
  });

  it("limits registration attempts per client IP", async () => {
    const limited = app({ registrationLimit: 2 });
    expect((await api(limited, "/auth/register", "POST", { email: "one@example.test", password: PASSWORD })).status).toBe(201);
    expect((await api(limited, "/auth/register", "POST", { email: "two@example.test", password: PASSWORD })).status).toBe(201);
    const third = await api(limited, "/auth/register", "POST", { email: "three@example.test", password: PASSWORD });
    expect(third.status).toBe(429);
    await expect(third.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_RATE_LIMITED" } });
    const otherIp = await api(limited, "/auth/register", "POST", { email: "four@example.test", password: PASSWORD }, undefined, ORIGIN, "198.51.100.7");
    expect(otherIp.status).toBe(201);
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

  it("lets exactly one concurrent registration for the same email win", async () => {
    const body = { email: "race@example.test", password: PASSWORD };
    const responses = await Promise.all([
      api(app(), "/auth/register", "POST", body),
      api(app(), "/auth/register", "POST", body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'race@example.test'")).toBe(1);
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

  it("resets the password with the recovery code, rotates it and revokes sessions", async () => {
    const account = await registerAccount("recover@example.test");
    const reset = await api(app(), "/auth/password/reset", "POST", {
      email: "recover@example.test",
      recoveryCode: account.recoveryCode,
      password: "a brand new password",
    });
    expect(reset.status).toBe(200);
    const rotated = (await reset.json() as { recoveryCode: string }).recoveryCode;
    expect(rotated).toMatch(/^[A-Z2-7]{6}-[A-Z2-7]{6}-[A-Z2-7]{6}-[A-Z2-7]{6}$/u);
    expect(rotated).not.toBe(account.recoveryCode);
    expect((await api(app(), "/api/session", "GET", undefined, account.token)).status).toBe(401);
    expect((await api(app(), "/auth/password", "POST", { email: "recover@example.test", password: PASSWORD })).status).toBe(401);
    expect((await api(app(), "/auth/password", "POST", { email: "recover@example.test", password: "a brand new password" })).status).toBe(200);
    expect((await api(app(), "/auth/password/reset", "POST", { email: "recover@example.test", recoveryCode: account.recoveryCode, password: "another password value" })).status).toBe(401);
    expect((await api(app(), "/auth/password/reset", "POST", { email: "recover@example.test", recoveryCode: rotated, password: "another password value" })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.password_reset'")).toBe(2);
  });

  it("locks recovery attempts and rejects unknown emails, weak passwords and another account's code", async () => {
    const account = await registerAccount("recovery-lock@example.test");
    const other = await registerAccount("other-recovery@example.test");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await api(app(), "/auth/password/reset", "POST", { email: "recovery-lock@example.test", recoveryCode: "AAAAAA-AAAAAA-AAAAAA-AAAAAA", password: "another password value" })).status).toBe(401);
    }
    expect((await api(app(), "/auth/password/reset", "POST", { email: "recovery-lock@example.test", recoveryCode: "AAAAAA-AAAAAA-AAAAAA-AAAAAA", password: "another password value" })).status).toBe(429);
    expect((await api(app(), "/auth/password/reset", "POST", { email: "recovery-lock@example.test", recoveryCode: account.recoveryCode, password: "another password value" })).status).toBe(429);
    expect((await api(app(), "/auth/password/reset", "POST", { email: "unknown@example.test", recoveryCode: account.recoveryCode, password: "another password value" })).status).toBe(401);
    expect((await api(app(), "/auth/password/reset", "POST", { email: "other-recovery@example.test", recoveryCode: account.recoveryCode, password: "another password value" })).status).toBe(401);
    expect((await api(app(), "/auth/password/reset", "POST", { email: "other-recovery@example.test", recoveryCode: other.recoveryCode, password: WEAK })).status).toBe(400);
    expect((await api(app(), "/auth/password/reset", "POST", { email: "other-recovery@example.test", recoveryCode: "short", password: "another password value" })).status).toBe(400);
    expect((await api(app(), "/auth/password/reset", "GET")).status).toBe(405);
  });

  it("lets exactly one of two simultaneous resets win", async () => {
    const account = await registerAccount("reset-race@example.test");
    const body = { email: "reset-race@example.test", recoveryCode: account.recoveryCode, password: "another password value" };
    const responses = await Promise.all([
      api(app(), "/auth/password/reset", "POST", body),
      api(app(), "/auth/password/reset", "POST", body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
  });

  async function registerAccount(email: string): Promise<{ recoveryCode: string; token: string }> {
    const response = await api(app(), "/auth/register", "POST", { email, password: PASSWORD });
    expect(response.status, email).toBe(201);
    const body = await response.json() as { recoveryCode: string };
    const cookie = response.headers.get("set-cookie") ?? "";
    return { recoveryCode: body.recoveryCode, token: cookie.split(";", 1)[0]!.slice("__Host-memory-session=".length) };
  }

  async function register(email: string): Promise<Response> {
    const response = await api(app(), "/auth/register", "POST", { email, password: PASSWORD });
    expect(response.status, email).toBe(201);
    return response;
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
