/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { ProjectsRepository } from "../../src/projects/repository";
import { ProjectsService } from "../../src/projects/service";
import { ProjectTimelineRepository } from "../../src/project-timeline/repository";
import { ProjectTimelineService } from "../../src/project-timeline/service";
import { routeProjectTimelineApi } from "../../src/routes/project-timeline";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
const now = new Date("2026-09-27T00:00:00.000Z");
describe("project timeline full editing", () => {
  const repository = () => new ProjectTimelineRepository(env.DB);
  const service = () => new ProjectTimelineService(repository(), new ProjectsRepository(env.DB), { now: () => now });
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const id of ["a", "b"]) await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(id, id, `${id}@test.example`).run();
    const projects = new ProjectsService(new ProjectsRepository(env.DB), { now: () => now });
    for (const [owner, id] of [["a", "project"], ["a", "other"], ["b", "foreign"]]) await projects.create(owner!, { id, clientKey: id, title: id });
    await service().create("a", "project", { id: "row", clientKey: "row", title: "Private action", kind: "action_item" });
  });
  const input = { kind: "meeting", title: " Updated meeting ", body: "Minutes", startsAt: "2026-10-01T10:00:00.000Z", dueAt: "2026-10-01T11:00:00.000Z", expectedUpdatedAt: now.toISOString() };
  async function route(body: Record<string, unknown>, query = "", memberId = "a", projectId = "project") {
    const request = new Request(`https://app.test/api/projects/${projectId}/timeline/row${query}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const principal = { kind: "member", memberId, identitySubject: memberId, email: `${memberId}@test.example`, role: "contributor" } as const;
    return routeProjectTimelineApi(request, new URL(request.url), { requestId: "timeline-edit" }, principal, { projectTimeline: service() });
  }
  async function http(memberId?: string, projectId = "project") {
    const members = new MembersRepository(env.DB);
    const token = memberId ? (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findByIdentitySubject(memberId))!)).token : "";
    const context = createExecutionContext();
    const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia/api/projects/${projectId}/timeline/row`, { method: "PATCH", headers: { cookie: `__Host-memory-session=${token}`, "content-type": "application/json", origin: "https://memory.crgmhrc.asia" }, body: JSON.stringify(input) }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context); return response;
  }
  it("handles PATCH through the actual authenticated HTTP stack", async () => {
    const response = await http("a"); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Updated meeting", body: "Minutes", memberId: "a" });
    expect((await http("a")).status).toBe(409);
  });
  it("returns 401/404 for missing session or foreign member/project without editing", async () => {
    expect((await http()).status).toBe(401); expect((await http("b")).status).toBe(404); expect((await http("a", "other")).status).toBe(404);
    expect((await service().get("a", "project", "row")).title).toBe("Private action");
  });
  it("denies the automation principal at the route capability boundary", async () => {
    const request = new Request("https://app.test/api/projects/project/timeline/row", { method: "PATCH", body: JSON.stringify(input) });
    await expect(routeProjectTimelineApi(request, new URL(request.url), { requestId: "denied-edit" }, { kind: "automation", role: "automation" }, { projectTimeline: service() })).rejects.toMatchObject({ status: 403 });
    expect((await service().get("a", "project", "row")).title).toBe("Private action");
  });
  it("edits every content field, preserves identity and status, and reads the persisted result", async () => {
    const response = await route(input); expect(response?.status).toBe(200);
    const item = await response!.json();
    expect(item).toMatchObject({ id: "row", memberId: "a", projectId: "project", clientKey: "row", kind: "meeting", title: "Updated meeting", body: "Minutes", startsAt: input.startsAt, dueAt: input.dueAt, status: "open", createdAt: now.toISOString(), updatedAt: "2026-09-27T00:00:00.001Z" });
    expect(await service().get("a", "project", "row")).toEqual(item);
    const cleared = await route({ ...input, kind: "decision", body: "", startsAt: null, dueAt: null, expectedUpdatedAt: "2026-09-27T00:00:00.001Z" });
    expect(await cleared!.json()).toMatchObject({ kind: "decision", body: "", startsAt: null, dueAt: null });
  });
  it.each(["kind", "title", "body", "startsAt", "dueAt", "expectedUpdatedAt"])("requires explicit %s rather than silently clearing omitted fields", async field => {
    const body: Record<string, unknown> = { ...input }; delete body[field];
    await expect(route(body)).rejects.toMatchObject({ status: 400 });
    expect((await service().get("a", "project", "row")).title).toBe("Private action");
  });
  it.each([{ kind: "invalid" }, { title: "  " }, { title: "a".repeat(201) }, { body: 3 }, { body: "a".repeat(200001) }, { startsAt: "bad" }, { startsAt: 9007199254740991, dueAt: null }, { dueAt: "2026-09-30T10:00:00.000Z" }, { expectedUpdatedAt: "2026-09-27" }, { memberId: "b" }, { projectId: "other" }, { clientKey: "changed" }, { status: "done" }])("rejects invalid or immutable field overrides %#", async patch => {
    await expect(route({ ...input, ...patch })).rejects.toMatchObject({ status: 400 });
    expect((await service().get("a", "project", "row")).updatedAt).toBe(now.toISOString());
  });
  it("accepts literal body text that resembles an internal sentinel", async () => {
    const response = await route({ ...input, body: "__invalid__" });
    expect(await response!.json()).toMatchObject({ body: "__invalid__" });
  });
  it("rejects query parameters without writing", async () => { await expect(route(input, "?memberId=a")).rejects.toMatchObject({ status: 400 }); });
  it.each([["b", "project"], ["a", "other"], ["a", "foreign"]])("hides cross-member/project writes %s %s", async (member, project) => {
    await expect(route(input, "", member, project)).rejects.toMatchObject({ status: 404 });
    expect((await service().get("a", "project", "row")).title).toBe("Private action");
  });
  it("consumes the version even for an identical edit and rejects retries", async () => {
    expect((await route(input))?.status).toBe(200);
    await expect(route(input)).rejects.toMatchObject({ status: 409, code: "PROJECT_TIMELINE_VERSION_CONFLICT" });
    const second = await route({ ...input, expectedUpdatedAt: "2026-09-27T00:00:00.001Z" });
    expect(await second!.json()).toMatchObject({ updatedAt: "2026-09-27T00:00:00.002Z" });
  });
  it("allows only one editor or status writer to consume a version", async () => {
    const results = await Promise.allSettled([service().edit("a", "project", "row", input), service().setStatus("a", "project", "row", "done", now.toISOString())]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    expect(await service().get("a", "project", "row")).toEqual((results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<unknown>).value);
  });
  it("enforces SQL ownership and expected version even when called directly", async () => {
    const r = repository(); const fields = { kind: "decision" as const, title: "SQL edit", body: "", startsAt: null, dueAt: null };
    expect(await r.updateContent("b", "project", "row", fields, now.getTime()+1, now.getTime())).toBeNull();
    expect(await r.updateContent("a", "other", "row", fields, now.getTime()+1, now.getTime())).toBeNull();
    expect(await r.updateContent("a", "project", "row", fields, now.getTime()+1, now.getTime())).toMatchObject({ title: "SQL edit", status: "open" });
    expect(await r.updateContent("a", "project", "row", { ...fields, title: "loser" }, now.getTime()+2, now.getTime())).toBeNull();
    expect((await service().get("a", "project", "row")).title).toBe("SQL edit");
  });
});
