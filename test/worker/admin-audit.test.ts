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

  async function api(path: string): Promise<Response> {
    const request = new Request(`https://memory.crgmhrc.asia${path}`, { headers: { cookie: `__Host-memory-session=${admin}`, origin: "https://memory.crgmhrc.asia" } });
    const context = createExecutionContext(); const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context); await waitOnExecutionContext(context); return response;
  }
});
