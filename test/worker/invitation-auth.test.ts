/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
const PASSWORD = "correct horse battery staple";
const IP = "203.0.113.50";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/u;
const FORMATTED_PATTERN = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/u;

type ApiInvitation = {
  id: string;
  code: string;
  formattedCode: string;
  kind: string;
  status: string;
  ownerMemberId: string | null;
  ownerEmail: string | null;
  boundMemberId: string | null;
  boundEmail: string | null;
  createdAt: string;
  usedAt: string | null;
};

describe("invitation registration, binding and administration", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
  });

  it("registers exactly one member from an administrator generated code", async () => {
    const admin = await adminToken();
    const [invitation] = await generateAdmin(admin.token);
    expect(invitation).toMatchObject({
      kind: "admin",
      status: "unused",
      ownerMemberId: null,
      ownerEmail: null,
      boundMemberId: null,
      boundEmail: null,
      usedAt: null,
    });
    expect(invitation!.code).toMatch(CODE_PATTERN);
    expect(invitation!.formattedCode).toMatch(FORMATTED_PATTERN);
    expect(invitation!.formattedCode.replaceAll("-", "")).toBe(invitation!.code);
    const row = await env.DB.prepare("SELECT kind, created_by_member_id, status FROM invitations WHERE code = ?")
      .bind(invitation!.code).first();
    expect(row).toEqual({ kind: "admin", created_by_member_id: admin.memberId, status: "unused" });

    const member = await register("admin-code@example.test", invitation!.code);
    expect(member.memberId).toHaveLength(36);
    const members = await env.DB.prepare("SELECT role, status FROM members WHERE id = ?").bind(member.memberId).first();
    expect(members).toEqual({ role: "contributor", status: "active" });
    expect(await invitationRow(invitation!.code)).toMatchObject({ status: "used", bound_member_id: member.memberId });

    const list = await api("/api/admin/invitations", { token: admin.token });
    expect(list.status).toBe(200);
    const body = await list.json() as { items: ApiInvitation[]; pagination: unknown };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: invitation!.id,
      code: invitation!.code,
      kind: "admin",
      status: "used",
      ownerEmail: null,
      boundEmail: "admin-code@example.test",
    });
    expect(body.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });

    // A second registration with the consumed code creates no member.
    const reuse = await api("/auth/register", {
      method: "POST",
      body: { email: "reuse@example.test", password: PASSWORD, invitationCode: invitation!.code },
    });
    expect(reuse.status).toBe(400);
    await expect(reuse.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_INVITATION_INVALID" } });
    expect(await memberCount()).toBe(1);
  });

  it("gives a member one lifetime sharing code that creates one member and freezes as used", async () => {
    const admin = await adminToken();
    const [adminCode] = await generateAdmin(admin.token);
    const owner = await register("sharer@example.test", adminCode!.code);

    const before = await api("/api/invitations/mine", { token: owner.token });
    expect(before.status).toBe(200);
    const beforeBody = await before.json() as { boundInvitation: { code: string; kind: string } | null; invitation: unknown };
    expect(beforeBody.invitation).toBeNull();
    expect(beforeBody.boundInvitation).toMatchObject({ code: adminCode!.code, kind: "admin" });
    const first = await api("/api/invitations/mine", { method: "POST", token: owner.token });
    expect(first.status).toBe(201);
    const created = await first.json() as { invitation: { code: string; formattedCode: string; status: string; createdAt: string; usedAt: string | null; bound: boolean; boundEmail: string | null } };
    expect(created.invitation).toMatchObject({ status: "unused", bound: false, boundEmail: null, usedAt: null });
    expect(created.invitation.code).toMatch(CODE_PATTERN);
    expect(created.invitation.formattedCode).toBe(grouped(created.invitation.code));
    const stored = await env.DB.prepare("SELECT kind, owner_member_id, created_by_member_id, status FROM invitations WHERE code = ?")
      .bind(created.invitation.code).first();
    expect(stored).toEqual({ kind: "member", owner_member_id: owner.memberId, created_by_member_id: owner.memberId, status: "unused" });

    const read = await api("/api/invitations/mine", { token: owner.token });
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({ boundInvitation: { code: adminCode!.code }, invitation: { code: created.invitation.code, status: "unused", bound: false, boundEmail: null } });
    const second = await api("/api/invitations/mine", { method: "POST", token: owner.token });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ invitation: { code: created.invitation.code, status: "unused", bound: false } });

    const shared = await register("shared@example.test", created.invitation.formattedCode.toLowerCase());
    expect(shared.memberId).not.toBe(owner.memberId);
    expect(await invitationRow(created.invitation.code)).toMatchObject({ status: "used", bound_member_id: shared.memberId });

    const afterUse = await api("/api/invitations/mine", { method: "POST", token: owner.token });
    expect(afterUse.status).toBe(200);
    await expect(afterUse.json()).resolves.toMatchObject({
      boundInvitation: { code: adminCode!.code, kind: "admin" },
      invitation: { code: created.invitation.code, status: "used", bound: true, usedAt: expect.any(String), boundEmail: "shared@example.test" },
    });
    expect(await count("SELECT COUNT(*) AS total FROM invitations WHERE owner_member_id = ?", owner.memberId)).toBe(1);
    expect((await api("/auth/register", {
      method: "POST",
      body: { email: "third@example.test", password: PASSWORD, invitationCode: created.invitation.code },
    })).status).toBe(400);
    expect(await memberCount()).toBe(2);

    const memberOnly = await api("/api/admin/invitations?kind=member", { token: admin.token });
    const memberOnlyBody = await memberOnly.json() as { items: ApiInvitation[]; pagination: { total: number } };
    expect(memberOnlyBody.pagination.total).toBe(1);
    expect(memberOnlyBody.items[0]).toMatchObject({
      code: created.invitation.code,
      kind: "member",
      status: "used",
      ownerEmail: "sharer@example.test",
      boundEmail: "shared@example.test",
    });
  });

  it("keeps exactly one code per member under concurrent first requests", async () => {
    const admin = await adminToken();
    const [adminCode] = await generateAdmin(admin.token);
    const owner = await register("concurrent-mine@example.test", adminCode!.code);

    const responses = await Promise.all([
      api("/api/invitations/mine", { method: "POST", token: owner.token }),
      api("/api/invitations/mine", { method: "POST", token: owner.token }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<{ invitation: { code: string } }>));
    expect(bodies[0]!.invitation.code).toBe(bodies[1]!.invitation.code);
    expect(await count("SELECT COUNT(*) AS total FROM invitations WHERE owner_member_id = ?", owner.memberId)).toBe(1);
  });

  it("returns the invitation-fission forest to administrators only", async () => {
    const admin = await adminToken();
    const [adminCode] = await generateAdmin(admin.token);
    const owner = await register("forest-owner@example.test", adminCode!.code);
    const created = await api("/api/invitations/mine", { method: "POST", token: owner.token });
    expect(created.status).toBe(201);
    const ownerCode = (await created.json() as { invitation: { code: string } }).invitation.code;
    const invitee = await register("forest-invitee@example.test", ownerCode);

    const network = await api("/api/admin/invitations/network", { token: admin.token });
    expect(network.status).toBe(200);
    const body = await network.json() as {
      nodes: Array<{ id: string; email: string; inviterId: string | null; invitation: { backfilled: boolean } | null }>;
      stats: { members: number; invited: number; roots: number; maxDepth: number };
    };
    expect(body.nodes).toHaveLength(3);
    const adminNode = body.nodes.find((node) => node.id === admin.memberId)!;
    const ownerNode = body.nodes.find((node) => node.id === owner.memberId)!;
    const inviteeNode = body.nodes.find((node) => node.id === invitee.memberId)!;
    expect(adminNode).toMatchObject({ inviterId: null, invitation: null });
    expect(ownerNode.inviterId).toBe(admin.memberId);
    expect(inviteeNode.inviterId).toBe(owner.memberId);
    expect(body.stats).toEqual({ members: 3, invited: 2, roots: 1, maxDepth: 2 });
    expect((await api("/api/admin/invitations/network", { token: owner.token })).status).toBe(403);
    expect((await api("/api/admin/invitations/network", { method: "POST", token: admin.token })).status).toBe(405);
  });

  it("lets exactly one concurrent registration for the same code create a member", async () => {
    const admin = await adminToken();
    const [invitation] = await generateAdmin(admin.token);
    const body = (email: string) => ({ email, password: PASSWORD, invitationCode: invitation!.code });
    const responses = await Promise.all([
      api("/auth/register", { method: "POST", body: body("race-a@example.test") }),
      api("/auth/register", { method: "POST", body: body("race-b@example.test") }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    const rejected = responses.find((response) => response.status === 400)!;
    await expect(rejected.json()).resolves.toMatchObject({ error: { code: "REGISTRATION_INVITATION_INVALID" } });
    expect(await memberCount()).toBe(1);
    const winner = await env.DB.prepare("SELECT id, email FROM members WHERE role = 'contributor'").first<{ id: string; email: string }>();
    expect(await invitationRow(invitation!.code)).toMatchObject({ status: "used", bound_member_id: winner!.id });
    const loserEmail = winner!.email === "race-a@example.test" ? "race-b@example.test" : "race-a@example.test";
    expect(await env.DB.prepare("SELECT id FROM members WHERE email = ?").bind(loserEmail).first()).toBeNull();
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.login'")).toBe(1);
  });

  it("never creates a member or spends a code for unknown, used, missing or malformed codes", async () => {
    const admin = await adminToken();
    const [usedInvitation, unusedInvitation, spare] = await generateAdmin(admin.token, 3);
    const owner = await register("known@example.test", usedInvitation!.code);

    const cases: Array<[unknown, string]> = [
      [{ email: "unknown-code@example.test", password: PASSWORD, invitationCode: "ABCDEFGHJKLMNPQR" }, "REGISTRATION_INVITATION_INVALID"],
      [{ email: "unknown-code@example.test", password: PASSWORD, invitationCode: usedInvitation!.code }, "REGISTRATION_INVITATION_INVALID"],
      [{ email: "unknown-code@example.test", password: PASSWORD, invitationCode: "ABCD" }, "REGISTRATION_INVITATION_INVALID"],
      [{ email: "unknown-code@example.test", password: PASSWORD, invitationCode: 42 }, "REGISTRATION_INVITATION_INVALID"],
      [{ email: "unknown-code@example.test", password: PASSWORD }, "REGISTRATION_INVITATION_REQUIRED"],
      [{ email: "unknown-code@example.test", password: PASSWORD, invitationCode: "  " }, "REGISTRATION_INVITATION_REQUIRED"],
    ];
    for (const [body, code] of cases) {
      const response = await api("/auth/register", { method: "POST", body });
      expect(response.status, JSON.stringify(body)).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code } });
    }
    expect(await memberCount()).toBe(1);

    // A rejected weak password or a taken email must not spend a valid code.
    expect((await api("/auth/register", {
      method: "POST",
      body: { email: "weak@example.test", password: "short", invitationCode: unusedInvitation!.code },
    })).status).toBe(400);
    expect((await api("/auth/register", {
      method: "POST",
      body: { email: "known@example.test", password: PASSWORD, invitationCode: spare!.code },
    })).status).toBe(409);
    expect(await invitationRow(unusedInvitation!.code)).toMatchObject({ status: "unused" });
    expect(await invitationRow(spare!.code)).toMatchObject({ status: "unused" });
    expect(await invitationRow(usedInvitation!.code)).toMatchObject({ status: "used", bound_member_id: owner.memberId });
    expect(await memberCount()).toBe(1);
  });

  it("requires an active member and a same-origin POST for its own invitation", async () => {
    expect((await api("/api/invitations/mine")).status).toBe(401);
    expect((await api("/api/invitations/mine", { method: "POST" })).status).toBe(401);

    const admin = await adminToken();
    const [invitation] = await generateAdmin(admin.token);
    const member = await register("mine-boundary@example.test", invitation!.code);

    // Reading is a GET and creates nothing; creation stays POST.
    const read = await api("/api/invitations/mine", { token: member.token });
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({ boundInvitation: { code: invitation!.code }, invitation: null });
    const methodNotAllowed = await api("/api/invitations/mine", { method: "PUT", token: member.token });
    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get("allow")).toBe("GET, POST");
    expect((await api("/api/invitations/mine?x=1", { method: "POST", token: member.token })).status).toBe(400);
    expect((await api("/api/invitations/mine", { method: "POST", token: member.token, origin: "https://attacker.example" })).status).toBe(403);

    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(member.memberId).run();
    expect((await api("/api/invitations/mine", { token: member.token })).status).toBe(403);
    expect((await api("/api/invitations/mine", { method: "POST", token: member.token })).status).toBe(403);
  });

  it("resets a password only with the invitation code that bound the member", async () => {
    const admin = await adminToken();
    const [invitation, otherUnused] = await generateAdmin(admin.token, 2);
    const member = await register("reset-binding@example.test", invitation!.code);

    // The retired one-time-code identity has no bound invitation.
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('legacy-code-user', 'code:legacy', 'legacy@example.test', 'contributor', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();

    for (const input of [
      { email: "reset-binding@example.test", password: "a brand new password", invitationCode: otherUnused!.code },
      { email: "reset-binding@example.test", password: "a brand new password" },
      { email: "reset-binding@example.test", password: "a brand new password", invitationCode: "ABCD" },
      { email: "unknown@example.test", password: "a brand new password", invitationCode: invitation!.code },
      { email: "legacy@example.test", password: "a brand new password", invitationCode: invitation!.code },
    ]) {
      const response = await api("/auth/password/reset", { method: "POST", body: input });
      expect(response.status, JSON.stringify(input)).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "PASSWORD_RESET_INVALID" } });
    }

    const reset = await api("/auth/password/reset", {
      method: "POST",
      body: { email: "reset-binding@example.test", password: "a brand new password", invitationCode: grouped(invitation!.code) },
    });
    expect(reset.status).toBe(204);
    expect((await api("/api/session", { token: member.token })).status).toBe(401);
    expect((await api("/auth/password", {
      method: "POST",
      body: { email: "reset-binding@example.test", password: PASSWORD },
    })).status).toBe(401);
    expect((await api("/auth/password", {
      method: "POST",
      body: { email: "reset-binding@example.test", password: "a brand new password" },
    })).status).toBe(200);

    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(member.memberId).run();
    const disabled = await api("/auth/password/reset", {
      method: "POST",
      body: { email: "reset-binding@example.test", password: "another password value", invitationCode: invitation!.code },
    });
    expect(disabled.status).toBe(401);
    expect(await count("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'member.password_reset'")).toBe(1);
  });

  it("restricts invitation administration to administrators and validates its queries", async () => {
    expect((await api("/api/admin/invitations")).status).toBe(401);
    expect((await api("/api/admin/invitations", { method: "POST", body: {} })).status).toBe(401);

    const admin = await adminToken();
    const [invitation] = await generateAdmin(admin.token);
    const contributor = await register("not-admin@example.test", invitation!.code);
    expect((await api("/api/admin/invitations", { token: contributor.token })).status).toBe(403);
    expect((await api("/api/admin/invitations", { method: "POST", body: {}, token: contributor.token })).status).toBe(403);

    for (const body of [{ count: 0 }, { count: 21 }, { count: "2" }, { count: 1.5 }]) {
      const response = await api("/api/admin/invitations", { method: "POST", body, token: admin.token });
      expect(response.status, JSON.stringify(body)).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "INVITATION_REQUEST_INVALID" } });
    }
    expect((await api("/api/admin/invitations", { method: "POST", body: { count: 2 }, token: admin.token })).status).toBe(201);
    // An absent body defaults to one code.
    expect((await api("/api/admin/invitations", { method: "POST", token: admin.token })).status).toBe(201);

    for (const path of [
      "/api/admin/invitations?page=0",
      "/api/admin/invitations?pageSize=10",
      "/api/admin/invitations?cursor=old",
      "/api/admin/invitations?unknown=1",
      "/api/admin/invitations?kind=bogus",
      "/api/admin/invitations?status=bogus",
      "/api/admin/invitations?kind=admin&kind=admin",
    ]) {
      const response = await api(path, { token: admin.token });
      expect(response.status, path).toBe(400);
    }

    const wrongMethod = await api("/api/admin/invitations", { method: "DELETE", token: admin.token });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("GET, POST");
    expect((await api("/api/admin/invitations", {
      method: "POST",
      body: { count: 1 },
      token: admin.token,
      origin: "https://attacker.example",
    })).status).toBe(403);
  });

  it("paginates and filters invitation rows by number", async () => {
    const admin = await adminToken();
    const generated = await generateAdmin(admin.token, 20);
    expect(generated).toHaveLength(20);
    const extra = await generateAdmin(admin.token, 1);
    const firstPage = await api("/api/admin/invitations?page=1&pageSize=20", { token: admin.token });
    const secondPage = await api("/api/admin/invitations?page=2&pageSize=20", { token: admin.token });
    const firstBody = await firstPage.json() as { items: ApiInvitation[]; pagination: unknown };
    const secondBody = await secondPage.json() as { items: ApiInvitation[]; pagination: unknown };
    expect(firstBody.items).toHaveLength(20);
    expect(secondBody.items).toHaveLength(1);
    // Created in the same millisecond, so the page order is by (created_at, id):
    // every generated invitation appears on exactly one of the two pages.
    const paged = new Set([...firstBody.items, ...secondBody.items].map((item) => item.id));
    expect(paged).toEqual(new Set([...generated, ...extra].map((item) => item.id)));
    expect(firstBody.pagination).toEqual({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    expect(secondBody.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });

    const unused = await api("/api/admin/invitations?status=unused&page=1&pageSize=20", { token: admin.token });
    const unusedBody = await unused.json() as { pagination: { total: number } };
    expect(unusedBody.pagination.total).toBe(21);
    const kindFilter = await api("/api/admin/invitations?kind=member", { token: admin.token });
    const kindBody = await kindFilter.json() as { pagination: { total: number } };
    expect(kindBody.pagination.total).toBe(0);
  });

  async function adminToken(): Promise<{ token: string; memberId: string }> {
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('admin-1', 'admin-sub', 'admin@example.test', 'admin', 'active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    const records = new MembersRepository(env.DB);
    const member = (await records.findById("admin-1"))!;
    const { token } = await new SessionService(env.DB, records, { waitUntil: () => undefined }).create(member);
    return { token, memberId: member.id };
  }

  async function generateAdmin(token: string, count = 1): Promise<ApiInvitation[]> {
    const response = await api("/api/admin/invitations", { method: "POST", body: { count }, token });
    expect(response.status).toBe(201);
    const body = await response.json() as { invitations: ApiInvitation[] };
    return body.invitations;
  }

  async function register(email: string, invitationCode: string, ip = IP): Promise<{ token: string; memberId: string }> {
    const response = await api("/auth/register", {
      method: "POST",
      body: { email, password: PASSWORD, invitationCode },
      ip,
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { member: { id: string } };
    return { token: tokenFrom(response), memberId: body.member.id };
  }
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

async function invitationRow(code: string): Promise<{ status: string; bound_member_id: string | null } | null> {
  return env.DB.prepare("SELECT status, bound_member_id FROM invitations WHERE code = ?").bind(code).first();
}

async function memberCount(): Promise<number> {
  return count("SELECT COUNT(*) AS total FROM members WHERE role = 'contributor'");
}

async function count(sql: string, binding?: string): Promise<number> {
  const statement = binding === undefined ? env.DB.prepare(sql) : env.DB.prepare(sql).bind(binding);
  const row = await statement.first<{ total: number }>();
  return row!.total;
}

function grouped(code: string): string {
  return code.match(/.{1,4}/gu)!.join("-");
}
