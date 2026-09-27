/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
const V0 = "2026-09-27T00:00:00.000Z";
const tokens: Record<string, string> = {};
async function http(path = "/api/goals/g/tasks", method = "GET", body?: unknown, owner = "a") {
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { method, headers: { cookie: `__Host-memory-session=${tokens[owner] ?? ""}`, origin: "https://memory.crgmhrc.asia", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context); return response;
}
async function page(goal = "g") { const response = await http(`/api/goals/${goal}/tasks?page=1&pageSize=20`); expect(response.status).toBe(200); return response.json<any>(); }
async function link(taskId = "t", expectedUpdatedAt = V0, goal = "g") { return http(`/api/goals/${goal}/tasks`, "POST", { taskId, expectedUpdatedAt }); }
describe("direct goal task relations through authenticated HTTP", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      const members = new MembersRepository(env.DB); tokens[owner] = (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findByIdentitySubject(owner))!)).token;
    }
    for (const [id, owner] of [["g", "a"], ["g2", "a"], ["foreign", "b"]]) await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 37, ?, ?)").bind(id, owner, id, id, Date.parse(V0), Date.parse(V0)).run();
    for (const [id, owner] of [["t", "a"], ["t2", "a"], ["secret", "b"]]) await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', 1, 1)").bind(id, owner, id).run();
  });
  it("lists only owned tasks, links independently to two goals and keeps manual progress", async () => {
    expect(await page()).toMatchObject({ goalId: "g", expectedUpdatedAt: V0, summary: { taskCount: 0, completedTaskCount: 0 }, pagination: { total: 2 }, items: [{ id: "t2", linked: false }, { id: "t", linked: false }] });
    const receipt = await link(); expect(receipt.status).toBe(200); expect(await receipt.json()).toMatchObject({ goalId: "g", taskId: "t", linked: true, changed: true });
    expect(await page()).toMatchObject({ summary: { taskCount: 1, completedTaskCount: 0 }, items: [{ id: "t2", linked: false }, { id: "t", linked: true }] });
    expect((await link("t", V0, "g2")).status).toBe(200);
    expect(await page("g2")).toMatchObject({ summary: { taskCount: 1 } });
    expect(await (await http("/api/goals/g")).json()).toMatchObject({ progress: 37 });
  });
  it("reconciles completion, reopening, cancellation, unlink and task deletion", async () => {
    expect((await link()).status).toBe(200);
    for (const [status, count] of [["done", 1], ["doing", 0], ["canceled", 0]] as const) {
      await env.DB.prepare("UPDATE tasks SET status = ? WHERE id = 't'").bind(status).run();
      expect((await page()).summary).toEqual({ taskCount: 1, completedTaskCount: count });
    }
    const unlink = await http("/api/goals/g/tasks/t", "DELETE", { expectedUpdatedAt: (await page()).expectedUpdatedAt }); expect(unlink.status).toBe(200);
    expect((await page()).summary.taskCount).toBe(0);
    expect((await link("t", (await page()).expectedUpdatedAt)).status).toBe(200);
    await env.DB.prepare("DELETE FROM tasks WHERE id = 't'").run();
    expect((await page()).summary.taskCount).toBe(0);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM goal_tasks").first("n")).toBe(0);
  });
  it("consumes goal versions for no-ops and rejects mixed stale writes", async () => {
    expect((await link()).status).toBe(200); const v1 = (await page()).expectedUpdatedAt;
    expect(Date.parse(v1)).toBeGreaterThan(Date.parse(V0));
    expect((await link()).status).toBe(409);
    const noop = await link("t", v1); expect(noop.status).toBe(200); expect(await noop.json()).toMatchObject({ changed: false });
    const v2 = (await page()).expectedUpdatedAt; expect(Date.parse(v2)).toBeGreaterThan(Date.parse(v1));
    expect((await http("/api/goals/g/progress", "POST", { progress: 90, expectedUpdatedAt: v1 })).status).toBe(409);
    expect((await http("/api/goals/g/tasks/t", "DELETE", { expectedUpdatedAt: v1 })).status).toBe(409);
    expect((await http("/api/goals/g/progress", "POST", { progress: 90, expectedUpdatedAt: v2 })).status).toBe(200);
    expect((await link("t2", v2)).status).toBe(409);
  });
  it("allows only one of concurrent different task writes to consume a version", async () => {
    const responses = await Promise.all([link("t"), link("t2")]); expect(responses.map(r => r.status).sort()).toEqual([200, 409]); expect((await page()).summary.taskCount).toBe(1);
  });
  it.each(["foreign", "missing"])("hides %s goals on reads and writes", async goal => {
    expect((await http(`/api/goals/${goal}/tasks`)).status).toBe(404);
    expect((await link("t", V0, goal)).status).toBe(404);
    expect((await http(`/api/goals/${goal}/tasks/t`, "DELETE", { expectedUpdatedAt: V0 })).status).toBe(404);
  });
  it.each(["secret", "missing"])("hides %s tasks without consuming goal version", async task => {
    expect((await link(task)).status).toBe(404);
    expect((await http(`/api/goals/g/tasks/${task}`, "DELETE", { expectedUpdatedAt: V0 })).status).toBe(404);
    expect((await page()).expectedUpdatedAt).toBe(V0);
  });
  it("rejects missing authentication and cross-member access", async () => {
    expect((await http(undefined, "GET", undefined, "missing")).status).toBe(401);
    expect((await http(undefined, "POST", { taskId: "t", expectedUpdatedAt: V0 }, "b")).status).toBe(404);
  });
  it.each([{}, { taskId: "t" }, { taskId: "t", expectedUpdatedAt: "bad" }, { taskId: "t", expectedUpdatedAt: V0, memberId: "b" }, { taskId: "t", expectedUpdatedAt: Date.parse(V0) }])("rejects invalid link body %j", async body => { expect((await http(undefined, "POST", body)).status).toBe(400); });
  it.each(["?page=0", "?pageSize=21", "?page=501&pageSize=20", "?memberId=b", "?page=1&page=2", "?cursor=abc"])("rejects invalid list query %s", async query => { expect((await http(`/api/goals/g/tasks${query}`)).status).toBe(400); });
  it("has stable numbered pagination and accurate totals", async () => {
    await env.DB.batch(Array.from({ length: 21 }, (_, i) => env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, 'a', ?, '', 'todo', 0, 'medium', 2, 2)").bind(`bulk-${String(i).padStart(2, "0")}`, `Title ${i}`)));
    const first = await page(); const second = await (await http("/api/goals/g/tasks?page=2&pageSize=20")).json<any>();
    expect(first.pagination).toEqual({ page: 1, pageSize: 20, total: 23, totalPages: 2 });
    expect(first.items[0].id).toBe("bulk-20"); expect(second.items.map((row: any) => row.id)).toEqual(["bulk-00", "t2", "t"]);
  });
  it("enforces composite ownership at the database boundary and cascades goal deletion", async () => {
    expect((await link()).status).toBe(200);
    await expect(env.DB.prepare("INSERT INTO goal_tasks (member_id, goal_id, task_id, created_at) VALUES ('a', 'g', 'secret', 1)").run()).rejects.toThrow();
    await env.DB.prepare("DELETE FROM goals WHERE id = 'g'").run();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM goal_tasks").first("n")).toBe(0);
  });
});
