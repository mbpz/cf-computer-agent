/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { loadAdminMenus } from "../../frontend/lib/admin-menus-data";
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
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
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
      "home", "knowledge", "submit", "my-submissions", "tasks", "boards", "goals", "notifications", "projects", "messages", "inbox",
    ]);
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "knowledge")?.children.map((node) => node.key)).toEqual(["search", "agent"]);

    const adminResponse = await api("/api/navigation", admin);
    expect(adminResponse.status).toBe(200);
    const adminPayload = await adminResponse.json() as { tree: MenuPayloadNode[] };
    expect(adminPayload.tree.map((node) => node.key)).toEqual(["workspace", "admin"]);
    expect(adminPayload.tree.find((node) => node.key === "workspace")?.children.map((node) => node.key)).toContain("tasks");
    expect(adminPayload.tree.find((node) => node.key === "admin")?.children.find((node) => node.key === "governance")?.children.map((node) => node.key)).toEqual([
      "members", "roles", "menus", "spaces", "audit", "site-analytics",
    ]);
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "custom")).toBeUndefined();
    const knowledge = contributorPayload.tree[0]?.children.find((node) => node.key === "knowledge");
    expect(knowledge).toMatchObject({ path: "/knowledge", availability: "ready" });
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "boards")).toMatchObject({
      availability: "ready",
    });
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "notifications")).toMatchObject({
      availability: "ready",
    });
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "notifications")?.disabledReason).toBeUndefined();
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "messages")).toMatchObject({
      availability: "ready",
    });
    expect(contributorPayload.tree[0]?.children.find((node) => node.key === "messages")?.disabledReason).toBeUndefined();
  });

  it("keeps seeded coming-soon visibility under database control", async () => {
    await env.DB.prepare("UPDATE menus SET visible = 0 WHERE id = 'menu-notifications'").run();
    const response = await api("/api/navigation", contributor);
    const payload = await response.json() as { tree: MenuPayloadNode[] };
    const keys = payload.tree[0]?.children.map((node) => node.key);
    expect(keys).toContain("boards");
    expect(keys).toContain("messages");
    expect(keys).not.toContain("notifications");
  });

  it("updates custom status and rejects unsafe tree mutations", async () => {
    const updated = await api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ status: "disabled", visible: false, position: 3 }) });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ menu: { status: "disabled", visible: false, position: 3 } });
    expect((await api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ labelKey: "NAV_UNKNOWN" }) })).status).toBe(400);
    expect((await api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ path: "/knowledge" }) })).status).toBe(400);
    expect((await api("/api/admin/menus/menu-home", admin, { method: "PATCH", body: JSON.stringify({ visible: false }) })).status).toBe(409);
  });

  it("filters unknown database paths instead of presenting them as coming soon", async () => {
    const response = await api("/api/navigation", contributor);
    const payload = await response.json() as { tree: MenuPayloadNode[] };
    expect(payload.tree[0]?.children.find((node) => node.key === "custom")).toBeUndefined();

    await env.DB.prepare("UPDATE menus SET path = '/totally-unknown' WHERE id = 'menu-custom'").run();
    const unknownResponse = await api("/api/navigation", contributor);
    const unknownPayload = await unknownResponse.json() as { tree: MenuPayloadNode[] };
    expect(unknownPayload.tree[0]?.children.find((node) => node.key === "custom")).toBeUndefined();
  });

  it("creates custom entries and only deletes leaf custom entries", async () => {
    const created = await api("/api/admin/menus", admin, { method: "POST", body: JSON.stringify({ key: "reports", labelKey: "NAV_SITE_ANALYTICS", path: "/reports", parentId: "menu-workspace", groupName: "workspace", position: 30, requiredBits: "0x4000" }) });
    expect(created.status).toBe(201);
    const menu = (await created.json() as { menu: { id: string } }).menu;
    expect((await api(`/api/admin/menus/${menu.id}`, admin, { method: "DELETE" })).status).toBe(200);
    expect((await api("/api/admin/menus/menu-workspace", admin, { method: "DELETE" })).status).toBe(409);
  });
  it("sends a usable management tree including disabled, hidden and empty nodes", async()=>{
    await env.DB.prepare("UPDATE menus SET status='disabled',visible=0 WHERE id='menu-custom'").run();
    const tree=await loadAdminMenus(async()=>api("/api/admin/menus",admin));
    const custom=tree.find(item=>item.id==="menu-workspace")?.children.find(item=>item.id==="menu-custom");
    expect(custom).toMatchObject({parentId:"menu-workspace",status:"disabled",visible:false,isSystem:false});
    expect(tree.find(item=>item.id==="menu-admin")).toMatchObject({isSystem:true});
    await env.DB.prepare("UPDATE menus SET path=NULL,parent_id=NULL WHERE id='menu-custom'").run();
    expect((await loadAdminMenus(async()=>api("/api/admin/menus",admin))).find(item=>item.id==="menu-custom")).toMatchObject({path:null,children:[]});
    const nav=JSON.stringify(await (await api("/api/navigation",contributor)).json());expect(nav).not.toContain("menu-custom");
  });
  it.each(["POST","PATCH","DELETE"])("rolls back %s when menu audit fails",async method=>{
    const before=await env.DB.prepare("SELECT * FROM menus ORDER BY id").all();
    await env.DB.exec("CREATE TRIGGER fail_menu_audit BEFORE INSERT ON audit_events WHEN NEW.resource_type='menu' BEGIN SELECT RAISE(ABORT,'menu audit unavailable'); END");
    const response=await api(method==="POST"?"/api/admin/menus":"/api/admin/menus/menu-custom",admin,{method,...(method==="DELETE"?{}:{body:JSON.stringify(method==="PATCH"?{status:"disabled"}:{key:"new-menu",labelKey:"NAV_HOME",path:"/new-menu",groupName:"workspace",position:5,requiredBits:"0x0"})})});
    expect(response.status).toBe(500);expect((await env.DB.prepare("SELECT * FROM menus ORDER BY id").all()).results).toEqual(before.results);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type='menu'").all()).results).toEqual([]);
  });
  it("keeps concurrently reparented menus acyclic",async()=>{
    await env.DB.prepare("UPDATE menus SET parent_id=NULL WHERE id='menu-custom'").run();
    const created=await api("/api/admin/menus",admin,{method:"POST",body:JSON.stringify({key:"second",labelKey:"NAV_HOME",path:"/second",groupName:"workspace",position:50,requiredBits:"0x0"})});expect(created.status).toBe(201);const id=(await created.json() as {menu:{id:string}}).menu.id;
    const responses=await Promise.all([api("/api/admin/menus/menu-custom",admin,{method:"PATCH",body:JSON.stringify({parentId:id})}),api(`/api/admin/menus/${id}`,admin,{method:"PATCH",body:JSON.stringify({parentId:"menu-custom"})})]);
    expect(responses.filter(item=>item.status===200)).toHaveLength(1);expect(responses.every(item=>[200,400,409].includes(item.status))).toBe(true);expect((await api("/api/admin/menus",admin)).status).toBe(200);
  });

  it("keeps successful concurrent update receipts and audits consistent",async()=>{
    const responses=await Promise.all(["/one","/two","/three"].map(path=>api("/api/admin/menus/menu-custom",admin,{method:"PATCH",body:JSON.stringify({path})})));
    const paths=["/one","/two","/three"];for(let i=0;i<responses.length;i++){expect([200,409]).toContain(responses[i]!.status);if(responses[i]!.status===200)await expect(responses[i]!.json()).resolves.toMatchObject({menu:{path:paths[i]}});}
    const audits=await env.DB.prepare("SELECT metadata FROM audit_events WHERE resource_type='menu' ORDER BY rowid").all<{metadata:string}>();expect(audits.results).toHaveLength(responses.filter(item=>item.status===200).length);expect(audits.results.length).toBeGreaterThan(0);let previous="/custom";for(const row of audits.results){const data=JSON.parse(row.metadata);expect(data.previousPath).toBe(previous);previous=data.path;}expect((await env.DB.prepare("SELECT path FROM menus WHERE id='menu-custom'").first<{path:string}>())?.path).toBe(previous);
  });
  it("emits one audit for racing deletes",async()=>{
    const responses=await Promise.all([1,2,3].map(()=>api("/api/admin/menus/menu-custom",admin,{method:"DELETE"})));expect(responses.filter(item=>item.status===200)).toHaveLength(1);expect(responses.every(item=>[200,404,409].includes(item.status))).toBe(true);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type='menu'").all()).results).toHaveLength(1);
  });
  it("does not orphan a child when parent deletion races child creation",async()=>{
    const responses=await Promise.all([api("/api/admin/menus/menu-custom",admin,{method:"DELETE"}),api("/api/admin/menus",admin,{method:"POST",body:JSON.stringify({key:"child",labelKey:"NAV_HOME",path:"/child",parentId:"menu-custom",groupName:"workspace",position:1,requiredBits:"0x0"})})]);expect(responses.filter(item=>item.status===200||item.status===201)).toHaveLength(1);expect(responses.every(item=>[200,201,400,409].includes(item.status))).toBe(true);expect((await api("/api/admin/menus",admin)).status).toBe(200);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type='menu'").all()).results).toHaveLength(1);
  });
  it("enforces contributor and disabled-admin write boundaries without audit side effects",async()=>{
    const write=(token:string,method:string)=>api(method==="POST"?"/api/admin/menus":"/api/admin/menus/menu-custom",token,{method,...(method==="DELETE"?{}:{body:JSON.stringify(method==="POST"?{key:"denied",labelKey:"NAV_HOME",path:"/denied",groupName:"workspace",position:1,requiredBits:"0x0"}:{visible:false})})});for(const method of ["POST","PATCH","DELETE"])expect((await write(contributor,method)).status).toBe(403);await env.DB.prepare("UPDATE members SET status='disabled' WHERE id='menu-admin'").run();for(const method of ["POST","PATCH","DELETE"])expect((await write(admin,method)).status).toBe(403);expect((await env.DB.prepare("SELECT visible FROM menus WHERE id='menu-custom'").first<{visible:number}>())?.visible).toBe(1);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type='menu'").all()).results).toEqual([]);
  });
  it("does not let navigation visibility grant API access",async()=>{
    await env.DB.prepare("UPDATE menus SET required_bits='0x0' WHERE path='/admin/submissions'").run();expect((await api("/api/admin/menus",contributor)).status).toBe(403);expect((await api("/api/admin/submissions",contributor)).status).toBe(403);
  });
  it("rejects a duplicate create path as a conflict without an audit",async()=>{
    const response=await api("/api/admin/menus",admin,{method:"POST",body:JSON.stringify({key:"duplicate-path",labelKey:"NAV_HOME",path:"/custom",groupName:"workspace",position:1,requiredBits:"0x0"})});
    expect(response.status).toBe(409);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type='menu'").all()).results).toEqual([]);
  });
  it("rejects excessive create depth as invalid input without an audit",async()=>{
    await env.DB.exec("INSERT INTO menus(id,parent_id,key,label_key,path,group_name,position,required_bits,status,visible,is_system,created_at,updated_at) VALUES ('depth-three','menu-custom','depth-three','NAV_HOME','/depth-three','workspace',1,'0x0','active',1,0,'2026-09-28','2026-09-28'),('depth-four','depth-three','depth-four','NAV_HOME','/depth-four','workspace',1,'0x0','active',1,0,'2026-09-28','2026-09-28')");
    const response=await api("/api/admin/menus",admin,{method:"POST",body:JSON.stringify({key:"depth-five",labelKey:"NAV_HOME",path:"/depth-five",parentId:"depth-four",groupName:"workspace",position:1,requiredBits:"0x0"})});
    expect(response.status).toBe(400);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type='menu'").all()).results).toEqual([]);
  });
  it("rejects overflow instead of silently returning a truncated configuration",async()=>{
    await env.DB.exec("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<201) INSERT INTO menus(id,key,label_key,path,group_name,position,required_bits,status,visible,is_system,created_at,updated_at) SELECT 'overflow-'||n,'overflow-'||n,'NAV_HOME','/overflow-'||n,'workspace',n,'0x0','active',1,0,'2026-09-28T00:00:00Z','2026-09-28T00:00:00Z' FROM seq");expect((await api("/api/admin/menus",admin)).status).toBe(409);
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
  path?: string | null;
  availability?: "ready" | "coming_soon";
  disabledReason?: "not_implemented";
  children: MenuPayloadNode[];
}
