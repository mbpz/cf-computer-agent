/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDependencies } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const PASSWORD = "correct horse battery staple";
const NEXT_PASSWORD = "another correct horse battery";
const IP = "203.0.113.71";
const INVITATION = "ABCDEFGHJKLMNPQR";

describe("independent password recovery", () => {
  let now: number;
  let id: number;
  let audit: number;

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    now = Date.parse("2026-06-01T12:00:00.000Z");
    id = 0;
    audit = 0;
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('admin-1', 'admin-sub', 'admin@example.test', 'admin', 'active', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO invitations (id, code, kind, owner_member_id, bound_member_id, status, created_by_member_id, created_at, used_at)
       VALUES ('inv-1', ?, 'admin', NULL, NULL, 'unused', 'admin-1', '2026-06-01T00:00:00.000Z', NULL)`,
    ).bind(INVITATION).run();
  });

  function app(overrides: AppDependencies["passwordAuth"] = {}) {
    return createApp({
      passwordAuth: {
        now: () => new Date(now),
        id: () => `recovery-${++id}`,
        auditId: () => `audit-${++audit}`,
        recoveryLimit: 10,
        recoveryTtlMs: 30 * 60 * 1_000,
        ...overrides,
      },
    });
  }

  async function sessionFor(memberId: string): Promise<string> {
    const records = new MembersRepository(env.DB);
    const member = (await records.findById(memberId))!;
    return (await new SessionService(env.DB, records, { waitUntil: () => undefined }).create(member)).token;
  }

  async function api(path: string, options: { method?: string; body?: unknown; token?: string; origin?: string; ip?: string; app?: ReturnType<typeof app> } = {}): Promise<Response> {
    const method = options.method ?? "GET";
    const headers = new Headers({ origin: options.origin ?? ORIGIN, "cf-connecting-ip": options.ip ?? IP });
    if (options.body !== undefined || method === "POST") headers.set("content-type", "application/json");
    if (options.token) headers.set("cookie", `__Host-memory-session=${options.token}`);
    const request = new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const context = createExecutionContext();
    const response = await (options.app ?? app()).fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context);
    return response;
  }

  async function register(email: string): Promise<{ memberId: string; token: string }> {
    const response = await api("/auth/register", {
      method: "POST",
      body: { email, password: PASSWORD, invitationCode: INVITATION },
      app: app(),
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { member: { id: string } };
    return { memberId: body.member.id, token: (response.headers.get("set-cookie") ?? "").split(";", 1)[0]!.slice("__Host-memory-session=".length) };
  }

  async function issue(memberId: string, actorToken: string): Promise<{ code: string; formattedCode: string; expiresAt: string }> {
    const response = await api(`/api/admin/members/${memberId}/recovery-code`, { method: "POST", token: actorToken, app: app() });
    expect(response.status).toBe(201);
    return response.json() as Promise<{ code: string; formattedCode: string; expiresAt: string }>;
  }

  it("lets an administrator issue a one-time code that replaces the password and revokes sessions", async () => {
    const owner = await register("owner@example.test");
    const otherSession = await sessionFor(owner.memberId);
    const adminToken = await sessionFor("admin-1");
    const issued = await issue(owner.memberId, adminToken);
    expect(issued.code).toMatch(/^[A-HJ-NP-Z2-9]{20}$/u);
    expect(issued.formattedCode).toBe(issued.code.replace(/(.{4})(?=.)/gu, "$1-"));
    // Only the hash is stored; the issued plaintext never reaches the database.
    const stored = await env.DB.prepare("SELECT code_hash FROM password_recovery_codes WHERE member_id = ?").bind(owner.memberId).first<{ code_hash: string }>();
    expect(stored?.code_hash).toHaveLength(64);
    expect(stored?.code_hash).not.toContain(issued.code);

    const recovered = await api("/auth/password/recovery", {
      method: "POST",
      body: { email: "owner@example.test", password: NEXT_PASSWORD, recoveryCode: issued.formattedCode.toLowerCase() },
      app: app(),
    });
    expect(recovered.status).toBe(204);
    expect((await api("/auth/password", { method: "POST", body: { email: "owner@example.test", password: PASSWORD }, app: app() })).status).toBe(401);
    expect((await api("/auth/password", { method: "POST", body: { email: "owner@example.test", password: NEXT_PASSWORD }, app: app() })).status).toBe(200);
    expect((await api("/api/session", { token: owner.token, app: app() })).status).toBe(401);
    expect((await api("/api/session", { token: otherSession, app: app() })).status).toBe(401);

    const replay = await api("/auth/password/recovery", {
      method: "POST",
      body: { email: "owner@example.test", password: "third correct horse battery", recoveryCode: issued.code },
      app: app(),
    });
    expect(replay.status).toBe(401);
    expect((await replay.json() as { error: { code: string } }).error.code).toBe("PASSWORD_RECOVERY_INVALID");
  });

  it("rejects a wrong, expired or registration invitation code and never accepts the old reset endpoint", async () => {
    const owner = await register("bounded@example.test");
    const adminToken = await sessionFor("admin-1");
    const issued = await issue(owner.memberId, adminToken);

    const invitationAttempt = await api("/auth/password/recovery", {
      method: "POST",
      body: { email: "bounded@example.test", password: NEXT_PASSWORD, recoveryCode: INVITATION },
      app: app(),
    });
    expect(invitationAttempt.status).toBe(401);

    const wrong = await api("/auth/password/recovery", {
      method: "POST",
      body: { email: "bounded@example.test", password: NEXT_PASSWORD, recoveryCode: issued.code.slice(0, 19) + (issued.code.endsWith("A") ? "B" : "A") },
      app: app(),
    });
    expect(wrong.status).toBe(401);

    now += 31 * 60 * 1_000;
    const expired = await api("/auth/password/recovery", {
      method: "POST",
      body: { email: "bounded@example.test", password: NEXT_PASSWORD, recoveryCode: issued.code },
      app: app(),
    });
    expect(expired.status).toBe(401);

    const old = await api("/auth/password/reset", {
      method: "POST",
      body: { email: "bounded@example.test", password: NEXT_PASSWORD, invitationCode: INVITATION },
      app: app(),
    });
    expect(old.status).toBe(410);
    expect((await old.json() as { error: { code: string } }).error.code).toBe("PASSWORD_RESET_DEPRECATED");
  });

  it("keeps recovery issuance administrator-only", async () => {
    const owner = await register("delegated@example.test");
    const response = await api(`/api/admin/members/${owner.memberId}/recovery-code`, { method: "POST", token: owner.token, app: app() });
    expect(response.status).toBe(403);
  });

  it("does not spend the new-account quota on rejected registrations", async () => {
    // Five rejected invitation attempts must not consume the five successful
    // registrations allowed per IP per hour.
    for (let index = 0; index < 5; index += 1) {
      const rejected = await api("/auth/register", {
        method: "POST",
        body: { email: `rejected-${index}@example.test`, password: PASSWORD, recoveryCode: undefined, invitationCode: "JKLMNPQRSTUVWXY2" },
        app: app(),
      });
      // A missing/unknown invitation shape is answered as invalid, never created.
      expect([400, 429]).toContain(rejected.status);
    }
    const secondInvitation = "JKLMNPQRSTUVWXY2";
    await env.DB.prepare(
      `INSERT INTO invitations (id, code, kind, owner_member_id, bound_member_id, status, created_by_member_id, created_at, used_at)
       VALUES ('inv-2', ?, 'admin', NULL, NULL, 'unused', 'admin-1', '2026-06-01T00:00:00.000Z', NULL)`,
    ).bind(secondInvitation).run();
    const accepted = await api("/auth/register", {
      method: "POST",
      body: { email: "accepted@example.test", password: PASSWORD, invitationCode: secondInvitation },
      app: app(),
    });
    expect(accepted.status).toBe(201);
    const attempts = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM password_registration_attempts WHERE member_id IS NOT NULL",
    ).first<{ total: number }>();
    expect(attempts?.total).toBe(1);
  });
});
