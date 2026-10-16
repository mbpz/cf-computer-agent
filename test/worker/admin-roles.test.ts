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
    // Creation and request-time validation must use the same clock; a fixed
    // historical issue time makes unrelated role tests expire as time passes.
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    admin = (await sessions.create((await members.findById("role-admin"))!)).token;
    contributor = (await sessions.create((await members.findById("role-contributor"))!)).token;
    await env.DB.prepare("INSERT INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at) VALUES ('role-editor', 'editor', 'Editor', '', '0x4003', 'active', 0, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')").run();
  });

  it("lists roles for administrators and rejects contributors", async () => {
    const allowed = await api("/api/admin/roles", admin);
    expect(allowed.status).toBe(200);
    const payload = await allowed.json() as { items: Array<{ key: string; allowBits: string }> };
    expect(payload.items.some((item) => item.key === "admin" && item.allowBits === "0x37ffff")).toBe(true);
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
    const listed = await api("/api/admin/roles", admin);
    const listedPayload = await listed.json() as { items: Array<{ id: string; assignedMemberIds: string[] }> };
    expect(listedPayload.items.find((item) => item.id === "role-editor")?.assignedMemberIds).toEqual(["role-contributor"]);
    const session = await api("/api/session", contributor);
    await expect(session.json()).resolves.toMatchObject({ permissionMask: "0x1640c3" });
    const duplicate = await api("/api/admin/roles/role-editor/members", admin, {
      method: "POST",
      body: JSON.stringify({ memberId: "role-contributor" }),
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ assigned: true, role: { id: "role-editor", assignedMemberIds: ["role-contributor"] } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM role_members WHERE role_id = 'role-editor' AND member_id = 'role-contributor'").first()).toEqual({ total: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.member_assigned'").first()).toEqual({ total: 1 });
    const removed = await api("/api/admin/roles/role-editor/members", admin, {
      method: "DELETE",
      body: JSON.stringify({ memberId: "role-contributor" }),
    });
    expect(removed.status).toBe(200);
  });
  it.each(["create", "update", "delete", "assign", "unassign"] as const)("rolls back %s when its audit insert fails", async (operation) => {
    if (operation === "unassign") await api("/api/admin/roles/role-editor/members", admin, {method:"POST",body:JSON.stringify({memberId:"role-contributor"})});
    const beforeRoles = await env.DB.prepare("SELECT * FROM roles ORDER BY id").all();
    const beforeMembers = await env.DB.prepare("SELECT * FROM role_members ORDER BY role_id, member_id").all();
    const beforeAudit = await env.DB.prepare("SELECT * FROM audit_events WHERE resource_type = 'role' ORDER BY id").all();
    await env.DB.prepare("CREATE TRIGGER fail_role_audit BEFORE INSERT ON audit_events WHEN NEW.resource_type = 'role' BEGIN SELECT RAISE(ABORT, 'role audit unavailable'); END").run();
    const response = await api(operation === "create" ? "/api/admin/roles" : operation === "assign" || operation === "unassign" ? "/api/admin/roles/role-editor/members" : "/api/admin/roles/role-editor", admin, {
      method: operation === "create" || operation === "assign" ? "POST" : operation === "update" ? "PATCH" : "DELETE",
      ...(operation === "delete" ? {} : {body:JSON.stringify(operation === "create" ? {key:"rollback",name:"Rollback",allowBits:"0x1"} : operation === "update" ? {allowBits:"0x2"} : {memberId:"role-contributor"})}),
    });
    expect(response.status).toBe(500);
    expect((await env.DB.prepare("SELECT * FROM roles ORDER BY id").all()).results).toEqual(beforeRoles.results);
    expect((await env.DB.prepare("SELECT * FROM role_members ORDER BY role_id, member_id").all()).results).toEqual(beforeMembers.results);
    expect((await env.DB.prepare("SELECT * FROM audit_events WHERE resource_type = 'role' ORDER BY id").all()).results).toEqual(beforeAudit.results);
  });

  it.each(["create","assign","unassign"] as const)("keeps concurrent %s outcomes and audit count consistent",async(operation)=>{
    if(operation==="unassign")await api("/api/admin/roles/role-editor/members",admin,{method:"POST",body:JSON.stringify({memberId:"role-contributor"})});
    const responses=await Promise.all(Array.from({length:3},()=>api(operation==="create"?"/api/admin/roles":"/api/admin/roles/role-editor/members",admin,{method:operation==="unassign"?"DELETE":"POST",body:JSON.stringify(operation==="create"?{key:"parallel",name:"Parallel",allowBits:"0x1"}:{memberId:"role-contributor"})})));
    expect(responses.map(r=>r.status).sort()).toEqual(operation==="create"?[201,409,409]:[200,200,200]);
    const action=operation==="create"?"role.created":operation==="assign"?"role.member_assigned":"role.member_unassigned";
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = ?").bind(action).first()).toEqual({total:1});
  });

  it("reflects mask changes and unassignment in the existing member session",async()=>{
    await api("/api/admin/roles/role-editor/members",admin,{method:"POST",body:JSON.stringify({memberId:"role-contributor"})});
    expect((await (await api("/api/session",contributor)).json() as {permissionMask:string}).permissionMask).toBe("0x1640c3");
    await api("/api/admin/roles/role-editor",admin,{method:"PATCH",body:JSON.stringify({allowBits:"0x200008"})});
    expect((await (await api("/api/session",contributor)).json() as {permissionMask:string}).permissionMask).toBe("0x3600cb");
    await api("/api/admin/roles/role-editor/members",admin,{method:"DELETE",body:JSON.stringify({memberId:"role-contributor"})});
    expect((await (await api("/api/session",contributor)).json() as {permissionMask:string}).permissionMask).toBe("0x1600c3");
  });

  it("does not audit a stale previous mask when different updates race",async()=>{
    const responses=await Promise.all(["0x2","0x4","0x8"].map(allowBits=>api("/api/admin/roles/role-editor",admin,{method:"PATCH",body:JSON.stringify({allowBits})})));
    expect(responses.every(r=>r.status===200||r.status===409)).toBe(true);
    const events=await env.DB.prepare("SELECT metadata FROM audit_events WHERE action = 'role.updated' ORDER BY rowid").all<{metadata:string}>();
    expect(events.results.length).toBe(responses.filter(r=>r.status===200).length);
    let previous="0x4003";
    for(const event of events.results){const metadata=JSON.parse(event.metadata);expect(metadata.previousAllowBits).toBe(previous);previous=metadata.allowBits;}
    expect(await env.DB.prepare("SELECT allow_bits FROM roles WHERE id='role-editor'").first()).toEqual({allow_bits:previous});
  });

  it("lets the default administrator add a missing workbench permission and nothing else", async () => {
    await env.DB.prepare("UPDATE roles SET allow_bits = '0x17ffff' WHERE id = 'role-admin'").run();
    const granted = await api("/api/admin/roles/role-admin", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x37ffff" }) });
    expect(granted.status).toBe(200);
    await expect(granted.json()).resolves.toMatchObject({ role: { key: "admin", allowBits: "0x37ffff", isSystem: true } });
    expect((await (await api("/api/session", admin)).json() as { permissionMask: string }).permissionMask).toBe("0x37ffff");
    expect((await api("/api/admin/roles/role-admin", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x17ffff" }) })).status).toBe(409);
    expect((await api("/api/admin/roles/role-admin", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x1fffff", name: "Renamed" }) })).status).toBe(409);
    expect(await env.DB.prepare("SELECT allow_bits, name FROM roles WHERE id = 'role-admin'").first()).toEqual({ allow_bits: "0x37ffff", name: "Administrator" });
  });

  it("rejects writes by contributors, revoked admins, malformed and immutable role targets without audit",async()=>{
    const operations=[{path:"/api/admin/roles",method:"POST",body:{key:"denied",name:"Denied",allowBits:"0x1"}},{path:"/api/admin/roles/role-editor",method:"PATCH",body:{allowBits:"0x1"}},{path:"/api/admin/roles/role-editor/members",method:"POST",body:{memberId:"role-contributor"}},{path:"/api/admin/roles/role-editor/members",method:"DELETE",body:{memberId:"role-contributor"}},{path:"/api/admin/roles/role-editor",method:"DELETE"}];
    for(const operation of operations)expect((await api(operation.path,contributor,{method:operation.method,body:JSON.stringify(operation.body)})).status).toBe(403);
    expect((await api("/api/admin/roles/role-admin",admin,{method:"PATCH",body:JSON.stringify({allowBits:"0x1"})})).status).toBe(409);
    expect((await api("/api/admin/roles/role-editor",admin,{method:"PATCH",body:JSON.stringify({allowBits:"0x10000000000000000"})})).status).toBe(400);
    expect((await api("/api/admin/roles/role-editor",admin,{method:"PATCH",body:JSON.stringify({allowBits:"0x1",isSystem:true})})).status).toBe(400);
    expect((await api("/api/admin/roles/missing",admin,{method:"PATCH",body:JSON.stringify({allowBits:"0x1"})})).status).toBe(404);
    await env.DB.prepare("UPDATE members SET status='disabled' WHERE id='role-admin'").run();
    for(const operation of operations)expect((await api(operation.path,admin,{method:operation.method,body:JSON.stringify(operation.body)})).status).toBe(403);
    expect((await api("/api/admin/roles",admin)).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE resource_type='role'").first()).toEqual({total:0});
    expect(await env.DB.prepare("SELECT allow_bits FROM roles WHERE id='role-editor'").first()).toEqual({allow_bits:"0x4003"});
  });

  it("replays a creation under its stable key as one role and one audit event", async () => {
    const body = { operationId: "role-create-1", key: "reviewer", name: "Reviewer", allowBits: "0x9" };
    const first = await api("/api/admin/roles", admin, { method: "POST", body: JSON.stringify(body) });
    expect(first.status).toBe(201);
    const created = (await first.json() as { role: { id: string; key: string; allowBits: string } }).role;
    const replay = await api("/api/admin/roles", admin, { method: "POST", body: JSON.stringify(body) });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toMatchObject({ role: { id: created.id, key: "reviewer", allowBits: "0x9" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM roles WHERE key = 'reviewer'").first()).toEqual({ total: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.created'").first()).toEqual({ total: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM role_operation_receipts WHERE operation_id = 'role-create-1'").first()).toEqual({ total: 1 });
    // The number is frozen for one intent: a different body must not be applied silently.
    const reused = await api("/api/admin/roles", admin, { method: "POST", body: JSON.stringify({ ...body, name: "Other" }) });
    expect(reused.status).toBe(409);
    expect(await env.DB.prepare("SELECT id FROM roles WHERE key = 'reviewer' AND name = 'Other'").first()).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.created'").first()).toEqual({ total: 1 });
    // A different key for the same number is the same conflict, and an unminted key still 409s.
    expect((await api("/api/admin/roles", admin, { method: "POST", body: JSON.stringify({ ...body, key: "other", name: "Other2" }) })).status).toBe(409);
    expect((await api("/api/admin/roles", admin, { method: "POST", body: JSON.stringify({ key: "reviewer", name: "Reviewer", allowBits: "0x9" }) })).status).toBe(409);
  });

  it("keeps one role and one audit event when the same key is retried concurrently", async () => {
    const body = JSON.stringify({ operationId: "role-create-parallel", key: "reviewer", name: "Reviewer", allowBits: "0x9" });
    const responses = await Promise.all(Array.from({ length: 3 }, () => api("/api/admin/roles", admin, { method: "POST", body })));
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const ids = await Promise.all(responses.map(async (response) => (await response.json() as { role: { id: string } }).role.id));
    expect(new Set(ids).size).toBe(1);
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM roles WHERE key = 'reviewer'").first()).toEqual({ total: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.created'").first()).toEqual({ total: 1 });
  });

  it("converges repeated assignment and removal on one authorisation change and a live projection", async () => {
    const assign = () => api("/api/admin/roles/role-editor/members", admin, { method: "POST", body: JSON.stringify({ memberId: "role-contributor" }) });
    const unassign = () => api("/api/admin/roles/role-editor/members", admin, { method: "DELETE", body: JSON.stringify({ memberId: "role-contributor" }) });
    expect((await assign()).status).toBe(200);
    const replay = await assign();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ assigned: true, role: { id: "role-editor", assignedMemberIds: ["role-contributor"] } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM role_members WHERE role_id = 'role-editor' AND member_id = 'role-contributor'").first()).toEqual({ total: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.member_assigned'").first()).toEqual({ total: 1 });
    // The session projection is recomputed from the assignment, not cached from the write.
    expect((await (await api("/api/session", contributor)).json() as { permissionMask: string }).permissionMask).toBe("0x1640c3");

    const removal = await unassign();
    expect(removal.status).toBe(200);
    expect(await removal.json()).toMatchObject({ assigned: false, role: { id: "role-editor", assignedMemberIds: [] } });
    const removalReplay = await unassign();
    expect(removalReplay.status).toBe(200);
    expect(await removalReplay.json()).toMatchObject({ assigned: false, role: { assignedMemberIds: [] } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM role_members WHERE role_id = 'role-editor' AND member_id = 'role-contributor'").first()).toEqual({ total: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.member_unassigned'").first()).toEqual({ total: 1 });
    expect((await (await api("/api/session", contributor)).json() as { permissionMask: string }).permissionMask).toBe("0x1600c3");
  });

  it("rejects an administrator whose permission matrix is stale instead of overwriting newer grants", async () => {
    const winning = await api("/api/admin/roles/role-editor", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x4001", expectedAllowBits: "0x4003" }) });
    expect(winning.status).toBe(200);
    // The second administrator rendered 0x4003 and must not restore it over 0x4001.
    const stale = await api("/api/admin/roles/role-editor", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x4003", expectedAllowBits: "0x4003" }) });
    expect(stale.status).toBe(409);
    expect(await env.DB.prepare("SELECT allow_bits, name FROM roles WHERE id = 'role-editor'").first()).toEqual({ allow_bits: "0x4001", name: "Editor" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.updated'").first()).toEqual({ total: 1 });
    // A matching precondition still succeeds and audits exactly once per accepted update.
    expect((await api("/api/admin/roles/role-editor", admin, { method: "PATCH", body: JSON.stringify({ allowBits: "0x4003", expectedAllowBits: "0x4001" }) })).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.updated'").first()).toEqual({ total: 2 });
  });

  it("refuses a forged, elevated or revoked contributor session on menu, command and role surfaces", async () => {
    // A granted role that raises the contributor mask must not open an admin surface.
    await env.DB.prepare("UPDATE roles SET allow_bits = '0x600' WHERE id = 'role-editor'").run();
    expect((await api("/api/admin/roles/role-editor/members", admin, { method: "POST", body: JSON.stringify({ memberId: "role-contributor" }) })).status).toBe(200);
    expect((await (await api("/api/session", contributor)).json() as { permissionMask: string }).permissionMask).toBe("0x1606c3");

    const denied = [
      await api("/api/admin/roles", contributor),
      await api("/api/admin/roles/role-editor", contributor, { method: "DELETE" }),
      await api("/api/admin/roles/role-editor/members", contributor, { method: "POST", body: JSON.stringify({ memberId: "role-contributor" }) }),
      await api("/api/admin/roles", contributor, { method: "POST", body: JSON.stringify({ key: "forged", name: "Forged", allowBits: "0x1", operationId: "forged-1" }) }),
    ];
    for (const response of denied) {
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("role-contributor@example.test");
    }
    // The menu and its command projection never carry the administration group.
    const navigation = await api("/api/navigation", contributor);
    expect(navigation.status).toBe(200);
    const body = await navigation.text();
    expect(body).not.toContain("/admin");
    expect(body).not.toContain("NAV_ROLES");
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM roles WHERE key = 'forged'").first()).toEqual({ total: 0 });

    // A malformed session is refused before any projection is served.
    expect((await api("/api/session", "forged-token")).status).toBe(401);
    expect((await api("/api/navigation", "forged-token")).status).toBe(401);
    expect((await api("/api/admin/roles", "forged-token")).status).toBe(401);

    // Disabling the member shrinks the menu, command and deep link immediately.
    expect((await api("/api/admin/members/role-contributor/status", admin, { method: "PATCH", body: JSON.stringify({ status: "disabled", expectedStatus: "active" }) })).status).toBe(200);
    expect((await api("/api/session", contributor)).status).toBe(403);
    expect((await api("/api/navigation", contributor)).status).toBe(403);
    expect((await api("/api/admin/roles", contributor)).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE resource_type = 'role' AND action != 'role.member_assigned'").first()).toEqual({ total: 0 });
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
