/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { NotificationsRepository } from "../../src/notifications/repository";
import { NotificationsService } from "../../src/notifications/service";
import type { NotificationInsert } from "../../src/notifications/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = 1_777_777_000_000;

describe("notifications repository", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    const timestamp = "2026-08-30T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-a', 'subject-a', 'a@example.test', 'contributor', 'active', ?, ?), ('member-b', 'subject-b', 'b@example.test', 'contributor', 'active', ?, ?)",
    ).bind(timestamp, timestamp, timestamp, timestamp).run();
  });

  it("inserts once per recipient and deduplication key while allowing another recipient", async () => {
    const repository = new NotificationsRepository(env.DB);
    expect(await repository.insert(notificationInsert({ id: "notification-a", recipientMemberId: "member-a", deduplicationKey: "task-a:doing" }))).toBe(true);
    expect(await repository.insert(notificationInsert({ id: "notification-replay", recipientMemberId: "member-a", deduplicationKey: "task-a:doing" }))).toBe(false);
    expect(await repository.insert(notificationInsert({ id: "notification-b", recipientMemberId: "member-b", deduplicationKey: "task-a:doing" }))).toBe(true);
    expect(await repository.findByDeduplicationKey("member-a", "task-a:doing")).toMatchObject({ id: "notification-a", recipientMemberId: "member-a" });
  });

  it("keeps deterministic created-at/id ordering across numbered pages and recipient totals", async () => {
    const repository = new NotificationsRepository(env.DB);
    for (let index = 0; index < 21; index += 1) {
      await repository.insert(notificationInsert({
        id: `notification-${String(index).padStart(2, "0")}`,
        recipientMemberId: "member-a",
        deduplicationKey: `event-${index}`,
      }));
    }
    await repository.insert(notificationInsert({ id: "notification-private", recipientMemberId: "member-b", deduplicationKey: "private" }));

    const first = await repository.list("member-a", { filters: {}, page: 1, pageSize: 20 });
    const second = await repository.list("member-a", { filters: {}, page: 2, pageSize: 20 });
    const ids = [...first.items, ...second.items].map(({ id }) => id);

    expect(first.pagination).toEqual({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    expect(second.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
    expect(ids).toEqual(Array.from({ length: 21 }, (_unused, index) => `notification-${String(20 - index).padStart(2, "0")}`));
    expect(new Set(ids).size).toBe(21);
  });

  it("scopes filtered lists, unread summaries, and all read updates to the recipient", async () => {
    const repository = new NotificationsRepository(env.DB);
    await repository.insert(notificationInsert({ id: "a-status", recipientMemberId: "member-a", deduplicationKey: "a-status" }));
    await repository.insert(notificationInsert({ id: "a-due", recipientMemberId: "member-a", eventType: "task.due", deduplicationKey: "a-due" }));
    await repository.insert(notificationInsert({ id: "b-status", recipientMemberId: "member-b", deduplicationKey: "b-status" }));

    const due = await repository.list("member-a", { filters: { eventType: "task.due", read: false }, page: 1, pageSize: 20 });
    expect(due.items.map(({ id }) => id)).toEqual(["a-due"]);
    expect(await repository.summary("member-a")).toEqual({ unread: 2 });
    expect(await repository.markRead("member-b", "a-status", NOW + 1)).toBe(false);
    expect(await repository.markRead("member-a", "a-status", NOW + 1)).toBe(true);
    expect(await repository.markRead("member-a", "a-status", NOW + 2)).toBe(false);
    const visibleIds = ["a-due", "b-status", ...Array.from({ length: 98 }, (_, index) => `missing-${index}`)];
    expect(await repository.markManyRead("member-a", { ids: visibleIds, limit: 100 }, NOW + 3)).toBe(1);
    expect(await repository.summary("member-a")).toEqual({ unread: 0 });
    expect(await repository.summary("member-b")).toEqual({ unread: 1 });
  });

  it("selects a bounded recipient-owned set of open tasks for lazy due materialization", async () => {
    const repository = new NotificationsRepository(env.DB);
    const rows = [
      ["due", "member-a", "todo", NOW + 1_000],
      ["overdue", "member-a", "doing", NOW - 86_400_000],
      ["done", "member-a", "done", NOW - 86_400_000],
      ["future", "member-a", "blocked", NOW + 86_400_000],
      ["private", "member-b", "todo", NOW - 86_400_000],
    ] as const;
    for (const [id, memberId, status, dueAt] of rows) {
      await env.DB.prepare(
        `INSERT INTO tasks
         (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
         VALUES (?, ?, ?, '', ?, 0, 'medium', ?, ?, ?)`,
      ).bind(id, memberId, id, status, dueAt, NOW, NOW).run();
    }

    await expect(repository.listDueCandidates("member-a", NOW, 50)).resolves.toEqual([
      { taskId: "overdue", dueAt: NOW - 86_400_000 },
      { taskId: "due", dueAt: NOW + 1_000 },
    ]);
    await expect(repository.listDueCandidates("member-a", NOW, 1)).resolves.toEqual([
      { taskId: "overdue", dueAt: NOW - 86_400_000 },
    ]);
  });

  it("advances beyond the first lazy-due window without starving candidates 11 through 21", async () => {
    const repository = new NotificationsRepository(env.DB);
    for (let index = 0; index < 21; index += 1) {
      await env.DB.prepare(
        `INSERT INTO tasks
         (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
         VALUES (?, 'member-a', ?, '', 'todo', 0, 'medium', ?, ?, ?)`,
      ).bind(`starved-${String(index).padStart(2, "0")}`, `Starved ${index}`, NOW - 86_400_000 - index, NOW, NOW).run();
    }
    const service = new NotificationsService(repository, {
      now: () => new Date(NOW),
      dueSource: repository,
      targetAuthorizer: {
        async canReadTarget(recipientMemberId, targetKind, targetId) {
          if (targetKind !== "task") return false;
          const row = await env.DB.prepare(
            "SELECT 1 AS visible FROM tasks WHERE member_id = ? AND id = ? LIMIT 1",
          ).bind(recipientMemberId, targetId).first<{ visible: number }>();
          return row !== null;
        },
      },
    });

    await expect(service.summary("member-a")).resolves.toEqual({ unread: 10 });
    await expect(service.summary("member-a")).resolves.toEqual({ unread: 20 });
    await expect(service.summary("member-a")).resolves.toEqual({ unread: 21 });
  });
});

describe("notifications HTTP contract", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    const timestamp = "2026-08-30T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-a', 'subject-a', 'a@example.test', 'contributor', 'active', ?, ?), ('member-b', 'subject-b', 'b@example.test', 'contributor', 'active', ?, ?)",
    ).bind(timestamp, timestamp, timestamp, timestamp).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date(timestamp) });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-b"))!)).token;
    const repository = new NotificationsRepository(env.DB);
    await env.DB.prepare(
      `INSERT INTO tasks
       (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
       VALUES ('task-a', 'member-a', 'Task A', '', 'todo', 0, 'medium', NULL, ?, ?)`,
    ).bind(NOW, NOW).run();
    await repository.insert(notificationInsert({ id: "a-status", recipientMemberId: "member-a", deduplicationKey: "a-status", createdAt: NOW + 2 }));
    await repository.insert(notificationInsert({ id: "a-due", recipientMemberId: "member-a", eventType: "task.due", deduplicationKey: "a-due", createdAt: NOW + 1 }));
    await repository.insert(notificationInsert({ id: "b-private", recipientMemberId: "member-b", deduplicationKey: "b-private", createdAt: NOW + 3 }));
  });

  it("returns canonical recipient-owned list and summary envelopes with strict filters", async () => {
    const list = await api("/api/notifications?page=1&pageSize=20&read=false&type=task.due", sessionA);
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(await list.json()).toEqual({
      items: [{
        id: "a-due",
        recipientMemberId: "member-a",
        eventType: "task.due",
        actorMemberId: "member-a",
        targetKind: "task",
        targetId: "task-a",
        payload: { previousStatus: "todo", status: "doing" },
        deduplicationKey: "a-due",
        readAt: null,
        createdAt: new Date(NOW + 1).toISOString(),
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    const summary = await api("/api/notifications/summary", sessionA);
    expect(summary.status).toBe(200);
    expect(await summary.json()).toEqual({ unread: 2 });
  });

  it("redacts task targets after ownership loss without exposing recipient history to the new owner", async () => {
    const repository = new NotificationsRepository(env.DB);
    await repository.insert(notificationInsert({
      id: "a-task-history",
      recipientMemberId: "member-a",
      targetKind: "task",
      targetId: "task-a",
      deduplicationKey: "a-task-history",
      createdAt: NOW + 4,
    }));
    const before = await (await api("/api/notifications?type=task.status_changed&page=1&pageSize=20", sessionA)).json() as { items: Array<Record<string, unknown>> };
    expect(before.items.find(({ id }) => id === "a-task-history")).toMatchObject({ targetKind: "task", targetId: "task-a" });

    await env.DB.prepare("UPDATE tasks SET member_id = 'member-b' WHERE id = 'task-a'").run();
    const after = await (await api("/api/notifications?type=task.status_changed&page=1&pageSize=20", sessionA)).json() as { items: Array<Record<string, unknown>> };
    expect(after.items.find(({ id }) => id === "a-task-history")).toMatchObject({ targetKind: null, targetId: null, readAt: null });
    const newOwner = await (await api("/api/notifications?type=task.status_changed&page=1&pageSize=20", sessionB)).json() as { items: Array<Record<string, unknown>> };
    expect(newOwner.items.some(({ id }) => id === "a-task-history")).toBe(false);
  });

  it("redacts revoked and missing knowledge targets without distinguishing their existence", async () => {
    await seedNotificationKnowledge();
    const repository = new NotificationsRepository(env.DB);
    await repository.insert(notificationInsert({
      id: "a-knowledge-visible",
      recipientMemberId: "member-a",
      targetKind: "knowledge_item",
      targetId: "notification-knowledge",
      deduplicationKey: "a-knowledge-visible",
      createdAt: NOW + 5,
    }));
    await repository.insert(notificationInsert({
      id: "a-knowledge-missing",
      recipientMemberId: "member-a",
      targetKind: "knowledge_item",
      targetId: "knowledge-missing",
      deduplicationKey: "a-knowledge-missing",
      createdAt: NOW + 4,
    }));
    const before = await (await api("/api/notifications?page=1&pageSize=20", sessionA)).json() as { items: Array<Record<string, unknown>> };
    expect(before.items.find(({ id }) => id === "a-knowledge-visible")).toMatchObject({ targetKind: "knowledge_item", targetId: "notification-knowledge" });
    expect(before.items.find(({ id }) => id === "a-knowledge-missing")).toMatchObject({ targetKind: null, targetId: null });

    await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only', published_by = 'member-b' WHERE id = 'notification-revision'").run();
    const after = await (await api("/api/notifications?page=1&pageSize=20", sessionA)).json() as { items: Array<Record<string, unknown>> };
    expect(after.items.find(({ id }) => id === "a-knowledge-visible")).toMatchObject({ targetKind: null, targetId: null, readAt: null });
    expect(after.items.find(({ id }) => id === "a-knowledge-missing")).toMatchObject({ targetKind: null, targetId: null, readAt: null });
  });

  it("matches knowledge deep links to the detail authorization matrix", async () => {
    await seedNotificationKnowledge();
    await env.DB.prepare("UPDATE members SET role = 'admin' WHERE id = 'member-b'").run();
    const repository = new NotificationsRepository(env.DB);
    await repository.insert(notificationInsert({
      id: "a-knowledge-matrix",
      recipientMemberId: "member-a",
      targetKind: "knowledge_item",
      targetId: "notification-knowledge",
      deduplicationKey: "a-knowledge-matrix",
      createdAt: NOW + 5,
    }));
    await repository.insert(notificationInsert({
      id: "b-knowledge-matrix",
      recipientMemberId: "member-b",
      targetKind: "knowledge_item",
      targetId: "notification-knowledge",
      deduplicationKey: "b-knowledge-matrix",
      createdAt: NOW + 5,
    }));

    expect((await api("/api/knowledge/notification-knowledge", sessionA)).status).toBe(200);
    expect((await api("/api/knowledge/notification-knowledge", sessionB)).status).toBe(200);
    expect(await notificationTarget("a-knowledge-matrix", sessionA)).toEqual({
      targetKind: "knowledge_item",
      targetId: "notification-knowledge",
    });
    expect(await notificationTarget("b-knowledge-matrix", sessionB)).toEqual({
      targetKind: "knowledge_item",
      targetId: "notification-knowledge",
    });

    await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only', published_by = 'member-a' WHERE id = 'notification-revision'").run();
    expect((await api("/api/knowledge/notification-knowledge", sessionA)).status).toBe(404);
    expect((await api("/api/knowledge/notification-knowledge", sessionB)).status).toBe(200);
    expect(await notificationTarget("a-knowledge-matrix", sessionA)).toEqual({ targetKind: null, targetId: null });
    expect(await notificationTarget("b-knowledge-matrix", sessionB)).toEqual({
      targetKind: "knowledge_item",
      targetId: "notification-knowledge",
    });

    await env.DB.prepare("UPDATE knowledge_items SET status = 'trashed' WHERE id = 'notification-knowledge'").run();
    expect((await api("/api/knowledge/notification-knowledge", sessionA)).status).toBe(404);
    expect((await api("/api/knowledge/notification-knowledge", sessionB)).status).toBe(404);
    expect(await notificationTarget("a-knowledge-matrix", sessionA)).toEqual({ targetKind: null, targetId: null });
    expect(await notificationTarget("b-knowledge-matrix", sessionB)).toEqual({ targetKind: null, targetId: null });
  });

  it("fails closed for unknown, duplicate, malformed pagination and filter query values", async () => {
    for (const path of [
      "/api/notifications?cursor=bad",
      "/api/notifications?page=1&page=2",
      "/api/notifications?pageSize=20&pageSize=50",
      "/api/notifications?page=501&pageSize=20",
      "/api/notifications?read=unread",
      "/api/notifications?read=false&read=true",
      "/api/notifications?type=unknown",
      "/api/notifications?type=task.due&type=task.overdue",
      "/api/notifications/summary?read=false",
    ]) {
      const response = await api(path, sessionA);
      expect(response.status, path).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { retryable: false },
      });
    }
  });

  it("requires an authenticated member principal", async () => {
    expect((await api("/api/notifications?page=1&pageSize=20", "")).status).toBe(401);
    const context = createExecutionContext();
    const response = await createApp().fetch!(
      await signedAutomationRequest("https://memory.crgmhrc.asia/api/notifications?page=1&pageSize=20"),
      env,
      context,
    );
    await waitOnExecutionContext(context);
    expect(response.status).toBe(403);
  });

  it("marks one notification replay-safely and returns 404 across recipients", async () => {
    const unexpectedBody = await api("/api/notifications/a-status/read", sessionA, {
      method: "POST",
      body: JSON.stringify({ read: true }),
    });
    expect(unexpectedBody.status).toBe(400);
    await expect(unexpectedBody.json()).resolves.toMatchObject({
      error: { code: "NOTIFICATION_READ_INVALID", retryable: false },
    });

    const first = await api("/api/notifications/a-status/read", sessionA, { method: "POST" });
    expect(first.status).toBe(200);
    const firstBody = await first.json() as Record<string, unknown>;
    expect(firstBody).toMatchObject({ id: "a-status", recipientMemberId: "member-a" });
    expect(typeof firstBody.readAt).toBe("string");

    const replay = await api("/api/notifications/a-status/read", sessionA, { method: "POST" });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);

    const crossUser = await api("/api/notifications/a-status/read", sessionB, { method: "POST" });
    expect(crossUser.status).toBe(404);
    await expect(crossUser.json()).resolves.toMatchObject({
      error: { code: "NOTIFICATION_NOT_FOUND", retryable: false },
    });
  });

  it("marks only a bounded visible ID set and converges on bulk replay", async () => {
    const first = await api("/api/notifications/read", sessionA, {
      method: "POST",
      body: JSON.stringify({ ids: ["a-status", "b-private"] }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ marked: 1 });
    const replay = await api("/api/notifications/read", sessionA, {
      method: "POST",
      body: JSON.stringify({ ids: ["a-status", "b-private"] }),
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ marked: 0 });
    expect(await (await api("/api/notifications/summary", sessionA)).json()).toEqual({ unread: 1 });
    expect(await (await api("/api/notifications/summary", sessionB)).json()).toEqual({ unread: 1 });
  });

  it("rejects unbounded, empty, malformed, and non-canonical bulk bodies", async () => {
    const oversized = Array.from({ length: 101 }, (_unused, index) => `notification-${index}`);
    for (const body of [
      {},
      { ids: [] },
      { ids: "a-status" },
      { ids: [1] },
      { ids: oversized },
      { ids: ["a-status"], limit: 1 },
      { eventType: "task.status_changed" },
      { ids: ["a-status"], createdBefore: new Date().toISOString() },
    ]) {
      const response = await api("/api/notifications/read", sessionA, { method: "POST", body: JSON.stringify(body) });
      expect(response.status, JSON.stringify(body)).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "NOTIFICATION_BULK_INVALID", retryable: false },
      });
    }
  });
});

