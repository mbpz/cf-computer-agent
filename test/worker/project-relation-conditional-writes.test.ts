/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { ProjectsRepository } from "../../src/projects/repository";
import { ProjectsService } from "../../src/projects/service";
import { GoalsRepository } from "../../src/goals/repository";
import { TasksRepository } from "../../src/tasks/repository";
import { routeProjectsApi } from "../../src/routes/projects";
const V0 = "2026-09-27T00:00:00.000Z";
let now = Date.parse(V0);
const repository = () => new ProjectsRepository(env.DB);
const service = () => new ProjectsService(repository(), { now: () => new Date(now), goals: new GoalsRepository(env.DB), tasks: new TasksRepository(env.DB) });
const version = async () => (await service().get("a", "p")).updatedAt;
async function write(kind: "goals" | "tasks", linked: boolean, expected: unknown, target = "a", member = "a") {
  const path = `/api/projects/p/${kind}${linked ? "" : `/${target}`}`;
  const request = new Request(`https://app.test${path}`, { method: linked ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(linked ? { [kind === "goals" ? "goalId" : "taskId"]: target } : {}), ...(expected !== undefined ? { expectedUpdatedAt: expected } : {}) }) });
  return routeProjectsApi(request, new URL(request.url), { requestId: "cas" }, { kind: "member", memberId: member, identitySubject: member, email: `${member}@test.example`, role: "contributor" }, { projects: service() });
}
async function linked(kind: "goals" | "tasks") { return (await service().listRelations("a", "p", kind)).items[0]!.linked; }
describe("project relation version preconditions", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS); now = Date.parse(V0);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 0, 1, 1)").bind(owner, owner, owner, owner).run();
      await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', 1, 1)").bind(owner, owner, owner).run();
    }
    await service().create("a", { id: "p", clientKey: "p", title: "Project" });
  });
  it.each(["goals", "tasks"] as const)("rejects stale mixed %s operations including ABA and no-op writes", async kind => {
    await write(kind, true, V0); expect(await linked(kind)).toBe(true);
    expect(await version()).toBe("2026-09-27T00:00:00.001Z");
    await expect(write(kind, false, V0)).rejects.toMatchObject({ status: 409 });
    await write(kind, false, await version()); expect(await linked(kind)).toBe(false);
    await expect(write(kind, true, V0)).rejects.toMatchObject({ status: 409 });
    now -= 10000;
    await write(kind, false, await version()); // even an absent edge consumes the version
    expect(await version()).toBe("2026-09-27T00:00:00.003Z");
    await write(kind, true, await version());
    const fresh = await version(); await write(kind, true, fresh);
    await expect(write(kind, false, fresh)).rejects.toMatchObject({ status: 409 });
    expect(await linked(kind)).toBe(true);
  });
  it.each(["goals", "tasks"] as const)("admits one same-version concurrent %s writer", async kind => {
    const result = await Promise.allSettled([write(kind, true, V0), write(kind, false, V0)]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(result.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect(await linked(kind)).toBe(result[0].status === "fulfilled");
    expect(await version()).toBe("2026-09-27T00:00:00.001Z");
  });
  it.each([undefined, null, "bad", "2026-09-27", 0])("rejects missing/noncanonical version %s for all four mutations", async expected => {
    for (const kind of ["goals", "tasks"] as const) for (const add of [true, false]) await expect(write(kind, add, expected)).rejects.toMatchObject({ status: 400 });
    expect(await version()).toBe(V0);
  });
  it("returns 404 for foreign children/projects before comparing versions", async () => {
    for (const kind of ["goals", "tasks"] as const) for (const add of [true, false]) {
      await expect(write(kind, add, V0, "b")).rejects.toMatchObject({ status: 404 });
      await expect(write(kind, add, V0, "a", "b")).rejects.toMatchObject({ status: 404 });
    }
    expect(await version()).toBe(V0);
  });
  it("shares the project version with status and metadata edits", async () => {
    await write("goals", true, V0);
    await expect(service().setStatus("a", "p", "active", V0)).rejects.toMatchObject({ status: 409 });
    const current = await version(); await service().update("a", "p", { title: "New", expectedUpdatedAt: current });
    await expect(write("tasks", true, current)).rejects.toMatchObject({ status: 409 });
    expect(await linked("tasks")).toBe(false);
  });
  it("exposes the version on member-scoped candidate pages", async () => {
    expect(await service().listRelations("a", "p", "goals")).toMatchObject({ expectedUpdatedAt: V0 });
  });
  it("enforces the version inside the D1 batch, not only the service precheck", async () => {
    await write("goals", true, V0);
    expect(await repository().changeRelation("a", "p", "goals", "a", false, now + 2, now)).toBeNull();
    expect(await linked("goals")).toBe(true);
    expect(await version()).toBe("2026-09-27T00:00:00.001Z");
  });
  it("guards child ownership inside the transaction even without service checks", async () => {
    expect(await repository().changeRelation("a", "p", "tasks", "b", true, now + 1, now)).toBeNull();
    expect(await version()).toBe(V0); expect(await linked("tasks")).toBe(false);
  });
  it("rolls back an inserted edge if the version update fails", async () => {
    await env.DB.exec("CREATE TRIGGER reject_project_version BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT, 'injected version failure'); END;");
    await expect(write("tasks", true, V0)).rejects.toThrow();
    expect(await version()).toBe(V0); expect(await linked("tasks")).toBe(false);
  });
  it("serializes different relation kinds against one project version inside D1", async () => {
    const results = await Promise.all([
      repository().changeRelation("a", "p", "goals", "a", true, now + 1, now),
      repository().changeRelation("a", "p", "tasks", "a", true, now + 1, now),
    ]);
    expect(results.filter(r => r === true)).toHaveLength(1);
    expect(results.filter(r => r === null)).toHaveLength(1);
    expect(await service().summary("a", "p")).toMatchObject({ goalCount: results[0] === true ? 1 : 0, taskCount: results[1] === true ? 1 : 0 });
  });
  it.each(["goals", "tasks"] as const)("rejects extra body keys and query-carried versions on %s writes", async kind => {
    for (const method of ["POST", "DELETE"]) {
      for (const extra of [{ memberId: "b" }, { unexpected: true }]) {
        const url = `https://app.test/api/projects/p/${kind}${method === "DELETE" ? "/a" : ""}`;
        const request = new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: V0, ...(method === "POST" ? { [kind === "goals" ? "goalId" : "taskId"]: "a" } : {}), ...extra }) });
        await expect(routeProjectsApi(request, new URL(url), { requestId: "strict" }, { kind: "member", memberId: "a", identitySubject: "a", email: "a@test.example", role: "contributor" }, { projects: service() })).rejects.toMatchObject({ status: 400 });
      }
      const url = `https://app.test/api/projects/p/${kind}${method === "DELETE" ? "/a" : ""}?expectedUpdatedAt=${encodeURIComponent(V0)}`;
      const request = new Request(url, { method });
      await expect(routeProjectsApi(request, new URL(url), { requestId: "strict" }, { kind: "member", memberId: "a", identitySubject: "a", email: "a@test.example", role: "contributor" }, { projects: service() })).rejects.toMatchObject({ status: 400 });
    }
    expect(await version()).toBe(V0);
  });

});
