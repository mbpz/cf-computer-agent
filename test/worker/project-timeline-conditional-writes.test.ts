/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { ProjectsRepository } from "../../src/projects/repository";
import { ProjectsService } from "../../src/projects/service";
import { ProjectTimelineRepository } from "../../src/project-timeline/repository";
import { ProjectTimelineService } from "../../src/project-timeline/service";
import { routeProjectTimelineApi } from "../../src/routes/project-timeline";
const now = new Date("2026-09-27T00:00:00.000Z");
describe("project timeline conditional status writes", () => {
  const repository = () => new ProjectTimelineRepository(env.DB);
  const service = () => new ProjectTimelineService(repository(), new ProjectsRepository(env.DB), { now: () => now });
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const id of ["a", "b"]) await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(id, id, `${id}@test.example`).run();
    const projects = new ProjectsService(new ProjectsRepository(env.DB), { now: () => now });
    for (const [owner, id] of [["a", "project"], ["a", "other"], ["b", "foreign"]]) await projects.create(owner!, { id, clientKey: id, title: id });
    await service().create("a", "project", { id: "row", clientKey: "row", title: "Private action", kind: "action_item" });
  });
  it("advances a frozen-clock version and rejects stale writes including same-status requests", async () => {
    const s = service(); const row = await s.get("a", "project", "row");
    const done = await s.setStatus("a", "project", "row", "done", row.updatedAt);
    expect(done.updatedAt).toBe("2026-09-27T00:00:00.001Z");
    for (const status of ["done", "archived"]) await expect(s.setStatus("a", "project", "row", status, row.updatedAt)).rejects.toMatchObject({ code: "PROJECT_TIMELINE_VERSION_CONFLICT", status: 409, retryable: false });
    const archived = await s.setStatus("a", "project", "row", "archived", done.updatedAt);
    expect(archived.updatedAt).toBe("2026-09-27T00:00:00.002Z");
    expect((await s.get("a", "project", "row")).status).toBe("archived");
  });
  it("advances same-value writes so the consumed version cannot be reused", async () => {
    const s = service(); const row = await s.get("a", "project", "row");
    const unchanged = await s.setStatus("a", "project", "row", "open", row.updatedAt);
    expect(unchanged.updatedAt).not.toBe(row.updatedAt);
    await expect(s.setStatus("a", "project", "row", "done", row.updatedAt)).rejects.toMatchObject({ status: 409 });
  });
  it("does not reuse versions on backwards clocks or an ABA status cycle", async () => {
    const future = now.getTime() + 1000;
    await env.DB.prepare("UPDATE project_timeline_items SET updated_at = ? WHERE id = 'row'").bind(future).run();
    const s = service(); const row = await s.get("a", "project", "row");
    const done = await s.setStatus("a", "project", "row", "done", row.updatedAt);
    const open = await s.setStatus("a", "project", "row", "open", done.updatedAt);
    expect(Date.parse(open.updatedAt)).toBe(future + 2);
    await expect(s.setStatus("a", "project", "row", "archived", row.updatedAt)).rejects.toMatchObject({ status: 409 });
  });
  it("allows only one concurrent writer of one version", async () => {
    const s = service(); const row = await s.get("a", "project", "row");
    const results = await Promise.allSettled([s.setStatus("a", "project", "row", "done", row.updatedAt), s.setStatus("a", "project", "row", "archived", row.updatedAt)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    const winner = results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<{ status: string; updatedAt: string }>;
    expect(await s.get("a", "project", "row")).toMatchObject(winner.value);
  });
  it("makes the SQL predicate authoritative and never returns someone else's winner as a successful write", async () => {
    const r = repository(); const expected = now.getTime();
    expect(await r.updateStatus("a", "project", "row", "done", expected + 1, expected)).toMatchObject({ status: "done" });
    expect(await r.updateStatus("a", "project", "row", "archived", expected + 2, expected)).toBeNull();
    expect(await r.findOwned("a", "project", "row")).toMatchObject({ status: "done", updatedAt: new Date(expected + 1).toISOString() });
  });
  it.each([undefined, null, 123, "bad", "2026-09-27", "2026-09-27T00:00:00Z"])("rejects missing/non-canonical version %s without writing", async version => {
    await expect(service().setStatus("a", "project", "row", "done", version)).rejects.toMatchObject({ status: 400, code: "PROJECT_TIMELINE_VERSION_INVALID" });
    expect(await service().get("a", "project", "row")).toMatchObject({ status: "open", updatedAt: now.toISOString() });
  });
  it.each([["b", "project"], ["a", "other"], ["a", "foreign"]])("hides member/project mismatch %s %s before version validation", async (member, project) => {
    await expect(service().setStatus(member, project, "row", "done", undefined)).rejects.toMatchObject({ status: 404 });
    expect((await service().get("a", "project", "row")).status).toBe("open");
  });
  async function route(body: Record<string, unknown>, query = "") {
    const request = new Request(`https://app.test/api/projects/project/timeline/row/status${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const principal = { kind: "member", memberId: "a", identitySubject: "a", email: "a@test.example", role: "contributor" } as const;
    return routeProjectTimelineApi(request, new URL(request.url), { requestId: "timeline-conditional" }, principal, { projectTimeline: service() });
  }
  it("requires the version in the status API body and reports stale retries as conflicts", async () => {
    await expect(route({ status: "done" })).rejects.toMatchObject({ status: 400 });
    const response = await route({ status: "done", expectedUpdatedAt: now.toISOString() });
    expect(response?.status).toBe(200); expect(await response!.json()).toMatchObject({ status: "done", updatedAt: "2026-09-27T00:00:00.001Z" });
    await expect(route({ status: "done", expectedUpdatedAt: now.toISOString() })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects supplied ownership and query versions rather than relaxing the strict API", async () => {
    await expect(route({ status: "done", expectedUpdatedAt: now.toISOString(), memberId: "b" })).rejects.toMatchObject({ status: 400 });
    await expect(route({ status: "done" }, `?expectedUpdatedAt=${now.toISOString()}`)).rejects.toMatchObject({ status: 400 });
    expect((await service().get("a", "project", "row")).status).toBe("open");
  });
});