function notificationInsert(overrides: Partial<NotificationInsert> = {}): NotificationInsert {
  return {
    id: "notification-1",
    recipientMemberId: "member-a",
    eventType: "task.status_changed",
    actorMemberId: "member-a",
    targetKind: "task",
    targetId: "task-a",
    payloadJson: '{"previousStatus":"todo","status":"doing"}',
    deduplicationKey: "task-a:status:doing",
    createdAt: NOW,
    ...overrides,
  };
}

async function seedNotificationKnowledge(): Promise<void> {
  const markdown = "# Knowledge";
  const hash = await sha256Hex(new TextEncoder().encode(markdown));
  const now = "2026-08-30T00:00:00.000Z";
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('notification-submission', 'member-a', 'default', 'markdown', 'published', 'Notification Knowledge', ?, ?, ?)").bind(markdown, now, now).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('notification-source', 'member-a', 'default', 'markdown', 'Notification Knowledge', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('notification-source-version', 'notification-source', 'notification-submission', 1, ?, ?, 'm1-v1', ?)").bind(markdown, hash, now).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('notification-knowledge', 'default', NULL, 'active', 'indexed', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('notification-revision', 'notification-knowledge', 'notification-source-version', '/workspace/published/default/notification-knowledge/notification-revision.md', ?, 'Notification Knowledge', '[]', 'shared', 'member-a', ?)").bind(hash, now).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'notification-revision' WHERE id = 'notification-knowledge'").run();
  await env.DB.prepare(
    `INSERT INTO chunks
     (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body, index_field, location_json)
     VALUES ('notification-chunk', 'notification-revision', 0, '["Knowledge"]', 1, 1, 'Knowledge', 'Notification Knowledge', '', 'knowledge', 'body', '{}')`,
  ).run();
  const result = await env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("personal")).commitPublishedContent({
    spaceId: "default",
    knowledgeItemId: "notification-knowledge",
    revisionId: "notification-revision",
    contentSha256: hash,
    markdown,
  });
  if (!result.ok) throw new Error(`failed to seed published content: ${result.error.code}`);
}

async function notificationTarget(id: string, token: string): Promise<{ targetKind: unknown; targetId: unknown }> {
  const page = await (await api("/api/notifications?page=1&pageSize=20", token)).json() as {
    items: Array<{ id: string; targetKind: unknown; targetId: unknown }>;
  };
  const notification = page.items.find((item) => item.id === id);
  if (!notification) throw new Error(`notification ${id} was not listed`);
  return { targetKind: notification.targetKind, targetId: notification.targetId };
}

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(
    new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    context,
  );
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
