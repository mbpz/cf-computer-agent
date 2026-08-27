/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

describe("admin roles API", () => {
  let admin = "";
  let contributor = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('role-admin', 'subject-role-admin', 'role-admin@example.test', 'admin', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
       ('role-contributor', 'subject-role-contributor', 'role-contributor@example.test', 'contributor', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
    ).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date("2026-08-26T00:00:00.000Z") });
    admin = (await sessions.create((await members.findById("role-admin"))!)).token;
    contributor = (await sessions.create((await members.findById("role-contributor"))!)).token;
    await env.DB.prepare("INSERT INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at) VALUES ('role-editor', 'editor', 'Editor', '', '0x4003', 'active', 0, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')").run();
  });

  it("lists roles for administrators and rejects contributors", async () => {
    const allowed = await api("/api/admin/roles", admin);
    expect(allowed.status).toBe(200);
    const payload = await allowed.json() as { items: Array<{ key: string; allowBits: string }> };
    expect(payload.items.some((item) => item.key === "admin" && item.allowBits === "0x7ffff")).toBe(true);
    expect(payload.items.some((item) => item.key === "editor" && item.allowBits === "0x4003")).toBe(true);
    const denied = await api("/api/admin/roles", contributor);
    expect(denied.status).toBe(403);
  });

  it("updates a custom role mask and rejects malformed input", async () => {
    const updated = await api("/api/admin/roles/role-editor", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x4001" }) });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ role: { key: "editor", allowBits: "0x4001" } });
    const malformed = await api("/api/admin/roles/role-editor", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x-1" }) });
    expect(malformed.status).toBe(400);
  });

  it("creates and deletes unassigned custom roles while protecting duplicates", async () => {
    const created = await api("/api/admin/roles", admin, { method: "POST", body: JSON.stringify({ key: "reviewer", name: "Reviewer", allowBits: "0x9" }) });
    expect(created.status).toBe(201);
    const role = (await created.json() as { role: { id: string } }).role;
    expect((await api("/api/admin/roles", admin, { method: "POST", body: JSON.stringify({ key: "reviewer", name: "Again", allowBits: "0x1" }) })).status).toBe(409);
    expect((await api(`/api/admin/roles/${role.id}`, admin, { method: "DELETE" })).status).toBe(200);
    expect((await api("/api/admin/roles/role-admin", admin, { method: "DELETE" })).status).toBe(409);
  });

  it("assigns custom roles and projects the effective mask into the session", async () => {
    const assigned = await api("/api/admin/roles/role-editor/members", admin, {
      method: "POST",
      body: JSON.stringify({ memberId: "role-contributor" }),
    });
    expect(assigned.status).toBe(200);
    const session = await api("/api/session", contributor);
    await expect(session.json()).resolves.toMatchObject({ permissionMask: "0x640c3" });
    const duplicate = await api("/api/admin/roles/role-editor/members", admin, {
      method: "POST",
      body: JSON.stringify({ memberId: "role-contributor" }),
    });
    expect(duplicate.status).toBe(409);
    const removed = await api("/api/admin/roles/role-editor/members", admin, {
      method: "DELETE",
      body: JSON.stringify({ memberId: "role-contributor" }),
    });
    expect(removed.status).toBe(200);
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("cookie", `__Host-memory-session=${token}`);
  const request = new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
