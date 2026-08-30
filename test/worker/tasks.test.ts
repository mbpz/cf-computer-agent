/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRepository } from "../../src/tasks/repository";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import type { TaskCreate, TaskLinkInsert } from "../../src/tasks/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = 1_777_777_000_000; // 2026-05-02T00:30:00.000Z (固定值,due 过滤断言用)
const DAY = 86_400_000;

describe("tasks repository", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
    // The due filter derives day boundaries from the wall clock; pin it to NOW
    // so the "today"/"overdue" assertions are deterministic.
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("inserts once, treats duplicate ids as ignored, and keeps owners isolated", async () => {
    const repository = new TasksRepository(env.DB);
    const input = taskCreate({ id: "task-a", memberId: "member-a" });
    expect(await repository.insert(input)).toBe(true);
    expect(await repository.insert(taskCreate({ id: "task-a", memberId: "member-a", title: "replay" }))).toBe(false);
    expect((await repository.findOwned("member-a", "task-a"))?.title).toBe("Test task");
    expect(await repository.findOwned("member-b", "task-a")).toBeNull();
    expect(await repository.countByMember("member-a")).toBe(1);
  });

  it("lists with status/tag/due/q filters and stable numbered pages", async () => {
    const repository = new TasksRepository(env.DB);
    await seedTasks(repository);
    const all = await repository.list("member-a", { page: 1, pageSize: 20, filters: {} });
    expect(all.items).toHaveLength(4);
    expect(all.pagination.total).toBe(4);
    const doing = await repository.list("member-a", { page: 1, pageSize: 20, filters: { status: "doing" } });
    expect(doing.items.map((task) => task.id)).toEqual(["task-2"]);
    const tagged = await repository.list("member-a", { page: 1, pageSize: 20, filters: { tag: "urgent" } });
    expect(tagged.items.map((task) => task.id)).toEqual(["task-1"]);
    const overdue = await repository.list("member-a", { page: 1, pageSize: 20, filters: { due: "overdue" } });
    expect(overdue.items.map((task) => task.id)).toEqual(["task-3"]);
    const today = await repository.list("member-a", { page: 1, pageSize: 20, filters: { due: "today" } });
    expect(today.items.map((task) => task.id)).toEqual(["task-2"]);
    const noDue = await repository.list("member-a", { page: 1, pageSize: 20, filters: { due: "none" } });
    expect(noDue.items.map((task) => task.id)).toEqual(["task-4"]);
    const searched = await repository.list("member-a", { page: 1, pageSize: 20, filters: { q: "alpha" } });
    expect(searched.items.map((task) => task.id)).toEqual(["task-1"]);
    const paged = await repository.list("member-a", { page: 1, pageSize: 20, filters: {} });
    expect(paged.items.map((task) => task.id)).toEqual(["task-4", "task-3", "task-2", "task-1"]);
    const beyond = await repository.list("member-a", { page: 2, pageSize: 20, filters: {} });
    expect(beyond.items).toEqual([]);
    expect(beyond.pagination).toEqual({ page: 2, pageSize: 20, total: 4, totalPages: 1 });
  });

  it("uses the task id as a deterministic tie-breaker across numbered pages", async () => {
    const repository = new TasksRepository(env.DB);
    for (let index = 0; index < 21; index += 1) {
      await repository.insert(taskCreate({
        id: `task-tie-${String(index).padStart(2, "0")}`,
        memberId: "member-a",
        createdAt: NOW,
        updatedAt: NOW,
      }));
    }

    const first = await repository.list("member-a", { page: 1, pageSize: 20, filters: {} });
    const second = await repository.list("member-a", { page: 2, pageSize: 20, filters: {} });
    const ids = [...first.items, ...second.items].map((task) => task.id);

    expect(first.pagination).toEqual({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    expect(second.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
    expect(ids).toEqual(Array.from({ length: 21 }, (_unused, index) => `task-tie-${String(20 - index).padStart(2, "0")}`));
    expect(new Set(ids).size).toBe(21);
  });

  it("summarizes status counts, due-today and overdue for open tasks only", async () => {
    const repository = new TasksRepository(env.DB);
    await seedTasks(repository);
    const summary = await repository.summary("member-a", new Date(NOW));
    expect(summary).toEqual({ todo: 2, doing: 1, blocked: 0, done: 1, canceled: 0, dueToday: 1, overdue: 1 });
  });

  it("allocates one stable status intent for the CAS winner and scopes delivery to its recipient", async () => {
    const repository = new TasksRepository(env.DB);
    await repository.insert(taskCreate({ id: "task-intent", memberId: "member-a" }));

    await expect(repository.compareAndSetStatus(
      "member-a", "task-intent", "todo", "doing", null, 0, NOW + 1,
    )).resolves.toBe(true);
    await expect(repository.compareAndSetStatus(
      "member-a", "task-intent", "todo", "doing", null, 0, NOW + 2,
    )).resolves.toBe(false);
    await expect(repository.listPendingStatusNotifications("member-b", "task-intent", 10)).resolves.toEqual([]);
    await expect(repository.listPendingStatusNotifications("member-a", "task-intent", 10)).resolves.toEqual([{
      id: "task-status:task-intent:todo:doing:v1",
      recipientMemberId: "member-a",
      taskId: "task-intent",
      previousStatus: "todo",
      status: "doing",
      deduplicationKey: "task:task-intent:status:todo:doing:v1",
      createdAt: new Date(NOW + 1).toISOString(),
    }]);
    await expect(repository.markStatusNotificationDelivered("member-b", "task-status:task-intent:todo:doing:v1", NOW + 2)).resolves.toBe(false);
    await expect(repository.markStatusNotificationDelivered("member-a", "task-status:task-intent:todo:doing:v1", NOW + 2)).resolves.toBe(true);
    await expect(repository.markStatusNotificationDelivered("member-a", "task-status:task-intent:todo:doing:v1", NOW + 3)).resolves.toBe(false);
    await expect(repository.listPendingStatusNotifications("member-a", "task-intent", 10)).resolves.toEqual([]);
  });

  it("replaces tags, keeps them member-scoped, and cascades on delete", async () => {
    const repository = new TasksRepository(env.DB);
    await repository.insert(taskCreate({ id: "task-1", memberId: "member-a" }));
    await repository.replaceTags("member-a", "task-1", ["urgent", "reading"]);
    await repository.replaceTags("member-a", "task-1", ["urgent"]);
    expect(await repository.listTags("member-a", "task-1")).toEqual(["urgent"]);
    expect(await repository.listTags("member-b", "task-1")).toEqual([]);
    expect(await repository.delete("member-a", "task-1")).toBe(true);
    expect(await repository.countByMember("member-a")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM task_tags").first<{ n: number }>()).toMatchObject({ n: 0 });
  });

  it("inserts links idempotently and resolves knowledge visibility", async () => {
    await seedKnowledge("member-a");
    const repository = new TasksRepository(env.DB);
    await repository.insert(taskCreate({ id: "task-1", memberId: "member-a" }));
    const link = linkInsert({ id: "link-1", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a" });
    expect(await repository.insertLink(link)).toBe(true);
    expect(await repository.insertLink(linkInsert({ id: "link-2", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a" }))).toBe(false);
    expect(await repository.countLinks("member-a", "task-1")).toBe(1);
    expect(await repository.findLink("member-a", "task-1", "knowledge-a")).toMatchObject({ id: "link-1", knowledgeTitle: "Alpha Guide" });
    expect(await repository.listLinks("member-a", "task-1")).toHaveLength(1);
    expect(await repository.isKnowledgeVisible("member-a", "knowledge-a")).toBe(true);
    expect(await repository.isKnowledgeVisible("member-b", "knowledge-a")).toBe(true); // shared 对所有成员可见
    expect(await repository.isKnowledgeVisible("member-a", "knowledge-missing")).toBe(false);
    expect(await repository.deleteLink("member-a", "task-1", "link-1")).toBe(true);
    expect(await repository.deleteLink("member-a", "task-1", "link-1")).toBe(false);
  });
});

describe("tasks HTTP contract", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
    await seedKnowledge("member-a");
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date() });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-b"))!)).token;
  });

  it("creates idempotently, lists, updates, transitions, and deletes", async () => {
    const created = await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha", priority: "high", dueAt: "2026-08-30T00:00:00.000Z" }) });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ task: { id: "task-1", title: "Alpha", status: "todo", priority: "high" }, created: true });
    const replay = await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha" }) });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ created: false });
    await expect((await api("/api/tasks?page=1&pageSize=20", sessionA)).json()).resolves.toMatchObject({ items: [{ id: "task-1" }], pagination: { total: 1 } });
    await expect((await api("/api/tasks/summary", sessionA)).json()).resolves.toMatchObject({ todo: 1 });
    await expect((await api("/api/tasks/task-1", sessionA)).json()).resolves.toMatchObject({ task: { id: "task-1" }, tags: [], links: [] });
    const patched = await api("/api/tasks/task-1", sessionA, { method: "PATCH", body: JSON.stringify({ title: "Alpha v2", notes: "note", priority: "low", dueAt: null }) });
    expect(await patched.json()).toMatchObject({ title: "Alpha v2", priority: "low", dueAt: null });
    const status = await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) });
    expect(await status.json()).toMatchObject({ status: "doing" });
    const progress = await api("/api/tasks/task-1/progress", sessionA, { method: "POST", body: JSON.stringify({ progress: 40 }) });
    expect(await progress.json()).toMatchObject({ progress: 40 });
    const tags = await api("/api/tasks/task-1/tags", sessionA, { method: "PUT", body: JSON.stringify({ tags: ["urgent"] }) });
    expect(await tags.json()).toEqual({ tags: ["urgent"] });
    const linked = await api("/api/tasks/task-1/links", sessionA, { method: "POST", body: JSON.stringify({ knowledgeItemId: "knowledge-a" }) });
    expect(await linked.json()).toMatchObject({ link: { knowledgeItemId: "knowledge-a", knowledgeTitle: "Alpha Guide" } });
    const detail = await api("/api/tasks/task-1", sessionA);
    expect(await detail.json()).toMatchObject({ tags: ["urgent"], links: [{ knowledgeItemId: "knowledge-a" }] });
    const linkId = ((await (await api("/api/tasks/task-1", sessionA)).json()) as { links: Array<{ id: string }> }).links[0]!.id;
    expect((await api(`/api/tasks/task-1/links/${linkId}`, sessionA, { method: "DELETE" })).status).toBe(204);
    expect((await api("/api/tasks/task-1", sessionA, { method: "DELETE" })).status).toBe(204);
    expect((await api("/api/tasks?page=1&pageSize=20", sessionA)).status).toBe(200);
  });

  it("strictly paginates every task filter without leaking another member's total", async () => {
    const today = Date.now() - (Date.now() % DAY) + 3_600_000;
    await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-a", title: "Alpha", priority: "high", dueAt: new Date(today).toISOString() }) });
    await api("/api/tasks", sessionB, { method: "POST", body: JSON.stringify({ id: "task-b", title: "Alpha", priority: "high" }) });
    await api("/api/tasks/task-a/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) });
    await api("/api/tasks/task-a/tags", sessionA, { method: "PUT", body: JSON.stringify({ tags: ["urgent"] }) });
    for (const query of ["status=doing", "priority=high", "tag=urgent", "due=today", "q=Alpha"]) {
      const response = await api(`/api/tasks?page=1&pageSize=20&${query}`, sessionA);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ items: [{ id: "task-a", memberId: "member-a" }], pagination: { total: 1 } });
    }
    const beyond = await api("/api/tasks?page=2&pageSize=20&status=doing", sessionA);
    await expect(beyond.json()).resolves.toMatchObject({ items: [], pagination: { page: 2, pageSize: 20, total: 1, totalPages: 1 } });
    for (const path of [
      "/api/tasks?cursor=bad",
      "/api/tasks?page=1&page=2",
      "/api/tasks?pageSize=20&pageSize=50",
      "/api/tasks?page=501&pageSize=20",
      "/api/tasks?unknown=x",
      "/api/tasks?status=doing&status=todo",
    ]) expect((await api(path, sessionA)).status).toBe(400);
  });

  it("returns 404 for another member's task on every path (IDOR)", async () => {
    await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha" }) });
    const linked = await api("/api/tasks/task-1/links", sessionA, { method: "POST", body: JSON.stringify({ knowledgeItemId: "knowledge-a" }) });
    const linkId = ((await linked.json()) as { link: { id: string } }).link.id;
    for (const [path, init] of [
      ["/api/tasks/task-1", { method: "GET" }],
      ["/api/tasks/task-1", { method: "PATCH", body: JSON.stringify({ title: "hacked" }) }],
      ["/api/tasks/task-1", { method: "DELETE" }],
      ["/api/tasks/task-1/status", { method: "POST", body: JSON.stringify({ status: "doing" }) }],
      ["/api/tasks/task-1/progress", { method: "POST", body: JSON.stringify({ progress: 10 }) }],
      ["/api/tasks/task-1/tags", { method: "PUT", body: JSON.stringify({ tags: ["x"] }) }],
      ["/api/tasks/task-1/links", { method: "POST", body: JSON.stringify({ knowledgeItemId: "knowledge-a" }) }],
      [`/api/tasks/task-1/links/${linkId}`, { method: "DELETE" }],
    ] as const) expect((await api(path, sessionB, init)).status).toBe(404);
    await expect((await api("/api/tasks/task-1", sessionA)).json()).resolves.toMatchObject({ links: [{ id: linkId }] });
  });

  it("accepts identical status replays without adding an audit event", async () => {
    await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha" }) });
    const first = await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) });
    const replay = await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) });

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ status: "doing" });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ status: "doing" });
    const audit = await env.DB.prepare("SELECT action FROM audit_events WHERE action LIKE 'task.%' ORDER BY created_at, id").all<{ action: string }>();
    expect(audit.results.map((row) => row.action)).toEqual(["task.created", "task.status_changed"]);
    const notifications = await env.DB.prepare(
      "SELECT recipient_member_id, event_type, target_kind, target_id, payload_json FROM notifications WHERE recipient_member_id = ? ORDER BY created_at, id",
    ).bind("member-a").all<{
      recipient_member_id: string; event_type: string; target_kind: string; target_id: string; payload_json: string;
    }>();
    expect(notifications.results).toEqual([{
      recipient_member_id: "member-a",
      event_type: "task.status_changed",
      target_kind: "task",
      target_id: "task-1",
      payload_json: '{"previousStatus":"todo","status":"doing"}',
    }]);
  });

  it("lets one CAS winner define the logical event for concurrent identical status requests", async () => {
    await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-race", title: "Race" }) });

    const [left, right] = await Promise.all([
      api("/api/tasks/task-race/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) }),
      api("/api/tasks/task-race/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) }),
    ]);

    expect([left.status, right.status]).toEqual([200, 200]);
    await expect(left.json()).resolves.toMatchObject({ status: "doing" });
    await expect(right.json()).resolves.toMatchObject({ status: "doing" });
    const audit = await env.DB.prepare(
      "SELECT action FROM audit_events WHERE action = 'task.status_changed' AND resource_id = ? ORDER BY id",
    ).bind("task-race").all<{ action: string }>();
    expect(audit.results).toHaveLength(1);
    const notifications = await env.DB.prepare(
      "SELECT id, deduplication_key FROM notifications WHERE recipient_member_id = ? AND target_id = ? ORDER BY id",
    ).bind("member-a", "task-race").all<{ id: string; deduplication_key: string }>();
    expect(notifications.results).toHaveLength(1);
    expect(notifications.results[0]?.deduplication_key).toMatch(/^task:task-race:status:todo:doing:/u);
    const intents = await env.DB.prepare(
      `SELECT deduplication_key, delivered_at FROM task_status_notification_intents
       WHERE recipient_member_id = ? AND task_id = ? ORDER BY id`,
    ).bind("member-a", "task-race").all<{ deduplication_key: string; delivered_at: number | null }>();
    expect(intents.results).toHaveLength(1);
    expect(intents.results[0]?.deduplication_key).toBe(notifications.results[0]?.deduplication_key);
    expect(intents.results[0]?.delivered_at).not.toBeNull();
  });

  it("rejects anonymous, automation, CSRF-forged, and invalid-transition requests", async () => {
    expect((await api("/api/tasks?page=1&pageSize=20", "")).status).toBe(401);
    const automationContext = createExecutionContext();
    const automation = await createApp().fetch!(await signedAutomationRequest("https://memory.crgmhrc.asia/api/tasks?page=1&pageSize=20"), env, automationContext);
    await waitOnExecutionContext(automationContext);
    expect(automation.status).toBe(403);
    const forged = new Request("https://memory.crgmhrc.asia/api/tasks", {
      method: "POST", headers: { cookie: `__Host-memory-session=${sessionA}`, "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ id: "task-x", title: "Forged" }),
    });
    const context = createExecutionContext();
    const response = await createApp().fetch!(forged as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(403);
    await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha" }) });
    await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) });
    await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "done" }) });
    const transition = await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) });
    expect(transition.status).toBe(422);
    const audit = await env.DB.prepare("SELECT action FROM audit_events WHERE action LIKE 'task.%' ORDER BY created_at, id").all<{ action: string }>();
    expect(audit.results.map((row) => row.action)).toEqual(["task.created", "task.status_changed", "task.status_changed"]);
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function signedAutomationRequest(url: string): Promise<Request<unknown, IncomingRequestCfProperties<unknown>>> {
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
  const bodyHash = await sha256Hex(new Uint8Array());
  const parsed = new URL(url);
  const canonical = ["GET", `${parsed.pathname}${parsed.search}`, timestamp, nonce, bodyHash].join("\n");
  return new Request(url, { headers: {
    authorization: "Bearer worker-test-token",
    "x-automation-id": "fake-automation-client-id",
    "x-automation-timestamp": timestamp,
    "x-automation-nonce": nonce,
    "x-automation-signature": await hmacHex("fake-automation-secret", canonical),
  } }) as Request<unknown, IncomingRequestCfProperties<unknown>>;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", owned.buffer)));
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function taskCreate(overrides: Partial<TaskCreate> = {}): TaskCreate {
  return {
    id: "task-default", memberId: "member-a", title: "Test task", notes: "", priority: "medium",
    dueAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function linkInsert(overrides: Partial<TaskLinkInsert> = {}): TaskLinkInsert {
  return { id: "link-default", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a", createdAt: NOW, ...overrides };
}

async function seedTasks(repository: TasksRepository): Promise<void> {
  await repository.insert(taskCreate({ id: "task-1", memberId: "member-a", title: "Alpha review", createdAt: NOW - 4 * 1000, updatedAt: NOW - 4 * 1000 }));
  await repository.insert(taskCreate({ id: "task-2", memberId: "member-a", title: "Beta draft", createdAt: NOW - 3 * 1000, updatedAt: NOW - 3 * 1000 }));
  await repository.insert(taskCreate({ id: "task-3", memberId: "member-a", title: "Gamma", createdAt: NOW - 2 * 1000, updatedAt: NOW - 2 * 1000 }));
  await repository.insert(taskCreate({ id: "task-4", memberId: "member-a", title: "Delta", createdAt: NOW - 1 * 1000, updatedAt: NOW - 1 * 1000 }));
  await env.DB.prepare("UPDATE tasks SET status = 'doing', due_at = ? WHERE id = 'task-2'").bind(NOW).run();
  await env.DB.prepare("UPDATE tasks SET status = 'done', progress = 100, completed_at = ? WHERE id = 'task-4'").bind(NOW).run(); // done,无 due date(due:"none" 用例)
  await env.DB.prepare("UPDATE tasks SET due_at = ? WHERE id = 'task-1'").bind(NOW + 5 * DAY).run();
  await env.DB.prepare("UPDATE tasks SET due_at = ? WHERE id = 'task-3'").bind(NOW - DAY).run();
  await env.DB.prepare("INSERT INTO task_tags (task_id, member_id, tag) VALUES ('task-1', 'member-a', 'urgent')").run();
}

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
