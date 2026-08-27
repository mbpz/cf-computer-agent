/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

describe("admin menus API", () => {
  let admin = "";
  let contributor = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('menu-admin', 'subject-menu-admin', 'menu-admin@example.test', 'admin', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
       ('menu-contributor', 'subject-menu-contributor', 'menu-contributor@example.test', 'contributor', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
    ).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date("2026-08-26T00:00:00.000Z") });
    admin = (await sessions.create((await members.findById("menu-admin"))!)).token;
    contributor = (await sessions.create((await members.findById("menu-contributor"))!)).token;
    await env.DB.prepare("INSERT INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at) VALUES ('menu-custom', 'menu-workspace', 'custom', 'NAV_HOME', '/custom', 'House', 'workspace', 99, '0x0', 'active', 1, 0, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')").run();
  });

  it("lists the tree for administrators and rejects contributors", async () => {
    const allowed = await api("/api/admin/menus", admin);
    expect(allowed.status).toBe(200);
    const payload = await allowed.json() as { tree: MenuPayloadNode[] };
    expect(payload.tree.some((item) => item.key === "workspace" && item.children.some((child) => child.key === "custom"))).toBe(true);
    const workspace = payload.tree.find((item) => item.key === "workspace");
    expect(workspace?.children.find((child) => child.key === "knowledge")?.children.map((child) => child.key)).toEqual(["search", "agent"]);
    const adminRoot = payload.tree.find((item) => item.key === "admin");
    expect(adminRoot?.children.find((child) => child.key === "governance")?.children.map((child) => child.key)).toEqual(["members", "roles", "menus", "spaces", "audit", "site-analytics"]);
    expect((await api("/api/admin/menus", contributor)).status).toBe(403);
  });

  it("serves the permission-filtered navigation tree to members", async () => {
    const contributorResponse = await api("/api/navigation", contributor);
    expect(contributorResponse.status).toBe(200);
    const contributorPayload = await contributorResponse.json() as { tree: MenuPayloadNode[] };
    expect(contributorPayload.tree.map((node) => node.key)).toEqual(["workspace"]);
    expect(contributorPayload.tree[0]?.children.map((node) => node.key)).toEqual([
      "home", "knowledge", "submit", "my-submissions", "custom",
    ]);
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "knowledge")?.children.map((node) => node.key)).toEqual(["search", "agent"]);

    const adminResponse = await api("/api/navigation", admin);
    expect(adminResponse.status).toBe(200);
    const adminPayload = await adminResponse.json() as { tree: MenuPayloadNode[] };
    expect(adminPayload.tree.map((node) => node.key)).toEqual(["workspace", "admin"]);
    expect(adminPayload.tree.find((node) => node.key === "admin")?.children.find((node) => node.key === "governance")?.children.map((node) => node.key)).toEqual([
      "members", "roles", "menus", "spaces", "audit", "site-analytics",
    ]);
  });

  it("updates custom status and rejects unsafe tree mutations", async () => {
    const updated = await api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ status: "disabled", visible: false, position: 3 }) });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ menu: { status: "disabled", visible: false, position: 3 } });
    expect((await api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ labelKey: "NAV_UNKNOWN" }) })).status).toBe(400);
    expect((await api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ path: "/knowledge" }) })).status).toBe(400);
    expect((await api("/api/admin/menus/menu-home", admin, { method: "PATCH", body: JSON.stringify({ visible: false }) })).status).toBe(409);
  });

  it("creates custom entries and only deletes leaf custom entries", async () => {
    const created = await api("/api/admin/menus", admin, { method: "POST", body: JSON.stringify({ key: "reports", labelKey: "NAV_SITE_ANALYTICS", path: "/reports", parentId: "menu-workspace", groupName: "workspace", position: 30, requiredBits: "0x4000" }) });
    expect(created.status).toBe(201);
    const menu = (await created.json() as { menu: { id: string } }).menu;
    expect((await api(`/api/admin/menus/${menu.id}`, admin, { method: "DELETE" })).status).toBe(200);
    expect((await api("/api/admin/menus/menu-workspace", admin, { method: "DELETE" })).status).toBe(409);
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

interface MenuPayloadNode {
  key: string;
  children: MenuPayloadNode[];
}
