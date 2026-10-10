/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRepository } from "../../src/tasks/repository";
import { TasksService } from "../../src/tasks/service";
import { MIGRATIONS } from "../fixtures/d1";

const VERSION = new Date(1).toISOString();
const NEXT = new Date(100).toISOString();

describe("dependency mutation and parent version are atomic", () => {
  let repository: TasksRepository;
  let service: TasksService;

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    for (const member of ["member-a", "member-b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?)")
        .bind(member, member, `${member}@example.test`, VERSION, VERSION).run();
    }
    repository = new TasksRepository(env.DB);
    service = new TasksService(repository, { now: () => new Date(100) });
    for (const [id, memberId] of [["task-a", "member-a"], ["task-b", "member-a"], ["task-c", "member-a"], ["task-private", "member-b"]]) {
      await repository.insert({ id: id!, memberId: memberId!, title: id!, notes: "", priority: "medium", dueAt: null, createdAt: 1, updatedAt: 1 });
    }
  });

  async function version() { return (await repository.findOwned("member-a", "task-a"))!.updatedAt; }
  async function seedEdge() { await repository.insertDependency({ memberId: "member-a", taskId: "task-a", dependsOnTaskId: "task-b", createdAt: 1 }); }
  async function mutate(operation: "add" | "remove", expected = VERSION) {
    return operation === "add"
      ? service.addDependency("member-a", "task-a", "task-b", expected)
      : service.removeDependency("member-a", "task-a", "task-b", expected);
  }

  it.each(["add", "remove"] as const)("%s failure does not consume the version and the identical request can retry", async (operation) => {
    if (operation === "remove") await seedEdge();
    await env.DB.exec(`CREATE TRIGGER fail_dependency BEFORE ${operation === "add" ? "INSERT" : "DELETE"} ON task_dependencies BEGIN SELECT RAISE(ABORT, 'injected dependency failure'); END`);
    await expect(mutate(operation)).rejects.toThrow("injected dependency failure");
    expect(await version()).toBe(VERSION);
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(operation === "add" ? 0 : 1);
    await env.DB.exec("DROP TRIGGER fail_dependency");
    await mutate(operation);
    expect(await version()).toBe(NEXT);
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(operation === "add" ? 1 : 0);
  });

  it.each(["add", "remove"] as const)("%s rolls back the relation if the parent update fails", async (operation) => {
    if (operation === "remove") await seedEdge();
    await env.DB.exec("CREATE TRIGGER fail_parent BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, 'injected parent failure'); END");
    await expect(mutate(operation)).rejects.toThrow("injected parent failure");
    expect(await version()).toBe(VERSION);
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(operation === "add" ? 0 : 1);
    await env.DB.exec("DROP TRIGGER fail_parent");
    await mutate(operation);
    expect(await version()).toBe(NEXT);
  });

  it.each(["add", "remove"] as const)("%s rechecks the version at the relation write, not just the service preflight", async (operation) => {
    if (operation === "remove") await seedEdge();
    if (operation === "add") {
      const original = repository.insertDependency.bind(repository);
      vi.spyOn(repository, "insertDependency").mockImplementationOnce(async (...args) => {
        await env.DB.prepare("UPDATE tasks SET updated_at = 200 WHERE id = 'task-a'").run();
        return original(...args);
      });
    } else {
      const original = repository.deleteDependency.bind(repository);
      vi.spyOn(repository, "deleteDependency").mockImplementationOnce(async (...args) => {
        await env.DB.prepare("UPDATE tasks SET updated_at = 200 WHERE id = 'task-a'").run();
        return original(...args);
      });
    }
    await expect(mutate(operation)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    expect(await version()).toBe(new Date(200).toISOString());
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(operation === "add" ? 0 : 1);
  });

  it("only one different dependency wins the same parent version", async () => {
    const results = await Promise.allSettled([
      service.addDependency("member-a", "task-a", "task-b", VERSION),
      service.addDependency("member-a", "task-a", "task-c", VERSION),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "TASK_VERSION_CONFLICT", status: 409 } });
    expect(await version()).toBe(NEXT);
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(1);
  });

  it("concurrent identical adds converge without consuming a second version", async () => {
    const results = await Promise.all([mutate("add"), mutate("add")]);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ created: true }), expect.objectContaining({ created: false }),
    ]));
    expect(await version()).toBe(NEXT);
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(1);
  });

  it("repository duplicate and absent-row no-ops never advance the parent version", async () => {
    await seedEdge();
    const guard = { expectedUpdatedAt: 1, updatedAt: 100 };
    expect(await repository.insertDependency({ memberId: "member-a", taskId: "task-a", dependsOnTaskId: "task-b", createdAt: 100 }, guard)).toBe(false);
    expect(await version()).toBe(VERSION);
    expect(await repository.deleteDependency("member-a", "task-a", "task-c", guard)).toBe(false);
    expect(await version()).toBe(VERSION);
    expect(await repository.deleteDependency("member-b", "task-a", "task-b", guard)).toBe(false);
    expect(await repository.insertDependency({ memberId: "member-b", taskId: "task-a", dependsOnTaskId: "task-private", createdAt: 100 }, guard)).toBe(false);
    expect(await version()).toBe(VERSION);
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(1);
  });

  it("preserves the existing unversioned API behavior", async () => {
    expect(await service.addDependency("member-a", "task-a", "task-b")).toMatchObject({ created: true });
    expect(await version()).toBe(VERSION);
    await service.removeDependency("member-a", "task-a", "task-b");
    expect(await version()).toBe(VERSION);
    expect(await repository.listDependencies("member-a", "task-a")).toEqual([]);
  });

  it("replays the same add without bumping the version, then permits versioned removal", async () => {
    expect(await mutate("add")).toMatchObject({ created: true });
    expect(await mutate("add")).toMatchObject({ created: false });
    expect(await version()).toBe(NEXT);
    await mutate("remove", NEXT);
    expect(await version()).toBe(new Date(101).toISOString());
    await expect(mutate("remove", NEXT)).rejects.toMatchObject({ code: "TASK_DEPENDENCY_NOT_FOUND", status: 404 });
    expect(await version()).toBe(new Date(101).toISOString());
  });

  it("denies cross-member edges and writes without touching either owner", async () => {
    await expect(service.addDependency("member-a", "task-a", "task-private", VERSION)).rejects.toMatchObject({ status: 404 });
    await expect(service.addDependency("member-b", "task-a", "task-private", VERSION)).rejects.toMatchObject({ status: 404 });
    await seedEdge();
    await expect(service.removeDependency("member-b", "task-a", "task-b", VERSION)).rejects.toMatchObject({ status: 404 });
    expect(await version()).toBe(VERSION);
    expect((await repository.findOwned("member-b", "task-private"))!.updatedAt).toBe(VERSION);
    expect(await repository.listDependencies("member-a", "task-a")).toHaveLength(1);
  });
});
