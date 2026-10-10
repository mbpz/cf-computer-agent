/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRepository } from "../../src/tasks/repository";
import { TasksService } from "../../src/tasks/service";
import { MIGRATIONS } from "../fixtures/d1";

const VERSION = new Date(1).toISOString();
const NEXT = new Date(100).toISOString();
type Operation = "tags" | "link" | "unlink";
const operations = ["tags", "link", "unlink"] as const;

describe("task tags and knowledge links are atomic with their version", () => {
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
    for (const [id, memberId] of [["task-a", "member-a"], ["task-private", "member-b"]]) {
      await repository.insert({ id: id!, memberId: memberId!, title: id!, notes: "", priority: "medium", dueAt: null, createdAt: 1, updatedAt: 1 });
    }
    await seedKnowledge("member-a");
    await repository.replaceTags("member-a", "task-a", ["original"]);
  });

  async function snapshot() {
    const task = await repository.findOwned("member-a", "task-a");
    return { updatedAt: task!.updatedAt, tags: await repository.listTags("member-a", "task-a"), links: await repository.listLinks("member-a", "task-a") };
  }
  async function seedLink() {
    await repository.insertLink({ id: "link-a", memberId: "member-a", taskId: "task-a", knowledgeItemId: "knowledge-a", createdAt: 1 });
  }
  async function mutate(operation: Operation, expected: string | undefined = VERSION) {
    if (operation === "tags") return service.replaceTags("member-a", "task-a", ["alpha", "beta"], expected);
    if (operation === "link") return service.addLink("member-a", "task-a", "knowledge-a", expected);
    return service.removeLink("member-a", "task-a", "link-a", expected);
  }

  it.each(operations)("%s storage failure preserves the original version and supports the same request retry", async (operation) => {
    if (operation === "unlink") await seedLink();
    const before = await snapshot();
    await env.DB.exec(`CREATE TRIGGER fail_relation BEFORE ${operation === "unlink" ? "DELETE" : "INSERT"} ON ${operation === "tags" ? "task_tags" : "task_links"} ${operation === "tags" ? "WHEN NEW.tag = 'beta'" : ""} BEGIN SELECT RAISE(ABORT, 'injected relation failure'); END`);
    await expect(mutate(operation)).rejects.toThrow("injected relation failure");
    expect(await snapshot()).toEqual(before);
    await env.DB.exec("DROP TRIGGER fail_relation");
    await mutate(operation);
    expect((await snapshot()).updatedAt).toBe(NEXT);
    if (operation === "tags") expect((await snapshot()).tags).toEqual(["alpha", "beta"]);
    else expect((await snapshot()).links).toHaveLength(operation === "link" ? 1 : 0);
  });

  it.each(operations)("%s relation changes roll back when the parent update fails", async (operation) => {
    if (operation === "unlink") await seedLink();
    const before = await snapshot();
    await env.DB.exec("CREATE TRIGGER fail_parent BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, 'injected parent failure'); END");
    await expect(mutate(operation)).rejects.toThrow("injected parent failure");
    expect(await snapshot()).toEqual(before);
    await env.DB.exec("DROP TRIGGER fail_parent");
    await mutate(operation);
    expect((await snapshot()).updatedAt).toBe(NEXT);
  });

  it.each(operations.flatMap((operation) => [100, 200].map((concurrentVersion) => ({ operation, concurrentVersion }))))("$operation rejects a version race at the actual relation mutation ($concurrentVersion)", async ({ operation, concurrentVersion }) => {
    if (operation === "unlink") await seedLink();
    const before = await snapshot();
    const changeParent = () => env.DB.prepare("UPDATE tasks SET updated_at = ? WHERE id = 'task-a'").bind(concurrentVersion).run();
    if (operation === "tags") {
      const original = repository.replaceTags.bind(repository);
      vi.spyOn(repository, "replaceTags").mockImplementationOnce(async (...args) => { await changeParent(); return original(...args); });
    } else if (operation === "link") {
      const original = repository.insertLink.bind(repository);
      vi.spyOn(repository, "insertLink").mockImplementationOnce(async (...args) => { await changeParent(); return original(...args); });
    } else {
      const original = repository.deleteLink.bind(repository);
      vi.spyOn(repository, "deleteLink").mockImplementationOnce(async (...args) => { await changeParent(); return original(...args); });
    }
    await expect(mutate(operation)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    expect(await snapshot()).toEqual({ ...before, updatedAt: new Date(concurrentVersion).toISOString() });
  });

  it("an empty tag replacement is versioned and rolls back after its DELETE if the parent update fails", async () => {
    const before = await snapshot();
    await env.DB.exec("CREATE TRIGGER fail_parent BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, 'injected parent failure'); END");
    await expect(service.replaceTags("member-a", "task-a", [], VERSION)).rejects.toThrow("injected parent failure");
    expect(await snapshot()).toEqual(before);
    await env.DB.exec("DROP TRIGGER fail_parent");
    expect(await service.replaceTags("member-a", "task-a", [], VERSION)).toEqual([]);
    expect((await snapshot()).updatedAt).toBe(NEXT);
    expect(await service.replaceTags("member-a", "task-a", [], VERSION)).toEqual([]);
    expect((await snapshot()).updatedAt).toBe(NEXT);
  });

  it.each([
    "UPDATE revisions SET visibility = 'admin_only' WHERE id = 'task-revision'",
    "UPDATE knowledge_items SET status = 'trashed' WHERE id = 'knowledge-a'",
    "UPDATE spaces SET status = 'disabled' WHERE id = 'default'",
  ])("rechecks knowledge visibility at link insertion: %s", async (sql) => {
    const original = repository.insertLink.bind(repository);
    vi.spyOn(repository, "insertLink").mockImplementationOnce(async (...args) => { await env.DB.prepare(sql).run(); return original(...args); });
    await expect(mutate("link")).rejects.toMatchObject({ code: "TASK_KNOWLEDGE_NOT_FOUND", status: 404 });
    expect((await snapshot()).links).toEqual([]);
    expect((await snapshot()).updatedAt).toBe(VERSION);
  });

  it("rechecks link capacity at insertion without consuming a version", async () => {
    for (let i = 0; i < 5; i += 1) {
      await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, status, search_status, created_at, updated_at) VALUES (?, 'default', 'active', 'pending', ?, ?)").bind(`capacity-${i}`, VERSION, VERSION).run();
    }
    const original = repository.insertLink.bind(repository);
    vi.spyOn(repository, "insertLink").mockImplementationOnce(async (...args) => {
      for (let i = 0; i < 5; i += 1) {
        await env.DB.prepare("INSERT INTO task_links (id, member_id, task_id, knowledge_item_id, created_at) VALUES (?, 'member-a', 'task-a', ?, 1)").bind(`capacity-link-${i}`, `capacity-${i}`).run();
      }
      return original(...args);
    });
    await expect(mutate("link")).rejects.toMatchObject({ code: "TASK_LINK_LIMIT", status: 409 });
    expect((await snapshot()).links).toHaveLength(5);
    expect((await snapshot()).updatedAt).toBe(VERSION);
  });

  it("different tag replacements cannot both win the same version", async () => {
    const results = await Promise.allSettled([
      service.replaceTags("member-a", "task-a", ["one"], VERSION),
      service.replaceTags("member-a", "task-a", ["two"], VERSION),
    ]);
    const winner = results.find((result) => result.status === "fulfilled");
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "TASK_VERSION_CONFLICT", status: 409 } });
    expect((await snapshot()).tags).toEqual(winner?.status === "fulfilled" ? winner.value : null);
    expect((await snapshot()).updatedAt).toBe(NEXT);
  });

  it.each(["tags", "link"] as const)("concurrent identical %s requests converge without a second version advance", async (operation) => {
    const results = await Promise.all([mutate(operation), mutate(operation)]);
    expect(results[0]).toEqual(results[1]);
    const after = await snapshot();
    expect(after.updatedAt).toBe(NEXT);
    if (operation === "tags") expect(after.tags).toEqual(["alpha", "beta"]);
    else expect(after.links).toHaveLength(1);
    await mutate(operation);
    expect(await snapshot()).toEqual(after);
  });

  it("replaces an initially empty tag set without relying on the DELETE row count", async () => {
    await repository.replaceTags("member-a", "task-a", []);
    await mutate("tags");
    expect((await snapshot()).tags).toEqual(["alpha", "beta"]);
    expect((await snapshot()).updatedAt).toBe(NEXT);
  });

  it("unversioned legacy requests still advance a monotonic version for each mutation", async () => {
    await service.replaceTags("member-a", "task-a", ["alpha", "beta"]);
    expect((await snapshot()).updatedAt).toBe(NEXT);
    const link = await service.addLink("member-a", "task-a", "knowledge-a");
    expect((await snapshot()).updatedAt).toBe(new Date(101).toISOString());
    await service.removeLink("member-a", "task-a", link.id);
    expect((await snapshot()).updatedAt).toBe(new Date(102).toISOString());
    expect((await snapshot()).links).toEqual([]);
  });

  it("a duplicate link no-op and an absent-link DELETE do not consume a version", async () => {
    await seedLink();
    const before = await snapshot();
    const guard = { expectedUpdatedAt: 1, updatedAt: 100 };
    expect(await repository.insertLink({ id: "duplicate", memberId: "member-a", taskId: "task-a", knowledgeItemId: "knowledge-a", createdAt: 100 }, guard)).toBe(false);
    expect(await repository.deleteLink("member-a", "task-a", "missing", guard)).toBe(false);
    expect(await repository.deleteLink("member-b", "task-a", "link-a", guard)).toBe(false);
    expect(await repository.replaceTags("member-b", "task-a", ["intruder"], guard)).toBe(false);
    expect(await repository.insertLink({ id: "intruder", memberId: "member-b", taskId: "task-a", knowledgeItemId: "knowledge-a", createdAt: 100 }, guard)).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("keeps cross-member requests out of both relation and version writes", async () => {
    await seedLink();
    const before = await snapshot();
    await expect(service.replaceTags("member-b", "task-a", [], VERSION)).rejects.toMatchObject({ status: 404 });
    await expect(service.addLink("member-b", "task-a", "knowledge-a", VERSION)).rejects.toMatchObject({ status: 404 });
    await expect(service.removeLink("member-b", "task-a", "link-a", VERSION)).rejects.toMatchObject({ status: 404 });
    expect(await snapshot()).toEqual(before);
  });
});

async function seedKnowledge(ownerId: string): Promise<void> {
  const hash = "c".repeat(64);
  const now = "2026-01-01T00:00:00.000Z";
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('task-submission', ?, 'default', 'markdown', 'published', 'Alpha Guide', '# Alpha', ?, ?)").bind(ownerId, now, now).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('task-source', ?, 'default', 'markdown', 'Alpha Guide', ?, ?)").bind(ownerId, now, now).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('task-source-version', 'task-source', 'task-submission', 1, '# Alpha', ?, 'm1-v1', ?)").bind(hash, now).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-a', 'default', NULL, 'active', 'indexed', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('task-revision', 'knowledge-a', 'task-source-version', '/workspace/published/default/knowledge-a/revision.md', ?, 'Alpha Guide', '[]', 'shared', ?, ?)").bind(hash, ownerId, now).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'task-revision' WHERE id = 'knowledge-a'").run();
}
