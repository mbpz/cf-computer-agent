/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { APP_CONFIG } from "../../src/config";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { InboxRepository } from "../../src/inbox/repository";
import { InboxTaskPromotion } from "../../src/inbox/task-promotion";
import { InboxService } from "../../src/inbox/service";
const tokens: Record<string, string> = {};
async function http(path = "/api/inbox?page=1&pageSize=20", method = "GET", body?: unknown, owner = "a") {
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { method, headers: { cookie: `__Host-memory-session=${tokens[owner] ?? ""}`, origin: "https://memory.crgmhrc.asia", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context); return response;
}
describe("inbox atomic task promotion", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      const members = new MembersRepository(env.DB); tokens[owner] = (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findByIdentitySubject(owner))!)).token;
    }
    await env.DB.batch(Array.from({ length: 47 }, (_, i) => env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, status, created_at, updated_at) VALUES (?, ?, ?, 'text', ?, ?, 1, 1)").bind(`i-${String(i).padStart(3, "0")}`, i < 43 ? "a" : "b", `key-${i}`, `Private ${i}`, i === 42 ? "archived" : "inbox")));
  });
  const version = new Date(1).toISOString();
  const promote = (body: unknown = { expectedUpdatedAt: version }, owner = "a") => http("/api/inbox/i-000/promote/task", "POST", body, owner);
  const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  it("atomically creates an owned task, one audit and a replayable promotion receipt", async () => {
    const response = await promote(); expect(response.status).toBe(200);
    const first = await response.json<any>();
    expect(first).toMatchObject({ promoted: true, item: { status: "promoted", promotedTaskId: first.taskId } });
    expect(Date.parse(first.item.updatedAt)).toBeGreaterThan(1);
    const detail = await http(`/api/tasks/${first.taskId}`);
    expect(detail.status).toBe(200); expect(await detail.json()).toMatchObject({ task: { id: first.taskId, title: "Private 0", notes: "Private 0" } });
    const replay = await promote(); expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ promoted: false, taskId: first.taskId });
    expect(await count("tasks")).toBe(1);
    expect(await env.DB.prepare("SELECT action, actor_id, resource_id, metadata FROM audit_events WHERE action = 'task.created'").all()).toMatchObject({ results: [{ action: "task.created", actor_id: "a", resource_id: first.taskId, metadata: JSON.stringify({ status: "todo", priority: "medium" }) }] });
    expect((await http(`/api/tasks/${first.taskId}`, "GET", undefined, "b")).status).toBe(404);
  });
  it.each(["inbox", "audit"])("rolls back every side effect if %s persistence fails", async fault => {
    await env.DB.exec(fault === "inbox" ? "CREATE TRIGGER fail_promotion BEFORE UPDATE ON inbox_items WHEN NEW.status = 'promoted' BEGIN SELECT RAISE(ABORT, 'promotion failure'); END;" : "CREATE TRIGGER fail_task_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'task.created' BEGIN SELECT RAISE(ABORT, 'audit failure'); END;");
    expect((await promote()).status).toBe(500);
    expect(await count("tasks")).toBe(0);
    expect((await (await http("/api/inbox/i-000")).json<any>()).status).toBe("inbox");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'task.created'").first<any>()).n).toBe(0);
  });
  it.each([{}, { expectedUpdatedAt: "bad" }, { expectedUpdatedAt: version, memberId: "b" }])("rejects invalid promotion input %j before creating a task", async body => {
    expect((await promote(body)).status).toBe(400); expect(await count("tasks")).toBe(0);
  });
  it("rejects stale versions without a task and keeps foreign inbox IDs hidden", async () => {
    expect((await promote({ expectedUpdatedAt: version }, "b")).status).toBe(404);
    await http("/api/inbox/i-000", "PATCH", { status: "archived", expectedUpdatedAt: version });
    expect((await promote()).status).toBe(409); expect(await count("tasks")).toBe(0);
  });
  it("does not adopt an unrelated task using the old predictable ID", async () => {
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES ('inbox-i-000', 'a', 'Unrelated', '', 'todo', 0, 'medium', 1, 1)").run();
    const response = await promote(); expect(response.status).toBe(200);
    const receipt = await response.json<any>(); expect(receipt.taskId).not.toBe("inbox-i-000");
    expect(await count("tasks")).toBe(2);
  });
  it("creates only one task and audit for simultaneous requests", async () => {
    const responses = await Promise.all([promote(), promote()]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const receipts = await Promise.all(responses.map(r => r.json<any>()));
    expect(new Set(receipts.map(r => r.taskId)).size).toBe(1);
    expect(receipts.filter(r => r.promoted)).toHaveLength(1);
    expect(await count("tasks")).toBe(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'task.created'").first<any>()).n).toBe(1);
  });
  it("does not recreate a task after its promoted target has been deleted", async () => {
    const receipt = await (await promote()).json<any>();
    await http(`/api/tasks/${receipt.taskId}`, "DELETE");
    expect((await promote()).status).toBe(422); expect(await count("tasks")).toBe(0);
  });
  it("rejects replay pointing at another member's task", async () => {
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES ('foreign', 'b', 'Hidden', '', 'todo', 0, 'medium', 1, 1)").run();
    await env.DB.prepare("UPDATE inbox_items SET status = 'promoted', promoted_task_id = 'foreign' WHERE id = 'i-000'").run();
    const response = await promote(); expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Hidden"); expect(await count("tasks")).toBe(1);
  });
  it("does not write after the authenticated member is disabled", async () => {
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'a'").run();
    expect((await promote()).status).toBe(403); expect(await count("tasks")).toBe(0);
  });
  it("uses the same conditional boundary as concurrent archive", async () => {
    const [promotion, archive] = await Promise.all([promote(), http("/api/inbox/i-000", "PATCH", { status: "archived", expectedUpdatedAt: version })]);
    const current = await (await http("/api/inbox/i-000")).json<any>();
    if (current.status === "promoted") {
      expect(promotion.status).toBe(200); expect([409, 422]).toContain(archive.status); expect(await count("tasks")).toBe(1);
    } else {
      expect(current.status).toBe("archived"); expect(archive.status).toBe(200); expect(promotion.status).toBe(409); expect(await count("tasks")).toBe(0);
    }
  });
  it("advances a promotion version even with a backward clock", async () => {
    const service = new InboxService(new InboxRepository(env.DB), { now: () => new Date(0), promoteTask: (owner, item, at) => new InboxTaskPromotion(env.DB).promote(owner, item, at) });
    const receipt = await service.promoteTask("a", "i-000", version);
    expect(receipt.item.updatedAt).toBe(new Date(2).toISOString());
    await expect(service.promoteTask("a", "i-000", new Date(3).toISOString())).rejects.toMatchObject({ status: 409 });
  });
  async function seedTasks(owner: string, size: number) {
    await env.DB.prepare("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?) INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) SELECT ? || n, ?, 'Existing', '', 'todo', 0, 'medium', 1, 1 FROM seq").bind(size, `seed-${owner}-`, owner).run();
  }
  it("preserves the per-member task limit without changing Inbox or audit", async () => {
    await seedTasks("a", APP_CONFIG.maxTasksPerMember);
    const response = await promote(); expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "TASK_LIMIT_REACHED" } });
    expect(await count("tasks")).toBe(APP_CONFIG.maxTasksPerMember);
    expect((await (await http("/api/inbox/i-000")).json<any>()).status).toBe("inbox");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'task.created'").first<any>()).n).toBe(0);
  });
  it("serializes the final task quota slot across different Inbox promotions and permits replay at capacity", async () => {
    await seedTasks("a", APP_CONFIG.maxTasksPerMember - 1);
    const responses = await Promise.all([promote(), http("/api/inbox/i-001/promote/task", "POST", { expectedUpdatedAt: version })]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const receipt = await responses.find(r => r.status === 200)!.json<any>();
    expect(await count("tasks")).toBe(APP_CONFIG.maxTasksPerMember);
    const replay = await http(`/api/inbox/${receipt.item.id}/promote/task`, "POST", { expectedUpdatedAt: version });
    expect(replay.status).toBe(200); expect(await replay.json()).toMatchObject({ promoted: false, taskId: receipt.taskId });
  });
  it("does not apply another member's task quota to this promotion", async () => {
    await seedTasks("b", APP_CONFIG.maxTasksPerMember);
    expect((await promote()).status).toBe(200);
  });
  it("preserves task input limits instead of silently truncating notes", async () => {
    await env.DB.prepare("UPDATE inbox_items SET content = ? WHERE id = 'i-000'").bind("x".repeat(100001)).run();
    expect((await promote()).status).toBe(400); expect(await count("tasks")).toBe(0);
    expect((await (await http("/api/inbox/i-000")).json<any>()).status).toBe("inbox");
  });

});
