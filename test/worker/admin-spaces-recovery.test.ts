/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { loadAdminSpaces } from "../../frontend/lib/admin-spaces-data";
import { SpacesRepository } from "../../src/spaces/repository";
import { SpacesService } from "../../src/spaces/service";
import { AuditRepository } from "../../src/audit/repository";
import { MIGRATIONS } from "../fixtures/d1";

describe("admin spaces API recovery boundaries",()=>{
  let admin = "";
  let contributor = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('space-admin', 'subject-space-admin', 'space-admin@example.test', 'admin', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
       ('space-contributor', 'subject-space-contributor', 'space-contributor@example.test', 'contributor', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
    ).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    admin = (await sessions.create((await members.findById("space-admin"))!)).token;
    contributor = (await sessions.create((await members.findById("space-contributor"))!)).token;
  });


  it("feeds actual HTTP management records into the frontend loader",async()=>{
    const created=await api("/api/admin/spaces",admin,{method:"POST",body:JSON.stringify({slug:"managed",name:"Managed",position:0})});expect(created.status).toBe(201);const {space}=await created.json<{space:{id:string}}>();
    expect((await api("/api/admin/collections",admin,{method:"POST",body:JSON.stringify({spaceId:space.id,name:"Owned collection",position:0})})).status).toBe(201);
    const loaded=await loadAdminSpaces({requester:(url,init)=>api(String(url),admin,init)});expect(loaded).toEqual(expect.arrayContaining([expect.objectContaining({id:space.id,collections:[expect.objectContaining({spaceId:space.id,name:"Owned collection"})]})]));
  });
  it("admits one concurrent slug creation and one audit",async()=>{
    const responses=await Promise.all([1,2,3].map(()=>api("/api/admin/spaces",admin,{method:"POST",body:JSON.stringify({slug:"same",name:"Same",position:0})})));expect(responses.map(x=>x.status).sort()).toEqual([201,409,409]);expect((await env.DB.prepare("SELECT id FROM spaces WHERE slug='same'").all()).results).toHaveLength(1);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE action='space.created'").all()).results).toHaveLength(1);
  });
  it.each([false,true])("rejects non-admin or disabled admin access (disabled=%s) without writes",async disabled=>{
    if(disabled)await env.DB.prepare("UPDATE members SET status='disabled' WHERE id='space-admin'").run();const token=disabled?admin:contributor;
    for(const [path,method,body] of [["/api/admin/spaces","GET",undefined],["/api/admin/spaces/default/collections","GET",undefined],["/api/admin/spaces","POST",{slug:"denied",name:"Denied",position:0}],["/api/admin/spaces/default","PATCH",{name:"Denied"}],["/api/admin/collections","POST",{spaceId:"default",name:"Denied",position:0}],["/api/admin/collections/unknown","PATCH",{name:"Denied"}]] as const){expect((await api(path,token,{method,...(body?{body:JSON.stringify(body)}:{})})).status).toBe(403);}
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE resource_type IN ('space','collection')").all()).results).toEqual([]);
  });
  it("rejects a parent from another shared space without crossing collection ownership",async()=>{
    const responses=await Promise.all(["left","right"].map(slug=>api("/api/admin/spaces",admin,{method:"POST",body:JSON.stringify({slug,name:slug,position:0})})));const [{space:left},{space:right}]=await Promise.all(responses.map(x=>x.json<{space:{id:string}}>()));
    const parent=await api("/api/admin/collections",admin,{method:"POST",body:JSON.stringify({spaceId:left!.id,name:"Parent",position:0})});const {collection}=await parent.json<{collection:{id:string}}>();
    const rejected=await api("/api/admin/collections",admin,{method:"POST",body:JSON.stringify({spaceId:right!.id,parentId:collection.id,name:"Wrong scope",position:0})});expect(rejected.status).toBe(400);expect((await env.DB.prepare("SELECT id FROM collections WHERE space_id=?").bind(right!.id).all()).results).toEqual([]);expect((await env.DB.prepare("SELECT id FROM audit_events WHERE action='collection.created'").all()).results).toHaveLength(1);
  });
  it("rolls back HTTP space creation when its audit fails",async()=>{
    await env.DB.exec("CREATE TRIGGER fail_space_audit BEFORE INSERT ON audit_events WHEN NEW.action='space.created' BEGIN SELECT RAISE(ABORT,'forced audit failure'); END");
    try{expect((await api("/api/admin/spaces",admin,{method:"POST",body:JSON.stringify({slug:"rollback",name:"Rollback",position:0})})).status).toBe(500);expect((await env.DB.prepare("SELECT id FROM spaces WHERE slug='rollback'").all()).results).toEqual([]);}finally{await env.DB.exec("DROP TRIGGER fail_space_audit");}
  });
  it("advances space versions under a frozen clock and rejects stale service snapshots", async () => {
    const repository = new SpacesRepository(env.DB, new AuditRepository(env.DB));
    const service = new SpacesService(repository, repository, { now: () => new Date("2026-09-28T00:00:00.000Z") });
    const created = await service.createSpace({ slug: "clock", name: "Clock", position: 0 }, "space-admin");
    const updated = await service.updateSpace(created.id, { name: "First" }, "space-admin");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    await expect(repository.updateSpaceWithAudit(created.id, { name: "Stale", updatedAt: updated.updatedAt, expectedUpdatedAt: created.updatedAt }, { id: "stale-audit", actorKind: "member", actorId: "space-admin", action: "space.updated", resourceType: "space", resourceId: created.id, metadata: { previousStatus: "active", newStatus: "active" }, createdAt: updated.updatedAt })).rejects.toMatchObject({ kind: "write_conflict" });
    expect((await repository.findSpaceById(created.id))?.name).toBe("First");
    expect(await env.DB.prepare("SELECT id FROM audit_events WHERE id='stale-audit'").first()).toBeNull();
    const second = await service.updateSpace(created.id, { status: "disabled" }, "space-admin");
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(updated.updatedAt));
  });
  it("pages actual HTTP spaces and scoped collections beyond the first 50", async () => {
    const { loadAdminSpacesPage, loadAdminCollections } = await import("../../frontend/lib/admin-spaces-data");
    const now = "2026-09-28T00:00:00.000Z";
    await env.DB.batch(Array.from({ length: 55 }, (_, i) => env.DB.prepare("INSERT INTO spaces(id,slug,name,description,kind,status,position,read_only,created_at,updated_at) VALUES(?,?,?,'','shared','active',1,0,?,?)").bind(`page-${String(i).padStart(2,"0")}`, `page-${i}`, `Page ${i}`, now, now)));
    await env.DB.batch(Array.from({ length: 55 }, (_, i) => env.DB.prepare("INSERT INTO collections(id,space_id,parent_id,name,description,status,position,created_at,updated_at) VALUES(?,'page-00',NULL,?,'','active',0,?,?)").bind(`collection-${i}`, `Collection ${i}`, now, now)));
    const requester = (url: RequestInfo | URL, init?: RequestInit) => api(String(url), admin, init);
    const first = await loadAdminSpacesPage({ requester }); const second = await loadAdminSpacesPage({ requester, cursor: first.nextCursor });
    expect(first.items).toHaveLength(50); expect(second.items).toHaveLength(7); expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(57); expect(second.nextCursor).toBeUndefined();
    const target = first.items.find(item => item.id === "page-00")!; expect(target.collections).toHaveLength(50);
    const more = await loadAdminCollections(target.id, { requester, cursor: target.collectionsCursor }); expect(more.items).toHaveLength(5); expect(new Set([...target.collections, ...more.items].map(item => item.id)).size).toBe(55); expect(more.items.every(item => item.spaceId === target.id)).toBe(true);
  });
  it("does not rebase a stale collection service snapshot or reuse its frozen-clock version", async () => {
    const repository = new SpacesRepository(env.DB, new AuditRepository(env.DB));
    const service = new SpacesService(repository, repository, { now: () => new Date("2026-09-28T00:00:00.000Z") });
    const created = await service.createCollection({ spaceId: "default", name: "Clock", position: 0 }, "space-admin");
    const updated = await service.updateCollection(created.id, { name: "First" }, "space-admin");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    const find = repository.findCollectionById.bind(repository);
    const spy = vi.spyOn(repository, "findCollectionById").mockImplementationOnce(async id => {
      const current = await find(id);
      await env.DB.prepare("UPDATE collections SET status='disabled', updated_at='2026-09-29T00:00:00.000Z' WHERE id=?").bind(id).run();
      return current;
    });
    try { await expect(service.updateCollection(created.id, { status: "active" }, "space-admin")).rejects.toMatchObject({ status: 409, code: "SPACE_WRITE_CONFLICT" }); }
    finally { spy.mockRestore(); }
    expect((await find(created.id))?.status).toBe("disabled");
    expect((await env.DB.prepare("SELECT id FROM audit_events WHERE action='collection.updated' AND resource_id=?").bind(created.id).all()).results).toHaveLength(1);
  });
  it("maps concurrent collection status changes to success or conflict with a consistent audit chain", async () => {
    const response = await api("/api/admin/collections", admin, { method: "POST", body: JSON.stringify({ spaceId: "default", name: "Race", position: 0 }) });
    const { collection } = await response.json<{ collection: { id: string } }>();
    const responses = await Promise.all(["disabled", "active", "disabled"].map(status => api(`/api/admin/collections/${collection.id}`, admin, { method: "PATCH", body: JSON.stringify({ status }) })));
    expect(responses.every(item => [200, 409].includes(item.status))).toBe(true);
    const events = await env.DB.prepare("SELECT metadata FROM audit_events WHERE action='collection.updated' AND resource_id=? ORDER BY rowid").bind(collection.id).all<{ metadata: string }>();
    expect(events.results).toHaveLength(responses.filter(item => item.status === 200).length);
    let previous = "active";
    for (const event of events.results) { const metadata = JSON.parse(event.metadata); expect(metadata.previousStatus).toBe(previous); previous = metadata.newStatus; }
    expect((await env.DB.prepare("SELECT status FROM collections WHERE id=?").bind(collection.id).first<{ status: string }>())?.status).toBe(previous);
  });
  it("maps concurrent status conflicts without 500 and keeps committed audit transitions consistent",async()=>{
    const created=await api("/api/admin/spaces",admin,{method:"POST",body:JSON.stringify({slug:"racing",name:"Racing",position:0})});const {space}=await created.json<{space:{id:string}}>();
    const responses=await Promise.all(["disabled","active","disabled"].map(status=>api(`/api/admin/spaces/${space.id}`,admin,{method:"PATCH",body:JSON.stringify({status})})));expect(responses.every(x=>[200,409].includes(x.status))).toBe(true);
    const events=await env.DB.prepare("SELECT metadata FROM audit_events WHERE action='space.updated' AND resource_id=? ORDER BY rowid").bind(space.id).all<{metadata:string}>();expect(events.results).toHaveLength(responses.filter(x=>x.status===200).length);let previous="active";for(const event of events.results){const data=JSON.parse(event.metadata);expect(data.previousStatus).toBe(previous);previous=data.newStatus;}expect((await env.DB.prepare("SELECT status FROM spaces WHERE id=?").bind(space.id).first<{status:string}>())?.status).toBe(previous);
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

