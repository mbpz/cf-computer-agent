/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRepository } from "../../src/tasks/repository";
import { TasksService } from "../../src/tasks/service";
import { MIGRATIONS } from "../fixtures/d1";

const VERSION = new Date(100).toISOString();
describe("subtask ordering and safe retries in real D1", () => {
  let repository: TasksRepository;
  let service: TasksService;
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const member of ["member-a", "member-b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?)")
        .bind(member, member, `${member}@example.test`, VERSION, VERSION).run();
    }
    repository = new TasksRepository(env.DB);
    service = new TasksService(repository, { now: () => new Date(100) });
    for (const [id, memberId] of [["task-a", "member-a"], ["task-b", "member-a"], ["task-private", "member-b"]]) {
      await repository.insert({ id: id!, memberId: memberId!, title: id!, notes: "", priority: "medium", dueAt: null, createdAt: 1, updatedAt: 1 });
    }
  });
  const create = (id: string, position: number) => service.createSubtask("member-a", "task-a", { id, title: id, position });
  const list = () => repository.listSubtasks("member-a", "task-a");

  it("reports an occupied create position as conflict, not a missing task", async () => {
    await create("first", 1);
    await expect(create("second", 1)).rejects.toMatchObject({ status: 409, code: "TASK_VERSION_CONFLICT" });
    expect(await list()).toMatchObject([{ id: "first", position: 1, updatedAt: VERSION }]);
    await service.deleteSubtask("member-a", "task-a", "first", VERSION);
    expect(await create("second", 1)).toMatchObject({ created: true, subtask: { id: "second", position: 1 } });
  });

  it.each([VERSION, undefined])("rejects an occupied update position without changing any fields (%s)", async (expectedUpdatedAt) => {
    await create("first", 0); await create("second", 1);
    const before = await list();
    await expect(service.updateSubtask("member-a", "task-a", "first", { title: "Moved", status: "done", position: 1, expectedUpdatedAt }))
      .rejects.toMatchObject({ status: 409, code: "TASK_VERSION_CONFLICT" });
    expect(await list()).toEqual(before);
  });

  it("only one different create wins an occupied position under concurrency", async () => {
    const results = await Promise.allSettled([create("first", 2), create("second", 2)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect(await list()).toHaveLength(1);
  });

  it("same-id concurrent creates and retries produce one row and preserve its version", async () => {
    const results = await Promise.all([create("same", 7), create("same", 7)]);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(await create("same", 7)).toMatchObject({ created: false, subtask: { position: 7, updatedAt: VERSION } });
    expect(await list()).toHaveLength(1);
  });

  it("does not turn a deleted parent between preflight and insertion into a database error", async () => {
    const original = repository.insertSubtask.bind(repository);
    vi.spyOn(repository, "insertSubtask").mockImplementationOnce(async (...args) => {
      await repository.delete("member-a", "task-a");
      return original(...args);
    });
    await expect(create("orphan", 0)).rejects.toMatchObject({ status: 404, code: "TASK_NOT_FOUND" });
    expect(await list()).toEqual([]);
  });

  it("checks occupancy atomically when another writer fills the requested update slot", async () => {
    await create("first", 0);
    const original = repository.updateSubtask.bind(repository);
    vi.spyOn(repository, "updateSubtask").mockImplementationOnce(async (...args) => {
      await create("competitor", 2);
      return original(...args);
    });
    await expect(service.updateSubtask("member-a", "task-a", "first", { title: "Moved", status: "doing", position: 2, expectedUpdatedAt: VERSION }))
      .rejects.toMatchObject({ status: 409 });
    expect(await list()).toMatchObject([{ id: "first", title: "first", position: 0, updatedAt: VERSION }, { id: "competitor", position: 2 }]);
  });

  it("keeps sparse ordering after delete, insert, move, and same-version retry", async () => {
    await create("first", 0); await create("last", 8);
    await service.deleteSubtask("member-a", "task-a", "first", VERSION);
    await create("new", 9);
    const input = { title: "Moved", status: "doing", position: 3, expectedUpdatedAt: VERSION };
    const result = await service.updateSubtask("member-a", "task-a", "new", input);
    expect(await service.updateSubtask("member-a", "task-a", "new", input)).toEqual(result);
    expect(await list()).toMatchObject([{ id: "new", position: 3 }, { id: "last", position: 8 }]);
  });


  it("rolls back failed storage and accepts an unchanged id and position retry", async () => {
    await create("old", 8);
    await env.DB.exec("CREATE TRIGGER fail_subtask BEFORE INSERT ON task_subtasks BEGIN SELECT RAISE(ABORT, 'injected subtask failure'); END");
    await expect(create("new", 9)).rejects.toThrow("injected subtask failure");
    expect(await list()).toMatchObject([{ id: "old", position: 8 }]);
    await env.DB.exec("DROP TRIGGER fail_subtask");
    expect(await create("new", 9)).toMatchObject({ created: true, subtask: { id: "new", position: 9 } });
    expect(await create("new", 9)).toMatchObject({ created: false });
    expect(await list()).toHaveLength(2);
  });

  it("allows only one competing move against the same version", async () => {
    await create("first", 0);
    const results = await Promise.allSettled([1, 2].map((position) => service.updateSubtask("member-a", "task-a", "first", {
      title: `Move ${position}`, status: "doing", position, expectedUpdatedAt: VERSION,
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.updatedAt).toBe(new Date(101).toISOString());
  });

  it("does not reveal another member or task through a colliding subtask id", async () => {
    await service.createSubtask("member-b", "task-private", { id: "private", title: "Private", position: 0 });
    await service.createSubtask("member-a", "task-b", { id: "other-task", title: "Other", position: 0 });
    for (const id of ["private", "other-task"]) await expect(create(id, 0)).rejects.toMatchObject({ status: 404 });
    await expect(service.updateSubtask("member-b", "task-a", "private", { title: "Unauthorized", position: 0 })).rejects.toMatchObject({ status: 404 });
    expect(await list()).toEqual([]);
  });
});
