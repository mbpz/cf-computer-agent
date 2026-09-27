/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { ProjectsRepository } from "../../src/projects/repository";
import { ProjectsService } from "../../src/projects/service";
import { GoalsRepository } from "../../src/goals/repository";
import { TasksRepository } from "../../src/tasks/repository";
import { routeProjectsApi } from "../../src/routes/projects";
const service = () => new ProjectsService(new ProjectsRepository(env.DB), { goals: new GoalsRepository(env.DB), tasks: new TasksRepository(env.DB) });
async function route(path: string, method = "GET", body?: unknown, memberId = "a") {
  const request = new Request(`https://app.test/api/projects/${path}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  return routeProjectsApi(request, new URL(request.url), { requestId: "relations" }, { kind: "member", memberId, identitySubject: memberId, email: `${memberId}@test.example`, role: "contributor" }, { projects: service() });
}
describe("member-scoped project relation editor API", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      await service().create(owner, { id: `p-${owner}`, clientKey: `p-${owner}`, title: `Project ${owner}` });
      for (let n = 0; n < 23; n++) {
        const id = `${owner}-${String(n).padStart(2, "0")}`;
        await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 0, 1, 1)").bind(id, owner, id, id).run();
        await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', 1, 1)").bind(id, owner, id).run();
      }
    }
  });
  it.each(["goals", "tasks"])("lists all owned %s with exact project-bound membership and stable numbered pages", async kind => {
    const key = kind === "goals" ? "goalId" : "taskId";
    await route(`p-a/${kind}`, "POST", { [key]: "a-22" });
    const first = await (await route(`p-a/${kind}?page=1&pageSize=20`))!.json() as any;
    const second = await (await route(`p-a/${kind}?page=2&pageSize=20`))!.json() as any;
    expect(first).toMatchObject({ projectId: "p-a", kind, pagination: { page: 1, pageSize: 20, total: 23, totalPages: 2 } });
    expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(3);
    expect(first.items[0]).toEqual({ id: "a-22", title: "a-22", linked: true });
    expect([...first.items, ...second.items].every(row => row.id.startsWith("a-"))).toBe(true);
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(23);
    await service().create("a", { id: "other", clientKey: "other", title: "Other" });
    const other = await (await route(`other/${kind}`))!.json() as any;
    expect(other.items[0].linked).toBe(false);
    const empty = await (await route(`p-a/${kind}?page=3&pageSize=20`))!.json() as any;
    expect(empty.items).toEqual([]); expect(empty.pagination.total).toBe(23);
  });
  it.each([50, 100])("accepts bounded page size %s for both relation kinds", async pageSize => {
    for (const kind of ["goals", "tasks"]) {
      const page = await (await route(`p-a/${kind}?page=1&pageSize=${pageSize}`))!.json() as any;
      expect(page.items).toHaveLength(23);
      expect(page.pagination).toEqual({ page: 1, pageSize, total: 23, totalPages: 1 });
    }
  });
  it.each(["goals", "tasks"])("replays link/unlink %s safely, reads beyond the ten-goal preview, and rejects foreign targets", async kind => {
    const key = kind === "goals" ? "goalId" : "taskId";
    await route(`p-a/${kind}`, "POST", { [key]: "a-00" });
    expect(await (await route(`p-a/${kind}`, "POST", { [key]: "a-00" }))!.json()).toMatchObject({ linked: false });
    const before = await (await route(`p-a/${kind}?page=2&pageSize=20`))!.json() as any;
    expect(before.items.find((row: any) => row.id === "a-00").linked).toBe(true);
    await route(`p-a/${kind}/a-00`, "DELETE"); await route(`p-a/${kind}/a-00`, "DELETE");
    const after = await (await route(`p-a/${kind}?page=2&pageSize=20`))!.json() as any;
    expect(after.items.find((row: any) => row.id === "a-00").linked).toBe(false);
    expect(await service().summary("a", "p-a")).toMatchObject({ goalCount: 0, taskCount: 0 });
    await expect(route(`p-a/${kind}`, "POST", { [key]: "b-00" })).rejects.toMatchObject({ status: 404 });
    await expect(route(`p-a/${kind}/b-00`, "DELETE")).rejects.toMatchObject({ status: 404 });
    await expect(route(`p-a/${kind}`, "GET", undefined, "b")).rejects.toMatchObject({ status: 404 });
  });
  it.each(["memberId=b", "page=0", "pageSize=21", "page=501", "page=1&page=2", "cursor=x", "status=active"])("rejects ambiguous/unbounded list query %s", async query => {
    await expect(route(`p-a/goals?${query}`)).rejects.toMatchObject({ status: 400 });
  });
  it("keeps summary counts accurate after task completion and cascade deletion", async () => {
    await route("p-a/tasks", "POST", { taskId: "a-00" });
    await env.DB.prepare("UPDATE tasks SET status = 'done' WHERE member_id = 'a' AND id = 'a-00'").run();
    expect(await service().summary("a", "p-a")).toMatchObject({ taskCount: 1, completedTaskCount: 1 });
    await env.DB.prepare("DELETE FROM tasks WHERE member_id = 'a' AND id = 'a-00'").run();
    expect(await service().summary("a", "p-a")).toMatchObject({ taskCount: 0, completedTaskCount: 0 });
    const page = await (await route("p-a/tasks"))!.json() as any;
    expect(page.pagination.total).toBe(22);
  });
});
