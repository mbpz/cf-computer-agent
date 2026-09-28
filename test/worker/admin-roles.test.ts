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
    expect(payload.items.some((item) => item.key === "admin" && item.allowBits === "0x17ffff")).toBe(true);
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
    expect(duplicate.status).toBe(409);
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
    expect(responses.map(r=>r.status).sort()).toEqual(operation==="create"?[201,409,409]:operation==="assign"?[200,409,409]:[200,404,404]);
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
