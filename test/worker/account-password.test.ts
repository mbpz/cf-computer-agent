/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const PASSWORD = "correct horse battery staple";
const NEXT_PASSWORD = "another correct horse battery";
const IP = "203.0.113.60";

describe("authenticated password change", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('github-user', 'github:101', 'existing@example.test', 'contributor', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
  });

  async function adminToken(): Promise<string> {
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('admin-1', 'admin-sub', 'admin@example.test', 'admin', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    const records = new MembersRepository(env.DB);
    const member = (await records.findById("admin-1"))!;
    return (await new SessionService(env.DB, records, { waitUntil: () => undefined }).create(member)).token;
  }

  async function register(token: string, email: string): Promise<{ token: string; memberId: string }> {
    const generated = await api("/api/admin/invitations", { method: "POST", body: { count: 1 }, token });
    expect(generated.status).toBe(201);
    const invitation = (await generated.json() as { invitations: Array<{ code: string }> }).invitations[0]!;
    const response = await api("/auth/register", {
      method: "POST",
      body: { email, password: PASSWORD, invitationCode: invitation.code },
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { member: { id: string } };
    return { token: tokenFrom(response), memberId: body.member.id };
  }

  async function additionalSession(memberId: string): Promise<string> {
    const records = new MembersRepository(env.DB);
    const member = (await records.findById(memberId))!;
    return (await new SessionService(env.DB, records, { waitUntil: () => undefined }).create(member)).token;
  }

  it("lets a password account change its password, revokes other sessions and keeps the caller signed in", async () => {
    const admin = await adminToken();
    const owner = await register(admin, "owner@example.test");
    const other = await additionalSession(owner.memberId);

    const changed = await api("/api/account/password", {
      method: "POST",
      token: owner.token,
      body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD },
    });
    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toEqual({ changed: true });

    expect((await api("/api/session", { token: owner.token })).status).toBe(200);
    expect((await api("/api/session", { token: other })).status).toBe(401);
    expect((await api("/auth/password", { method: "POST", body: { email: "owner@example.test", password: PASSWORD } })).status).toBe(401);
    expect((await api("/auth/password", { method: "POST", body: { email: "owner@example.test", password: NEXT_PASSWORD } })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.password_reset'")).toBe(1);
  });

  it("rejects a wrong or missing current password, weak passwords, extra keys and a denied origin", async () => {
    const admin = await adminToken();
    const owner = await register(admin, "bounded@example.test");

    const wrong = await api("/api/account/password", {
      method: "POST", token: owner.token, body: { currentPassword: "not the password", newPassword: NEXT_PASSWORD },
    });
    expect(wrong.status).toBe(401);
    expect((await wrong.json() as { error: { code: string } }).error.code).toBe("PASSWORD_CHANGE_INVALID");

    const missing = await api("/api/account/password", {
      method: "POST", token: owner.token, body: { newPassword: NEXT_PASSWORD },
    });
    expect(missing.status).toBe(401);

    expect((await api("/api/account/password", {
      method: "POST", token: owner.token, body: { currentPassword: PASSWORD, newPassword: "short" },
    })).status).toBe(400);
    expect((await api("/api/account/password", {
      method: "POST", token: owner.token, body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD, extra: true },
    })).status).toBe(400);
    expect((await api("/api/account/password", {
      method: "POST", token: owner.token, origin: "https://attacker.example", body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD },
    })).status).toBe(403);
    expect((await api("/api/account/password", { method: "POST", body: { newPassword: NEXT_PASSWORD } })).status).toBe(401);
    expect((await api("/api/account/password", { token: owner.token })).status).toBe(405);
  });

  it("backfills a bound reset invitation for password accounts created before invitations", async () => {
    await reset();
    const backfill = "0080_backfill_password_invitations.sql";
    await applyD1Migrations(env.DB, MIGRATIONS.filter((migration) => migration.name !== backfill));
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at, password_hash) VALUES
       ('legacy-password', 'password:legacy', 'legacy-password@example.test', 'contributor', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', 'pbkdf2-sha256$100000$c2FsdA$aGFzaA'),
       ('legacy-github', 'github:202', 'legacy-github@example.test', 'contributor', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', NULL)`,
    ).run();
    await applyD1Migrations(env.DB, MIGRATIONS.filter((migration) => migration.name === backfill));

    const row = await env.DB.prepare(
      `SELECT kind, code, status, bound_member_id, created_by_member_id, used_at FROM invitations WHERE bound_member_id = 'legacy-password'`,
    ).first<{ kind: string; code: string; status: string; bound_member_id: string; created_by_member_id: string; used_at: string }>();
    expect(row).toMatchObject({ kind: "admin", status: "used", bound_member_id: "legacy-password", created_by_member_id: "legacy-password" });
    expect(row!.code).toMatch(/^[A-HJ-NP-Z2-9]{16}$/u);
    expect(row!.used_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
    expect(await count("SELECT COUNT(*) AS total FROM invitations WHERE bound_member_id = 'legacy-github'")).toBe(0);
  });

  it("lets a member without a password set a first password from a live session", async () => {
    const records = new MembersRepository(env.DB);
    const member = (await records.findById("github-user"))!;
    const token = (await new SessionService(env.DB, records, { waitUntil: () => undefined }).create(member)).token;

    const set = await api("/api/account/password", {
      method: "POST", token, body: { newPassword: NEXT_PASSWORD },
    });
    expect(set.status).toBe(200);
    const row = await env.DB.prepare("SELECT password_hash FROM members WHERE id = ?").bind("github-user").first<{ password_hash: string }>();
    expect(row?.password_hash).toMatch(/^pbkdf2-sha256\$100000\$/u);
    expect((await api("/auth/password", { method: "POST", body: { email: "existing@example.test", password: NEXT_PASSWORD } })).status).toBe(200);
  });
});

async function api(
  path: string,
  options: { method?: string; body?: unknown; token?: string; origin?: string; ip?: string } = {},
): Promise<Response> {
  const method = options.method ?? "GET";
  const headers = new Headers({
    origin: options.origin ?? ORIGIN,
    "cf-connecting-ip": options.ip ?? IP,
  });
  if (options.body !== undefined || method === "POST") headers.set("content-type", "application/json");
  if (options.token) headers.set("cookie", `__Host-memory-session=${options.token}`);
  const request = new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: typeof options.body === "string" ? options.body : JSON.stringify(options.body) }),
  });
  const context = createExecutionContext();
  const response = await createApp().fetch!(
    request as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    context,
  );
  await waitOnExecutionContext(context);
  return response;
}

function tokenFrom(response: Response): string {
  const cookie = response.headers.get("set-cookie") ?? "";
  return cookie.split(";", 1)[0]!.slice("__Host-memory-session=".length);
}

async function count(sql: string, binding?: string): Promise<number> {
  const statement = binding === undefined ? env.DB.prepare(sql) : env.DB.prepare(sql).bind(binding);
  const row = await statement.first<{ total: number }>();
  return row!.total;
}
