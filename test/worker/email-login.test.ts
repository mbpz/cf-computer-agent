/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDependencies } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import type { EmailLoginMailer } from "../../src/email-login/types";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const ALLOWLISTED = "bootstrap-only@example.test";
const ADMIN_EMAIL = "email-admin@example.test";
const SIX_DIGITS = /^\d{6}$/u;

interface SentMail {
  to: string;
  code: string;
  expiresAt: string;
}

describe("email one-time-code login", () => {
  let now: number;
  let randomValue: number;
  let challengeId: number;
  let sent: SentMail[];
  let mailer: EmailLoginMailer & { fail: boolean };

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('email-admin', 'subject-email-admin', ?, 'admin', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).bind(ADMIN_EMAIL).run();
    now = Date.now();
    randomValue = 1;
    challengeId = 0;
    sent = [];
    mailer = {
      fail: false,
      async send(input) {
        if (mailer.fail) throw new Error("provider unavailable");
        sent.push(input);
      },
    };
  });

  function app(overrides: AppDependencies["emailLogin"] = {}) {
    return createApp({
      emailLogin: {
        mailer,
        now: () => new Date(now),
        randomBytes: () => {
          const bytes = new Uint8Array(4);
          new DataView(bytes.buffer).setUint32(0, randomValue);
          return bytes;
        },
        id: () => `challenge-${++challengeId}`,
        ...overrides,
      },
    });
  }

  it("emails a six-digit code for an allowlisted address and stores only its HMAC", async () => {
    const response = await api(app(), "/auth/email/code", { method: "POST", body: JSON.stringify({ email: " Bootstrap-Only@Example.Test " }) });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ALLOWLISTED, code: "100001", expiresAt: new Date(now + 10 * 60 * 1_000).toISOString() });
    expect(sent[0]!.code).toMatch(SIX_DIGITS);

    const row = await env.DB.prepare("SELECT * FROM email_login_codes").first<Record<string, unknown>>();
    expect(row).toMatchObject({
      id: "challenge-1",
      email: ALLOWLISTED,
      attempt_count: 0,
      consumed_at: null,
      expires_at: new Date(now + 10 * 60 * 1_000).toISOString(),
    });
    expect(row!.code_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.values(row!).some((value) => typeof value === "string" && value.includes(sent[0]!.code))).toBe(false);
  });

  it("answers the same for an unknown address without sending or storing anything", async () => {
    const response = await api(app(), "/auth/email/code", { method: "POST", body: JSON.stringify({ email: "stranger@example.test" }) });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(sent).toHaveLength(0);
    expect(await count("SELECT COUNT(*) AS total FROM email_login_codes")).toBe(0);
  });

  it("rejects malformed requests, other methods, queries and cross-origin writes", async () => {
    for (const body of ["{}", '{"email":1}', '{"email":"not-an-email"}', '{"email":"a@b.test","extra":1}', "[]", '"text"', "{"]) {
      const response = await api(app(), "/auth/email/code", { method: "POST", body });
      expect(response.status, body).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "EMAIL_LOGIN_REQUEST_INVALID" } });
    }
    const wrongMethod = await api(app(), "/auth/email/code");
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
    const query = await api(app(), "/auth/email/code?email=person@example.test", { method: "POST", body: JSON.stringify({ email: ALLOWLISTED }) });
    expect(query.status).toBe(400);
    const crossOrigin = await api(app(), "/auth/email/code", { method: "POST", body: JSON.stringify({ email: ALLOWLISTED }), origin: "https://attacker.example" });
    expect(crossOrigin.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("enforces the resend cooldown and the hourly ceiling", async () => {
    const request = () => api(app(), "/auth/email/code", { method: "POST", body: JSON.stringify({ email: ALLOWLISTED }) });
    expect((await request()).status).toBe(202);
    expect((await request()).status).toBe(202);
    expect(sent).toHaveLength(1);

    for (let index = 1; index <= 4; index += 1) {
      now += 61_000;
      expect((await request()).status).toBe(202);
      expect(sent, `send ${index + 1}`).toHaveLength(index + 1);
    }
    now += 61_000;
    expect((await request()).status).toBe(202);
    expect(sent).toHaveLength(5);
    expect(await count("SELECT COUNT(*) AS total FROM email_login_codes")).toBe(5);
  });

  it("creates an active contributor session for an allowlisted address outside the member table", async () => {
    await requestCode();
    const response = await verifyCode(ALLOWLISTED, sent[0]!.code);
    expect(response.status).toBe(200);
    const body = await response.json() as { member: { id: string; email: string; role: string } };
    expect(body.member).toMatchObject({ email: ALLOWLISTED, role: "contributor" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-memory-session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/u);
    const token = cookie.split(";", 1)[0]!.slice("__Host-memory-session=".length);

    const member = await env.DB.prepare("SELECT * FROM members WHERE email = ?").bind(ALLOWLISTED)
      .first<{ id: string; access_sub: string; role: string; status: string }>();
    expect(member).toMatchObject({ id: body.member.id, role: "contributor", status: "active" });
    expect(member!.access_sub).toMatch(/^code:[0-9a-f-]{36}$/u);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.login'")).toBe(1);

    const session = await api(app(), "/api/session", { token });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({ member: { id: body.member.id, email: ALLOWLISTED, role: "contributor" } });
  });

  it("uses the code once and refuses a replay", async () => {
    await requestCode();
    const first = await verifyCode(ALLOWLISTED, sent[0]!.code);
    expect(first.status).toBe(200);
    const replay = await verifyCode(ALLOWLISTED, sent[0]!.code);
    expect(replay.status).toBe(401);
    expect(replay.headers.get("set-cookie")).toBeNull();
    await expect(replay.json()).resolves.toMatchObject({ error: { code: "EMAIL_LOGIN_INVALID" } });
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'bootstrap-only@example.test'")).toBe(1);
  });

  it("counts mismatches and locks the challenge at five attempts", async () => {
    await requestCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await verifyCode(ALLOWLISTED, "999999");
      expect(response.status, `attempt ${attempt}`).toBe(401);
    }
    expect(await env.DB.prepare("SELECT attempt_count FROM email_login_codes").first()).toEqual({ attempt_count: 5 });
    expect((await verifyCode(ALLOWLISTED, sent[0]!.code)).status).toBe(401);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'bootstrap-only@example.test'")).toBe(0);
  });

  it("rejects an expired code without creating a member", async () => {
    await requestCode();
    now += 10 * 60 * 1_000 + 1;
    const response = await verifyCode(ALLOWLISTED, sent[0]!.code);
    expect(response.status).toBe(401);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'bootstrap-only@example.test'")).toBe(0);
  });

  it("only accepts a code for the same email", async () => {
    await requestCode();
    const response = await verifyCode("someone-else@example.test", sent[0]!.code);
    expect(response.status).toBe(401);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'someone-else@example.test'")).toBe(0);
  });

  it("signs in an existing administrator through the same flow", async () => {
    await requestCode(ADMIN_EMAIL);
    const response = await verifyCode(ADMIN_EMAIL, sent[0]!.code);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ member: { email: ADMIN_EMAIL, role: "admin" } });
  });

  it("refuses a disabled member and never emails that address", async () => {
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'email-admin'").run();
    const requested = await requestCode(ADMIN_EMAIL);
    expect(requested.status).toBe(202);
    expect(sent).toHaveLength(0);

    await env.DB.prepare("UPDATE members SET status = 'active' WHERE id = 'email-admin'").run();
    await requestCode(ADMIN_EMAIL);
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'email-admin'").run();
    const response = await verifyCode(ADMIN_EMAIL, sent[0]!.code);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MEMBER_DISABLED" } });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("lets an admin-issued invitation authorize a new address and marks it signed in", async () => {
    const token = await createAdminToken();
    const invited = "invited@example.test";
    expect((await api(app(), "/api/auth/providers")).status).toBe(200);
    const issued = await api(app(), "/api/admin/member-invitations", {
      token,
      method: "POST",
      body: JSON.stringify({ email: invited }),
    });
    expect(issued.status).toBe(201);
    const invitation = (await issued.json() as { invitation: { id: string } }).invitation;

    await requestCode(invited);
    expect(sent).toHaveLength(1);
    const response = await verifyCode(invited, sent[0]!.code);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ member: { email: invited, role: "contributor" } });
    expect(await env.DB.prepare("SELECT status, redeemed_at FROM member_login_invitations WHERE id = ?").bind(invitation.id).first())
      .toEqual({ status: "redeemed", redeemed_at: expect.any(String) });
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.code_login'")).toBe(1);

    now += 61_000;
    await requestCode(invited);
    expect(sent).toHaveLength(2);
    expect((await verifyCode(invited, sent[1]!.code)).status).toBe(200);
  });

  it("stops sending after the invitation is revoked and refuses a code issued before revocation", async () => {
    const token = await createAdminToken();
    const invited = "revoked-invite@example.test";
    const issued = await api(app(), "/api/admin/member-invitations", {
      token,
      method: "POST",
      body: JSON.stringify({ email: invited }),
    });
    const invitation = (await issued.json() as { invitation: { id: string } }).invitation;
    await requestCode(invited);
    expect(sent).toHaveLength(1);

    const revoked = await api(app(), `/api/admin/member-invitations/${invitation.id}/revoke`, { token, method: "POST" });
    expect(revoked.status).toBe(200);
    expect((await verifyCode(invited, sent[0]!.code)).status).toBe(401);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'revoked-invite@example.test'")).toBe(0);

    now += 61_000;
    await requestCode(invited);
    expect(sent).toHaveLength(1);
  });

  it("hides delivery failures behind a retryable 503 and invalidates the undelivered challenge", async () => {
    mailer.fail = true;
    const response = await requestCode(ALLOWLISTED);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EMAIL_LOGIN_DELIVERY_FAILED", retryable: true } });
    expect(sent).toHaveLength(0);
    expect(await env.DB.prepare("SELECT consumed_at FROM email_login_codes").first()).toEqual({ consumed_at: expect.any(String) });
  });

  it("reports the disabled provider when no mailer is configured", async () => {
    const disabled = createApp({ emailLogin: { mailer: null } });
    const request = await api(disabled, "/auth/email/code", { method: "POST", body: JSON.stringify({ email: ALLOWLISTED }) });
    expect(request.status).toBe(503);
    await expect(request.json()).resolves.toMatchObject({ error: { code: "EMAIL_LOGIN_UNAVAILABLE" } });
    const verify = await api(disabled, "/auth/email/code/verify", { method: "POST", body: JSON.stringify({ email: ALLOWLISTED, code: "100001" }) });
    expect(verify.status).toBe(503);
    const providers = await api(disabled, "/api/auth/providers");
    await expect(providers.json()).resolves.toMatchObject({ emailCode: false });
    const configured = await api(app(), "/api/auth/providers");
    await expect(configured.json()).resolves.toMatchObject({ emailCode: true });
  });

  it("lets exactly one of two simultaneous verifications win", async () => {
    await requestCode();
    const body = JSON.stringify({ email: ALLOWLISTED, code: sent[0]!.code });
    const responses = await Promise.all([
      api(app(), "/auth/email/code/verify", { method: "POST", body }),
      api(app(), "/auth/email/code/verify", { method: "POST", body }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(responses.filter((response) => response.headers.get("set-cookie") !== null)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS total FROM members WHERE email = 'bootstrap-only@example.test'")).toBe(1);
  });

  it("rejects malformed verification bodies and non-digit codes with the request error", async () => {
    for (const body of ["{}", '{"email":"a@b.test"}', '{"email":"a@b.test","code":"12345"}', '{"email":"a@b.test","code":"abcdef"}', '{"email":"a@b.test","code":"123456","extra":1}', "{"]) {
      const response = await api(app(), "/auth/email/code/verify", { method: "POST", body });
      expect(response.status, body).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "EMAIL_LOGIN_REQUEST_INVALID" } });
    }
    const wrongMethod = await api(app(), "/auth/email/code/verify");
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
  });

  async function requestCode(email = ALLOWLISTED): Promise<Response> {
    return api(app(), "/auth/email/code", { method: "POST", body: JSON.stringify({ email }) });
  }

  function verifyCode(email: string, code: string): Promise<Response> {
    return api(app(), "/auth/email/code/verify", { method: "POST", body: JSON.stringify({ email, code }) });
  }

  async function createAdminToken(): Promise<string> {
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    return (await sessions.create((await members.findById("email-admin"))!)).token;
  }
});

async function api(app: ExportedHandler<Env>, path: string, init: RequestInit & { token?: string; origin?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", init.origin ?? ORIGIN);
  if (init.token) headers.set("cookie", `__Host-memory-session=${init.token}`);
  const request = new Request(`${ORIGIN}${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await app.fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function count(sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<{ total: number }>();
  return row!.total;
}
