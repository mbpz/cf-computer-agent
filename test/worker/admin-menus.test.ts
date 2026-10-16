/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { createAdminMenu, updateAdminMenu, loadAdminMenus } from "../../frontend/lib/admin-menus-data";
import { MIGRATIONS } from "../fixtures/d1";

describe("admin menus API", () => {
  let admin = "";
  let contributor = "";
  let members: MembersRepository;
  let sessions: SessionService;

  async function session(memberId: string): Promise<string> {
    return (await sessions.create((await members.findById(memberId))!)).token;
  }

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('menu-admin', 'subject-menu-admin', 'menu-admin@example.test', 'admin', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
       ('menu-contributor', 'subject-menu-contributor', 'menu-contributor@example.test', 'contributor', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
    ).run();
    members = new MembersRepository(env.DB);
    sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    admin = await session("menu-admin");
    contributor = await session("menu-contributor");
    await env.DB.prepare("INSERT INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at) VALUES ('menu-custom', 'menu-workspace', 'custom', 'NAV_HOME', '/custom', 'House', 'workspace', 99, '0x0', 'active', 1, 0, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')").run();
  });

  it("rejects stale browser snapshots without overwriting the winner", async () => {
    const expected = { parentId: "menu-workspace", labelKey: "NAV_HOME", path: "/custom", position: 99, requiredBits: "0x0", status: "active", visible: true };
    const write = (body: unknown) => api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify(body) });
    expect((await write({ expected, path: "/winner" })).status).toBe(200);
    expect((await write({ expected, path: "/loser" })).status).toBe(409);
    expect(await env.DB.prepare("SELECT path FROM menus WHERE id = 'menu-custom'").first()).toEqual({ path: "/winner" });
    expect((await write({ expected: {}, path: "/invalid" })).status).toBe(400);
  });

  it("round-trips form helpers through authorized HTTP and replays an identical creation", async () => {
    const requester = (input: RequestInfo | URL, init?: RequestInit) => api(String(input), admin, init);
    const input = { key: "form-menu", labelKey: "NAV_SEARCH", path: "/form-menu", parentId: "menu-workspace", icon: null, groupName: "workspace" as const, position: 100, requiredBits: "0x0" };
    const created = await createAdminMenu(input, requester);
    expect(created).toMatchObject({ key: "form-menu", parentId: "menu-workspace", isSystem: false });
    const expected = { parentId: "menu-workspace", labelKey: "NAV_SEARCH", path: "/form-menu", position: 100, requiredBits: "0x0", status: "active" as const, visible: true };
    expect(await updateAdminMenu(created.id, { expected, parentId: null, path: "/form-moved" }, requester)).toMatchObject({ parentId: null, path: "/form-moved" });
    // The same creation intent reads its recorded receipt back, not a duplicate error,
    // and the entry keeps exactly one row even though its live row has since moved.
    expect(await createAdminMenu(input, requester)).toEqual(created);
    expect(await env.DB.prepare("SELECT count(*) AS count FROM menus WHERE key = 'form-menu'").first()).toEqual({ count: 1 });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(2);
    // A different intent that reuses the key stays a conflict with no extra audit.
    await expect(createAdminMenu({ ...input, path: "/form-other" }, requester)).rejects.toMatchObject({ status: 409 });
    expect(await env.DB.prepare("SELECT count(*) AS count FROM menus WHERE key = 'form-menu'").first()).toEqual({ count: 1 });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(2);
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
      "home", "knowledge", "submit", "my-submissions", "tasks", "boards", "notifications", "messages", "inbox", "goals", "projects",
      "graph", "calendar", "today", "focus", "workbench-review",
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
  it("converges racing deletes on one recorded receipt and one audit",async()=>{
    const responses=await Promise.all([1,2,3].map(()=>api("/api/admin/menus/menu-custom",admin,{method:"DELETE"})));
    expect(responses.every(item=>item.status===200)).toBe(true);
    for(const response of responses)await expect(response.json()).resolves.toMatchObject({menu:{id:"menu-custom",key:"custom",path:"/custom"}});
    expect(await env.DB.prepare("SELECT id FROM menus WHERE id='menu-custom'").first()).toBeNull();
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type='menu'").all()).results).toHaveLength(1);
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

  function navigationKeys(payload: { tree: MenuPayloadNode[] }): string[] {
    const keys: string[] = [];
    const visit = (nodes: readonly MenuPayloadNode[]) => { for (const node of nodes) { keys.push(node.key); visit(node.children); } };
    visit(payload.tree);
    return keys;
  }

  async function navigationKeysFor(token: string): Promise<string[]> {
    return navigationKeys(await (await api("/api/navigation", token)).json() as { tree: MenuPayloadNode[] });
  }

  const reportsBody = { key: "reports", labelKey: "NAV_SITE_ANALYTICS", path: "/reports", parentId: "menu-workspace", groupName: "workspace", position: 30, requiredBits: "0x4000" };

  it("replays one creation receipt across a refreshed session with one menu and one audit", async () => {
    const create = (token: string) => api("/api/admin/menus", token, { method: "POST", body: JSON.stringify(reportsBody) });
    const created = await create(admin);
    expect(created.status).toBe(201);
    const receipt = await created.json() as { menu: { id: string; key: string }; created: boolean };
    expect(receipt).toMatchObject({ created: true, menu: { key: "reports" } });
    // A refresh opens a new session; the same request still reads the original receipt
    // instead of a duplicate conflict, and the tree keeps one row and one audit.
    const replayed = await create(await session("menu-admin"));
    expect(replayed.status).toBe(200);
    await expect(replayed.json()).resolves.toEqual({ menu: receipt.menu, created: false });
    expect(await env.DB.prepare("SELECT count(*) AS count FROM menus WHERE key = 'reports'").first()).toEqual({ count: 1 });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(1);
    // A different intent reusing the key is still a conflict and writes nothing.
    expect((await api("/api/admin/menus", admin, { method: "POST", body: JSON.stringify({ ...reportsBody, position: 31 }) })).status).toBe(409);
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(1);
  });

  it("frees a deleted key instead of replaying a tombstoned creation receipt", async () => {
    const created = await api("/api/admin/menus", admin, { method: "POST", body: JSON.stringify(reportsBody) });
    const menu = (await created.json() as { menu: { id: string } }).menu;
    expect((await api(`/api/admin/menus/${menu.id}`, admin, { method: "DELETE" })).status).toBe(200);
    const recreated = await api("/api/admin/menus", admin, { method: "POST", body: JSON.stringify({ ...reportsBody, path: "/reports-two" }) });
    expect(recreated.status).toBe(201);
    expect(await env.DB.prepare("SELECT count(*) AS count FROM menus WHERE key = 'reports'").first()).toEqual({ count: 1 });
  });

  it("keeps a snapshot-less legacy write from overwriting a concurrent winner", async () => {
    // The browser baseline stays optional for bundles already open in a tab; the
    // whole-tree compare-and-set in the mutation statement is what serializes them.
    const responses = await Promise.all([
      api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ position: 7 }) }),
      api("/api/admin/menus/menu-custom", admin, { method: "PATCH", body: JSON.stringify({ position: 8 }) }),
    ]);
    expect(responses.filter((item) => item.status === 200)).toHaveLength(1);
    expect(responses.filter((item) => item.status === 409)).toHaveLength(1);
    const winner = responses[0]!.status === 200 ? 7 : 8;
    expect(await env.DB.prepare("SELECT position FROM menus WHERE id = 'menu-custom'").first()).toEqual({ position: winner });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(1);
  });

  it("lets one of two concurrent admin sessions reorder and projects it to a member session", async () => {
    // The schema allows one active administrator (one_active_admin), so concurrency
    // here is two admin sessions of that administrator, not two accounts.
    const second = await session("menu-admin");
    const baseline = { parentId: "menu-workspace", labelKey: "NAV_HOME", path: "/custom", position: 99, requiredBits: "0x0", status: "active", visible: true };
    const reorder = (token: string, position: number) => api("/api/admin/menus/menu-custom", token, { method: "PATCH", body: JSON.stringify({ expected: baseline, position }) });
    const responses = await Promise.all([reorder(admin, 3), reorder(second, 4)]);
    expect(responses.filter((item) => item.status === 200)).toHaveLength(1);
    expect(responses.filter((item) => item.status === 409)).toHaveLength(1);
    const winner = responses[0]!.status === 200 ? 3 : 4;
    expect(await env.DB.prepare("SELECT position FROM menus WHERE id = 'menu-custom'").first()).toEqual({ position: winner });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(1);
    // `/settings` is the one registered route the seed leaves unmanaged, so it is the
    // only member-visible target the admin API can create. The claim under test is
    // projection freshness, not a settings entry.
    const created = await api("/api/admin/menus", admin, { method: "POST", body: JSON.stringify({ key: "settings-shortcut", labelKey: "NAV_HOME", path: "/settings", parentId: "menu-workspace", groupName: "workspace", position: 40, requiredBits: "0x0" }) });
    expect(created.status).toBe(201);
    const menu = (await created.json() as { menu: { id: string } }).menu;
    expect(await navigationKeysFor(contributor)).toContain("settings-shortcut");
    // Revoking the mask drops it from the member's next read with no refresh at all.
    const revoked = await api(`/api/admin/menus/${menu.id}`, admin, { method: "PATCH", body: JSON.stringify({ expected: { parentId: "menu-workspace", labelKey: "NAV_HOME", path: "/settings", position: 40, requiredBits: "0x0", status: "active", visible: true }, requiredBits: "0x200000" }) });
    expect(revoked.status).toBe(200);
    expect(await navigationKeysFor(contributor)).not.toContain("settings-shortcut");
    expect(await navigationKeysFor(admin)).toContain("settings-shortcut");
  });

  it("requires an acknowledged impact before removing a parent subtree and removes it once", async () => {
    await env.DB.prepare("DELETE FROM menus WHERE id = 'menu-custom'").run();
    await env.DB.prepare(
      `INSERT INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at) VALUES
       ('menu-parent', 'menu-workspace', 'parent', 'NAV_HOME', '/parent', 'House', 'workspace', 98, '0x0', 'active', 1, 0, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
       ('menu-child-a', 'menu-parent', 'child-a', 'NAV_HOME', '/child-a', 'House', 'workspace', 0, '0x0', 'active', 1, 0, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
       ('menu-grandchild', 'menu-child-a', 'grandchild', 'NAV_HOME', '/grandchild', 'House', 'workspace', 0, '0x0', 'active', 1, 0, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
    ).run();
    const remove = (body?: unknown) => api("/api/admin/menus/menu-parent", admin, { method: "DELETE", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const code = async (response: Response) => (await response.json() as { error: { code: string } }).error.code;
    // The impact is disclosed before the confirmation: without an acknowledgment the
    // hierarchy is protected, and a stale acknowledgment cannot remove unseen entries.
    expect(await code(await remove())).toBe("MENU_HAS_CHILDREN");
    expect(await code(await remove({ expectedDescendants: ["menu-child-a"] }))).toBe("MENU_IMPACT_CONFLICT");
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toEqual([]);
    // A system subtree can never be removed, even with an exact acknowledgment.
    expect(await code(await api("/api/admin/menus/menu-workspace", admin, { method: "DELETE", body: JSON.stringify({ expectedDescendants: ["menu-home"] }) }))).toBe("MENU_SYSTEM_IMMUTABLE");
    // The same rule protects a custom parent that holds a system entry.
    await env.DB.prepare("UPDATE menus SET parent_id = 'menu-parent' WHERE id = 'menu-home'").run();
    expect(await code(await remove({ expectedDescendants: ["menu-home", "menu-child-a", "menu-grandchild"] }))).toBe("MENU_SYSTEM_IMMUTABLE");
    await env.DB.prepare("UPDATE menus SET parent_id = 'menu-workspace' WHERE id = 'menu-home'").run();
    const removed = await remove({ expectedDescendants: ["menu-child-a", "menu-grandchild"] });
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toMatchObject({ menu: { id: "menu-parent", key: "parent" } });
    expect((await env.DB.prepare("SELECT id FROM menus WHERE id IN ('menu-parent', 'menu-child-a', 'menu-grandchild')").all()).results).toEqual([]);
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(1);
    // The repeated request replays the recorded receipt instead of reporting not-found.
    const repeated = await remove({ expectedDescendants: ["menu-child-a", "menu-grandchild"] });
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({ menu: { id: "menu-parent" } });
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toHaveLength(1);
    expect(await env.DB.prepare("SELECT id FROM menus WHERE key = 'parent'").first()).toBeNull();
  });

  it("projects a deleted member entry out of another session without a refresh", async () => {
    const created = await api("/api/admin/menus", admin, { method: "POST", body: JSON.stringify({ key: "settings-shortcut", labelKey: "NAV_HOME", path: "/settings", parentId: "menu-workspace", groupName: "workspace", position: 40, requiredBits: "0x0" }) });
    const menu = (await created.json() as { menu: { id: string } }).menu;
    expect(await navigationKeysFor(contributor)).toContain("settings-shortcut");
    expect((await api(`/api/admin/menus/${menu.id}`, admin, { method: "DELETE", body: JSON.stringify({ expectedDescendants: [] }) })).status).toBe(200);
    expect(await navigationKeysFor(contributor)).not.toContain("settings-shortcut");
    expect(await navigationKeysFor(admin)).not.toContain("settings-shortcut");
  });

  it("keeps contributor writes out of the recorded menu operations", async () => {
    expect((await api("/api/admin/menus", contributor, { method: "POST", body: JSON.stringify({ key: "denied", labelKey: "NAV_HOME", path: "/denied", groupName: "workspace", position: 1, requiredBits: "0x0" }) })).status).toBe(403);
    expect((await api("/api/admin/menus/menu-custom", contributor, { method: "PATCH", body: JSON.stringify({ position: 2 }) })).status).toBe(403);
    expect((await api("/api/admin/menus/menu-custom", contributor, { method: "DELETE", body: JSON.stringify({ expectedDescendants: [] }) })).status).toBe(403);
    expect((await env.DB.prepare("SELECT kind, operation_id FROM menu_operation_receipts").all()).results).toEqual([]);
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type = 'menu'").all()).results).toEqual([]);
    expect(await env.DB.prepare("SELECT position, path FROM menus WHERE id = 'menu-custom'").first()).toEqual({ position: 99, path: "/custom" });
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
