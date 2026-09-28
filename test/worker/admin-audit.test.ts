/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

describe("numbered admin audit and members routes", () => {
  let admin = "";

  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('admin', 'admin-sub', 'admin@example.test', 'admin', 'active', ?, ?)").bind("2026-08-28T00:00:00.000Z", "2026-08-28T00:00:00.000Z").run();
    const members = new MembersRepository(env.DB);
    admin = (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findById("admin"))!)).token;
  });

  it("returns filtered audit pages with stable timestamp and id ordering", async () => {
    const values = Array.from({ length: 21 }, (_, index) => `('audit-${String(index).padStart(2, "0")}', 'system', NULL, 'member.login', 'member', NULL, '{"role":"contributor"}', '2026-08-28T12:00:00.000Z')`).join(",");
    await env.DB.prepare(`INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES ${values}`).run();
    const first = await api("/api/admin/audit-events?action=member.login&page=1&pageSize=20");
    const second = await api("/api/admin/audit-events?action=member.login&page=2&pageSize=20");
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    const firstBody = await first.json() as { items: Array<{ id: string }>; pagination: unknown };
    const secondBody = await second.json() as { items: Array<{ id: string }>; pagination: unknown };
    expect(firstBody.items[0]?.id).toBe("audit-20");
    expect(secondBody.items).toEqual([{ id: "audit-00", actorKind: "system", actorId: null, action: "member.login", resourceType: "member", resourceId: null, metadata: { role: "contributor" }, createdAt: "2026-08-28T12:00:00.000Z" }]);
    expect(secondBody.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
    expect(new Set([...firstBody.items, ...secondBody.items].map((item) => item.id))).toHaveLength(21);
  });

  it("strictly rejects duplicate, cursor, unknown and over-window queries", async () => {
    for (const path of [
      "/api/admin/audit-events?action=member.login&action=member.login",
      "/api/admin/audit-events?cursor=old",
      "/api/admin/audit-events?unknown=1",
      "/api/admin/audit-events?page=101&pageSize=100",
      "/api/admin/members?status=active&status=active",
      "/api/admin/members?cursor=old",
      "/api/admin/members?unknown=1",
      "/api/admin/members?page=101&pageSize=100",
    ]) expect((await api(path)).status).toBe(400);
  });

  it("updates a contributor through HTTP, returns its receipt and projects status-filtered reads", async () => {
    await seedContributor();
    const disabled = await api("/api/admin/members/contributor/status", { status: "disabled" });
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({ member: { id: "contributor", role: "contributor", status: "disabled" } });
    expect(await (await api("/api/admin/members?status=disabled")).json()).toMatchObject({ items: [{ id: "contributor", status: "disabled" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    const enabled = await api("/api/admin/members/contributor/status", { status: "active" });
    expect(enabled.status).toBe(200);
    expect(await enabled.json()).toMatchObject({ member: { id: "contributor", role: "contributor", status: "active" } });
    expect(await (await api("/api/admin/members?status=disabled")).json()).toMatchObject({ items: [], pagination: { total: 0, totalPages: 0 } });
    const events = await env.DB.prepare("SELECT actor_id, resource_id, metadata FROM audit_events WHERE action = 'member.status_updated' ORDER BY rowid").all();
    expect(events.results).toEqual([
      { actor_id: "admin", resource_id: "contributor", metadata: '{"previousStatus":"active","newStatus":"disabled"}' },
      { actor_id: "admin", resource_id: "contributor", metadata: '{"previousStatus":"disabled","newStatus":"active"}' },
    ]);
  });

  it("keeps repeated explicit status assignments state-idempotent without claiming an exactly-once audit", async () => {
    await seedContributor();
    expect((await api("/api/admin/members/contributor/status", { status: "disabled" })).status).toBe(200);
    expect((await api("/api/admin/members/contributor/status", { status: "disabled" })).status).toBe(200);
    expect(await new MembersRepository(env.DB).findById("contributor")).toMatchObject({ status: "disabled" });
    const events = await env.DB.prepare("SELECT metadata FROM audit_events WHERE action = 'member.status_updated' ORDER BY rowid").all();
    // Existing HTTP contract has no persisted request identity. Recovery must not
    // silently replay PATCH and misrepresent these two audits as exactly once.
    expect(events.results).toEqual([
      { metadata: '{"previousStatus":"active","newStatus":"disabled"}' },
      { metadata: '{"previousStatus":"disabled","newStatus":"disabled"}' },
    ]);
  });

  it("protects administrator rows and rejects invalid status or missing targets without a write audit", async () => {
    await seedContributor();
    expect((await api("/api/admin/members/admin/status", { status: "disabled" })).status).toBe(403);
    expect((await api("/api/admin/members/contributor/status", { status: "unknown" })).status).toBe(400);
    expect((await api("/api/admin/members/missing/status", { status: "disabled" })).status).toBe(404);
    expect(await new MembersRepository(env.DB).findById("admin")).toMatchObject({ status: "active" });
    expect(await new MembersRepository(env.DB).findById("contributor")).toMatchObject({ status: "active" });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE action = 'member.status_updated'").all()).results).toEqual([]);
  });

  it.each(["contributor", "disabled admin"])("rejects member reads and status writes by a %s", async (actor) => {
    await seedContributor();
    const repository = new MembersRepository(env.DB);
    if (actor === "contributor") admin = (await new SessionService(env.DB, repository, { waitUntil: () => undefined }).create((await repository.findById("contributor"))!)).token;
    else await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'admin'").run();
    expect((await api("/api/admin/members")).status).toBe(403);
    expect((await api("/api/admin/members/contributor/status", { status: "disabled" })).status).toBe(403);
    expect(await repository.findById("contributor")).toMatchObject({ status: "active" });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE action = 'member.status_updated'").all()).results).toEqual([]);
  });

  async function seedContributor() {
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('contributor', 'contributor-sub', 'contributor@example.test', 'contributor', 'active', ?, ?)").bind("2026-08-28T00:00:00.000Z", "2026-08-28T00:00:00.000Z").run();
  }

  async function api(path: string, body?: { status: string }): Promise<Response> {
    const request = new Request(`https://memory.crgmhrc.asia${path}`, { method: body ? "PATCH" : "GET", ...(body ? { body: JSON.stringify(body) } : {}), headers: { cookie: `__Host-memory-session=${admin}`, origin: "https://memory.crgmhrc.asia", "content-type": "application/json" } });
    const context = createExecutionContext(); const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context); await waitOnExecutionContext(context); return response;
  }
});
