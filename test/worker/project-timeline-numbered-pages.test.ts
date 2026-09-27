/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { ProjectTimelineService } from "../../src/project-timeline/service";
import { ProjectTimelineRepository } from "../../src/project-timeline/repository";
import { ProjectsRepository } from "../../src/projects/repository";
import { MIGRATIONS } from "../fixtures/d1";
const NOW = new Date("2026-09-27T00:00:00.000Z");
describe("timeline numbered HTTP and D1 pages", () => {
  let token: string;
  const service = () => new ProjectTimelineService(new ProjectTimelineRepository(env.DB), new ProjectsRepository(env.DB));
  async function get(query: string, project = "a", session = token) {
    const context = createExecutionContext();
    const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia/api/projects/${project}/timeline${query}`, { headers: { cookie: `__Host-memory-session=${session}` } }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context); return response;
  }
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS); vi.useFakeTimers({ now: NOW });
    for (const id of ["a", "b"]) await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?)").bind(id, id, `${id}@example.test`, NOW.toISOString(), NOW.toISOString()).run();
    for (const [id, member] of [["a", "a"], ["a-other", "a"], ["empty", "a"], ["b", "b"]]) await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, description, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, '', 'active', 0, ?, ?)").bind(id, member, id, id, NOW.getTime(), NOW.getTime()).run();
    const repo = new ProjectTimelineRepository(env.DB);
    for (let i = 0; i < 47; i++) await repo.insert({ id: `row-${String(i).padStart(3, "0")}`, clientKey: `row-${i}`, memberId: i < 45 ? "a" : "b", projectId: i < 43 ? "a" : i < 45 ? "a-other" : "b", kind: "meeting", title: `Row ${i}`, body: "private", startsAt: null, dueAt: null, createdAt: NOW.getTime(), updatedAt: NOW.getTime() });
    const members = new MembersRepository(env.DB);
    token = (await new SessionService(env.DB, members, { now: () => NOW, waitUntil: () => undefined }).create((await members.findByIdentitySubject("a"))!)).token;
  });
  afterEach(() => vi.useRealTimers());
  it("counts only the member and project and uses stable created-at/id ordering", async () => {
    const pages = [];
    for (const page of [1, 2, 3]) { const response = await get(`?page=${page}&pageSize=20`); expect(response.status).toBe(200); pages.push(await response.json() as any); }
    expect(pages[0].pagination).toEqual({ page: 1, pageSize: 20, total: 43, totalPages: 3 });
    expect(pages.map(p => p.items.length)).toEqual([20, 20, 3]);
    expect(pages[0].items[0].id).toBe("row-042"); expect(pages[2].items.map((x: any) => x.id)).toEqual(["row-002", "row-001", "row-000"]);
    expect(new Set(pages.flatMap(p => p.items.map((x: any) => x.id))).size).toBe(43);
    await service().setStatus("a", "a", "row-000", "done", NOW.toISOString());
    expect((await service().listNumbered("a", "a", { page: 3, pageSize: 20 })).items.at(-1)?.id).toBe("row-000");
    expect((await (await get("?page=1&pageSize=100", "a-other")).json() as any).pagination.total).toBe(2);
  });
  it.each([20, 50, 100])("supports page size %s and empty beyond-last pages", async pageSize => {
    const first = await get(`?page=1&pageSize=${pageSize}`); expect(first.status).toBe(200);
    expect((await first.json() as any).items).toHaveLength(Math.min(43, pageSize));
    expect(await (await get(`?page=4&pageSize=${pageSize}`)).json()).toEqual({ items: [], pagination: { page: 4, pageSize, total: 43, totalPages: Math.ceil(43 / pageSize) } });
  });
  it.each(["?page=0", "?page=1.5", "?page=501", "?page=1&page=2", "?pageSize=21", "?page=1&cursor=secret", "?page=1&limit=20", "?page=1&status=done", "?page=201&pageSize=50", "?page=101&pageSize=100", "?pageSize=20&pageSize=50"])("rejects invalid or mixed numbered queries %s", async query => {
    expect((await get(query)).status).toBe(400);
  });
  it("returns zero for an owned empty project and accepts the last bounded offset", async () => {
    expect(await (await get("?page=1", "empty")).json()).toEqual({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    for (const [page, pageSize] of [[500, 20], [200, 50], [100, 100]]) expect((await get(`?page=${page}&pageSize=${pageSize}`)).status).toBe(200);
  });
  it("enforces auth and ownership without leaking foreign totals", async () => {
    expect((await get("?page=1", "b")).status).toBe(404);
    expect((await get("?page=1", "missing")).status).toBe(404);
    expect((await get("?page=1", "a", "invalid")).status).toBe(401);
    await expect(service().listNumbered("b", "a", {})).rejects.toMatchObject({ status: 404 });
  });
  it("validates direct service calls and retains scoped legacy cursor consumers", async () => {
    for (const page of [0, 1.5, 501]) await expect(service().listNumbered("a", "a", { page, pageSize: 20 })).rejects.toMatchObject({ status: 400 });
    const first = await (await get("?limit=20")).json() as any;
    expect(first.items).toHaveLength(20); expect(first.nextCursor).toBeTruthy();
    const second = await (await get(`?limit=20&cursor=${encodeURIComponent(first.nextCursor)}`)).json() as any;
    expect(second.items[0].id).toBe("row-022");
    expect((await get(`?limit=20&cursor=${encodeURIComponent(first.nextCursor)}`, "a-other")).status).toBe(400);
  });
});
