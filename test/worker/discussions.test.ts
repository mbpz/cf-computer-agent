/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  buildDiscussionThreadListQueries,
  DiscussionTargetAuthorization,
} from "../../src/discussions/authorization";
import { DiscussionsRepository } from "../../src/discussions/repository";
import { DiscussionsService, type DiscussionNotificationSink } from "../../src/discussions/service";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import type { NotificationEventInput } from "../../src/notifications/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = 1_777_777_000_000;

describe("contextual discussions", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedMembers();
    await seedKnowledge();
  });

  it("derives visibility from the current task/knowledge target and never from participants", async () => {
    await seedTask("task-a", "member-a");
    const service = createService();
    const taskMessage = await service.sendMessage("member-a", {
      context: { kind: "task", id: "task-a" },
      body: "Owner-only task context",
      clientKey: "task-message",
    });
    await expect(service.getThread("member-b", taskMessage.thread.id))
      .rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });

    const knowledgeMessage = await service.sendMessage("member-a", {
      context: { kind: "knowledge", id: "knowledge-a" },
      body: "Shared knowledge context",
      clientKey: "knowledge-message",
    });
    await expect(service.getThread("member-b", knowledgeMessage.thread.id))
      .resolves.toMatchObject({ id: knowledgeMessage.thread.id, contextKind: "knowledge" });

    await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only' WHERE id = 'discussion-revision'").run();
    await expect(service.getThread("member-b", knowledgeMessage.thread.id))
      .rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });
    await expect(service.listMessages("member-b", knowledgeMessage.thread.id, { limit: 20 }))
      .rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });
    await expect(service.sendMessage("member-b", {
      context: { kind: "knowledge", id: "knowledge-a" },
      body: "No longer visible",
      clientKey: "revoked-send",
    })).rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });

    await env.DB.prepare("UPDATE members SET role = 'admin' WHERE id = 'member-b'").run();
    await expect(service.getThread("member-b", knowledgeMessage.thread.id)).resolves.toMatchObject({ id: knowledgeMessage.thread.id });
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'member-b'").run();
    await expect(service.getThread("member-b", knowledgeMessage.thread.id))
      .rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });
  });

  it("keeps bounded thread access keys synchronized with canonical task and knowledge visibility", async () => {
    await seedTask("task-a", "member-a");
    await seedTask("task-b", "member-b");
    const service = createService();
    const taskA = await service.sendMessage("member-a", {
      context: { kind: "task", id: "task-a" },
      body: "Task A",
      clientKey: "access-task-a",
    });
    const taskB = await service.sendMessage("member-b", {
      context: { kind: "task", id: "task-b" },
      body: "Task B",
      clientKey: "access-task-b",
    });
    const knowledge = await service.sendMessage("member-a", {
      context: { kind: "knowledge", id: "knowledge-a" },
      body: "Shared knowledge",
      clientKey: "access-knowledge",
    });

    await expectAccessKeys([
      ["knowledge", "admin", knowledge.thread.id],
      ["knowledge", "shared", knowledge.thread.id],
      ["task_member", "member-a", taskA.thread.id],
      ["task_member", "member-b", taskB.thread.id],
    ]);

    await env.DB.prepare("UPDATE tasks SET member_id = 'member-b' WHERE id = 'task-a'").run();
    await expectAccessKeys([
      ["knowledge", "admin", knowledge.thread.id],
      ["knowledge", "shared", knowledge.thread.id],
      ["task_member", "member-b", taskA.thread.id],
      ["task_member", "member-b", taskB.thread.id],
    ]);

    await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only' WHERE id = 'discussion-revision'").run();
    await expectAccessKeys([
      ["knowledge", "admin", knowledge.thread.id],
      ["task_member", "member-b", taskA.thread.id],
      ["task_member", "member-b", taskB.thread.id],
    ]);
    await expect(service.listThreads("member-a", { limit: 20 })).resolves.toEqual({ items: [] });
    await env.DB.prepare("UPDATE members SET role = 'admin' WHERE id = 'member-a'").run();
    await expect(service.listThreads("member-a", { limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: knowledge.thread.id })],
    });

    await env.DB.prepare("UPDATE knowledge_items SET status = 'trashed' WHERE id = 'knowledge-a'").run();
    await expectAccessKeys([
      ["task_member", "member-b", taskA.thread.id],
      ["task_member", "member-b", taskB.thread.id],
    ]);
    await env.DB.prepare("UPDATE knowledge_items SET status = 'active' WHERE id = 'knowledge-a'").run();
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'default'").run();
    await expectAccessKeys([
      ["task_member", "member-b", taskA.thread.id],
      ["task_member", "member-b", taskB.thread.id],
    ]);

    await env.DB.prepare("DELETE FROM tasks WHERE id = 'task-a'").run();
    await expectAccessKeys([
      ["task_member", "member-b", taskB.thread.id],
    ]);
  });

  it("keeps production thread page reads bounded when global invisible threads grow", async () => {
    for (let index = 1; index <= 3; index += 1) {
      const taskId = `visible-task-${index}`;
      await seedTask(taskId, "member-a");
      await env.DB.prepare(
        `INSERT INTO discussion_threads
         (id, context_kind, context_id, creator_member_id, last_sequence, created_at, updated_at)
         VALUES (?, 'task', ?, 'member-a', 0, ?, ?)`,
      ).bind(`visible-thread-${index}`, taskId, NOW - index, NOW - index).run();
    }
    const [taskQuery] = buildDiscussionThreadListQueries("member-a", { limit: 20 });
    const before = await env.DB.prepare(taskQuery.sql)
      .bind(...taskQuery.bindings)
      .all<{ id: string }>();

    const invisibleStatements: D1PreparedStatement[] = [];
    for (let index = 1; index <= 150; index += 1) {
      const suffix = String(index).padStart(3, "0");
      invisibleStatements.push(
        env.DB.prepare(
          `INSERT INTO tasks
           (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
           VALUES (?, 'member-b', ?, '', 'todo', 0, 'medium', NULL, ?, ?)`,
        ).bind(`invisible-task-${suffix}`, suffix, NOW + index, NOW + index),
        env.DB.prepare(
          `INSERT INTO discussion_threads
           (id, context_kind, context_id, creator_member_id, last_sequence, created_at, updated_at)
           VALUES (?, 'task', ?, 'member-b', 0, ?, ?)`,
        ).bind(`invisible-thread-${suffix}`, `invisible-task-${suffix}`, NOW + index, NOW + index),
      );
    }
    await env.DB.batch(invisibleStatements);

    const after = await env.DB.prepare(taskQuery.sql)
      .bind(...taskQuery.bindings)
      .all<{ id: string }>();
    expect(before.results.map(({ id }) => id)).toEqual([
      "visible-thread-1",
      "visible-thread-2",
      "visible-thread-3",
    ]);
    expect(after.results).toEqual(before.results);
    expect(before.meta.rows_read).toBeTypeOf("number");
    expect(after.meta.rows_read).toBeLessThanOrEqual(before.meta.rows_read + 2);
    expect(after.meta.rows_read).toBeLessThan(20);

    const visibleStatements: D1PreparedStatement[] = [];
    for (let index = 1; index <= 100; index += 1) {
      const suffix = String(index).padStart(3, "0");
      visibleStatements.push(
        env.DB.prepare(
          `INSERT INTO tasks
           (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
           VALUES (?, 'member-a', ?, '', 'todo', 0, 'medium', NULL, ?, ?)`,
        ).bind(`bounded-task-${suffix}`, suffix, NOW + 1_000 + index, NOW + 1_000 + index),
        env.DB.prepare(
          `INSERT INTO discussion_threads
           (id, context_kind, context_id, creator_member_id, last_sequence, created_at, updated_at)
           VALUES (?, 'task', ?, 'member-a', 0, ?, ?)`,
        ).bind(`bounded-thread-${suffix}`, `bounded-task-${suffix}`, NOW + 1_000 + index, NOW + 1_000 + index),
      );
    }
    await env.DB.batch(visibleStatements);
    const bounded = await env.DB.prepare(taskQuery.sql)
      .bind(...taskQuery.bindings)
      .all<{ id: string }>();
    expect(bounded.results).toHaveLength(21);
    expect(bounded.results.at(0)?.id).toBe("bounded-thread-100");
    expect(bounded.results.at(-1)?.id).toBe("bounded-thread-080");
    expect(bounded.meta.rows_read).toBeLessThan(60);
  });

  it("allocates one sequence per committed message and converges concurrent author/client-key replay", async () => {
    await seedTask("task-a", "member-a");
    const service = createService();
    const context = { kind: "task", id: "task-a" } as const;
    const [left, right] = await Promise.all([
      service.sendMessage("member-a", { context, body: "winner", clientKey: "same-client-key" }),
      service.sendMessage("member-a", { context, body: "racing replay", clientKey: "same-client-key" }),
    ]);
    expect(left.message.id).toBe(right.message.id);
    expect(left.message.sequence).toBe(1);
    expect([left.created, right.created].sort()).toEqual([false, true]);

    const [second, third] = await Promise.all([
      service.sendMessage("member-a", { context, body: "second", clientKey: "client-2" }),
      service.sendMessage("member-a", { context, body: "third", clientKey: "client-3" }),
    ]);
    expect(new Set([second.message.sequence, third.message.sequence])).toEqual(new Set([2, 3]));
    const stored = await env.DB.prepare(
      "SELECT sequence, body FROM discussion_messages ORDER BY sequence",
    ).all<{ sequence: number; body: string }>();
    expect(stored.results).toHaveLength(3);
    expect(stored.results.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    await expect(env.DB.prepare("SELECT last_sequence FROM discussion_threads").first<{ last_sequence: number }>())
      .resolves.toEqual({ last_sequence: 3 });

    await seedTask("task-fixed-id", "member-a");
    const fixedService = () => new DiscussionsService(
      new DiscussionsRepository(env.DB),
      new DiscussionTargetAuthorization(env.DB),
      { id: () => "fixed-discussion-id", now: () => new Date(NOW) },
    );
    const [fixedLeft, fixedRight] = await Promise.all([
      fixedService().sendMessage("member-a", {
        context: { kind: "task", id: "task-fixed-id" },
        body: "fixed winner",
        clientKey: "fixed-client-key",
      }),
      fixedService().sendMessage("member-a", {
        context: { kind: "task", id: "task-fixed-id" },
        body: "fixed replay",
        clientKey: "fixed-client-key",
      }),
    ]);
    expect([fixedLeft.created, fixedRight.created].sort()).toEqual([false, true]);
  });

  it("keeps message and thread cursor pages stable when later rows are inserted", async () => {
    const service = createService();
    for (let index = 1; index <= 21; index += 1) {
      const taskId = `task-${String(index).padStart(2, "0")}`;
      await seedTask(taskId, "member-a");
      await service.sendMessage("member-a", {
        context: { kind: "task", id: taskId },
        body: `Thread ${index}`,
        clientKey: `thread-${index}`,
      });
    }
    const knowledgeThread = await service.sendMessage("member-a", {
      context: { kind: "knowledge", id: "knowledge-a" },
      body: "Knowledge thread mixed into task pages",
      clientKey: "thread-knowledge",
    });
    const threadFirst = await service.listThreads("member-a", { limit: 20 });
    await seedTask("task-22", "member-a");
    await service.sendMessage("member-a", {
      context: { kind: "task", id: "task-22" },
      body: "Inserted after page one",
      clientKey: "thread-22",
    });
    const threadSecond = await service.listThreads("member-a", { limit: 20, cursor: threadFirst.nextCursor });
    expect(threadFirst.items).toHaveLength(20);
    expect(threadSecond.items).toHaveLength(2);
    const pagedThreadIds = new Set([...threadFirst.items, ...threadSecond.items].map(({ id }) => id));
    expect(pagedThreadIds.size).toBe(22);
    expect(pagedThreadIds.has(knowledgeThread.thread.id)).toBe(true);

    const context = { kind: "task", id: "task-01" } as const;
    for (let index = 1; index <= 24; index += 1) {
      await service.sendMessage("member-a", {
        context,
        body: `History ${index}`,
        clientKey: `history-${index}`,
      });
    }
    const thread = (await service.sendMessage("member-a", { context, body: "History 25", clientKey: "history-25" })).thread;
    const first = await service.listMessages("member-a", thread.id, { limit: 20 });
    await service.sendMessage("member-a", { context, body: "Concurrent 26", clientKey: "history-26" });
    const secondPage = await service.listMessages("member-a", thread.id, { limit: 20, cursor: first.nextCursor });
    const sequences = [...first.items, ...secondPage.items].map(({ sequence }) => sequence);
    expect(first.items.map(({ sequence }) => sequence)).toEqual(Array.from({ length: 20 }, (_, index) => 26 - index));
    expect(secondPage.items.map(({ sequence }) => sequence)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(new Set(sequences).size).toBe(26);
  });

  it("validates reply/mention eligibility and repairs notification failure by replaying the stored message", async () => {
    const notifications = new RecordingNotificationSink();
    const service = createService(notifications);
    const context = { kind: "knowledge", id: "knowledge-a" } as const;
    const parent = await service.sendMessage("member-b", { context, body: "Parent", clientKey: "parent" });

    notifications.failNext = true;
    await expect(service.sendMessage("member-a", {
      context,
      body: "Reply and mention",
      clientKey: "child",
      replyToMessageId: parent.message.id,
      mentionMemberIds: ["member-c", "member-c", "member-a"],
    })).rejects.toThrow("notification write failed");
    const stored = await env.DB.prepare(
      "SELECT id, sequence, mentions_json FROM discussion_messages WHERE author_member_id = 'member-a' AND client_key = 'child'",
    ).first<{ id: string; sequence: number; mentions_json: string }>();
    expect(stored).toMatchObject({ sequence: 2, mentions_json: '["member-c"]' });

    const replay = await service.sendMessage("member-a", {
      context,
      body: "replay body is ignored",
      clientKey: "child",
    });
    expect(replay).toMatchObject({ created: false, message: { id: stored?.id, sequence: 2, body: "Reply and mention" } });
    expect(notifications.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipientMemberId: "member-b", eventType: "discussion.reply", deduplicationKey: `discussion:${stored?.id}:reply:member-b` }),
      expect.objectContaining({ recipientMemberId: "member-c", eventType: "discussion.mention", deduplicationKey: `discussion:${stored?.id}:mention:member-c` }),
    ]));
    expect(notifications.events.every(({ recipientMemberId }) => recipientMemberId !== "member-a")).toBe(true);

    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'member-c'").run();
    await expect(service.sendMessage("member-a", {
      context,
      body: "Ineligible mention",
      clientKey: "bad-mention",
      mentionMemberIds: ["member-c"],
    })).rejects.toMatchObject({ code: "DISCUSSION_MESSAGE_INVALID", status: 400 });
    await expect(service.sendMessage("member-a", {
      context,
      body: "Unknown reply",
      clientKey: "bad-reply",
      replyToMessageId: "missing-message",
    })).rejects.toMatchObject({ code: "DISCUSSION_MESSAGE_INVALID", status: 400 });
  });
});

describe("discussion HTTP contract", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedMembers();
    await seedKnowledge();
    await seedTask("task-a", "member-a");
    await seedTask("task-b", "member-b");
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, {
      waitUntil: () => undefined,
      now: () => new Date("2026-08-30T00:00:00.000Z"),
    });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-b"))!)).token;
  });

  it("creates or gets a context thread and exposes stable member-authorized cursor pages", async () => {
    const created = await api("/api/discussions/context", sessionA, {
      method: "POST",
      body: JSON.stringify({ kind: "task", id: "task-a" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { thread: { id: string }; created: boolean };
    expect(createdBody).toMatchObject({
      created: true,
      thread: { contextKind: "task", contextId: "task-a", lastSequence: 0 },
    });

    const replay = await api("/api/discussions/context", sessionA, {
      method: "POST",
      body: JSON.stringify({ kind: "task", id: "task-a" }),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({ ...createdBody, created: false });

    const byContext = await api("/api/discussions/context?kind=task&id=task-a", sessionA);
    expect(byContext.status).toBe(200);
    await expect(byContext.json()).resolves.toEqual(createdBody.thread);

    const list = await api("/api/discussions?limit=20", sessionA);
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({ items: [createdBody.thread] });

    const detail = await api(`/api/discussions/${createdBody.thread.id}`, sessionA);
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toEqual(createdBody.thread);

    const messages = await api(`/api/discussions/${createdBody.thread.id}/messages?limit=20`, sessionA);
    expect(messages.status).toBe(200);
    await expect(messages.json()).resolves.toEqual({ items: [] });
  });

  it("sends idempotently, validates replies and mentions, and keeps route ordering canonical", async () => {
    const first = await api("/api/discussions/messages", sessionA, {
      method: "POST",
      body: JSON.stringify({
        context: { kind: "knowledge", id: "knowledge-a" },
        body: "Hello @member-b",
        clientKey: "client-message-1",
        mentionMemberIds: ["member-b"],
      }),
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { thread: { id: string }; message: { id: string }; created: boolean };
    expect(firstBody).toMatchObject({
      created: true,
      thread: { contextKind: "knowledge", contextId: "knowledge-a" },
      message: { body: "Hello @member-b", sequence: 1, mentionMemberIds: ["member-b"] },
    });

    const replay = await api("/api/discussions/messages", sessionA, {
      method: "POST",
      body: JSON.stringify({
        context: { kind: "knowledge", id: "knowledge-a" },
        body: "ignored replay body",
        clientKey: "client-message-1",
      }),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({ ...firstBody, created: false });

    const reply = await api("/api/discussions/messages", sessionB, {
      method: "POST",
      body: JSON.stringify({
        context: { kind: "knowledge", id: "knowledge-a" },
        body: "Reply",
        clientKey: "client-message-2",
        replyToMessageId: firstBody.message.id,
      }),
    });
    expect(reply.status).toBe(201);
    await expect(reply.json()).resolves.toMatchObject({
      created: true,
      message: { sequence: 2, replyToMessageId: firstBody.message.id },
    });

    const history = await api(`/api/discussions/${firstBody.thread.id}/messages?limit=1`, sessionA);
    const historyBody = await history.json() as { items: Array<{ sequence: number }>; nextCursor: string };
    expect(historyBody.items.map(({ sequence }) => sequence)).toEqual([2]);
    expect(historyBody.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    const older = await api(`/api/discussions/${firstBody.thread.id}/messages?limit=1&cursor=${historyBody.nextCursor}`, sessionA);
    await expect(older.json()).resolves.toMatchObject({ items: [{ sequence: 1 }] });
  });

  it("fails closed on unknown, duplicated, malformed, oversized, and cross-member inputs", async () => {
    const created = await api("/api/discussions/messages", sessionA, {
      method: "POST",
      body: JSON.stringify({ context: { kind: "task", id: "task-a" }, body: "Private", clientKey: "private-1" }),
    });
    const { thread } = await created.json() as { thread: { id: string } };

    for (const path of [
      "/api/discussions?limit=51",
      "/api/discussions?limit=20&limit=20",
      "/api/discussions?unknown=x",
      "/api/discussions?cursor=not-a-cursor",
      "/api/discussions/context?kind=task&id=task-a&id=task-a",
      `/api/discussions/${thread.id}/messages?limit=20&unknown=x`,
    ]) {
      const response = await api(path, sessionA);
      expect(response.status, path).toBe(400);
    }

    for (const body of [
      {},
      { kind: "task", id: "task-a", extra: true },
      { kind: "task", id: "task-a", context: {} },
    ]) {
      const response = await api("/api/discussions/context", sessionA, { method: "POST", body: JSON.stringify(body) });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    for (const body of [
      { context: { kind: "task", id: "task-a", extra: true }, body: "x", clientKey: "x" },
      { context: { kind: "task", id: "task-a" }, body: "x", clientKey: "x", extra: true },
      { context: { kind: "task", id: "task-a" }, body: "x", clientKey: "x", mentionMemberIds: ["member-b"] },
      { context: { kind: "task", id: "task-a" }, body: "x".repeat(5_001), clientKey: "long-body" },
      { context: { kind: "task", id: "task-a" }, body: "x", clientKey: "x".repeat(129) },
      { context: { kind: "task", id: "task-a" }, body: "x", clientKey: "many-mentions", mentionMemberIds: Array.from({ length: 21 }, (_, index) => `member-${index}`) },
    ]) {
      const response = await api("/api/discussions/messages", sessionA, { method: "POST", body: JSON.stringify(body) });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }

    expect((await api("/api/discussions?limit=20", "")).status).toBe(401);
    expect((await api("/api/discussions/context?kind=task&id=task-a", sessionB)).status).toBe(404);
    expect((await api(`/api/discussions/${thread.id}`, sessionB)).status).toBe(404);
    expect((await api(`/api/discussions/${thread.id}/messages?limit=20`, sessionB)).status).toBe(404);
    expect((await api("/api/discussions/messages", sessionB, {
      method: "POST",
      body: JSON.stringify({ context: { kind: "task", id: "task-a" }, body: "IDOR", clientKey: "idor" }),
    })).status).toBe(404);

    const forgedContext = createExecutionContext();
    const forged = await createApp().fetch!(new Request("https://memory.crgmhrc.asia/api/discussions/context", {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${sessionA}`, "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ kind: "task", id: "task-a" }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, forgedContext);
    await waitOnExecutionContext(forgedContext);
    expect(forged.status).toBe(403);
  });
});

function createService(notifications?: DiscussionNotificationSink): DiscussionsService {
  let id = 0;
  return new DiscussionsService(
    new DiscussionsRepository(env.DB),
    new DiscussionTargetAuthorization(env.DB),
    {
      id: () => `discussion-id-${String(++id).padStart(4, "0")}`,
      now: () => new Date(NOW),
      ...(notifications ? { notifications } : {}),
    },
  );
}

class RecordingNotificationSink implements DiscussionNotificationSink {
  readonly events: NotificationEventInput[] = [];
  failNext = false;
  async emit(event: NotificationEventInput): Promise<unknown> {
    if (this.failNext) { this.failNext = false; throw new Error("notification write failed"); }
    this.events.push(event);
    return undefined;
  }
}

async function seedMembers(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
     ('member-a', 'subject-a', 'a@example.test', 'contributor', 'active', ?, ?),
     ('member-b', 'subject-b', 'b@example.test', 'contributor', 'active', ?, ?),
     ('member-c', 'subject-c', 'c@example.test', 'contributor', 'active', ?, ?)`,
  ).bind(
    "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  ).run();
}

async function seedTask(id: string, memberId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
     VALUES (?, ?, ?, '', 'todo', 0, 'medium', NULL, ?, ?)`,
  ).bind(id, memberId, id, NOW, NOW).run();
}

async function seedKnowledge(): Promise<void> {
  const hash = "d".repeat(64);
  const now = "2026-08-30T00:00:00.000Z";
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('discussion-submission', 'member-a', 'default', 'markdown', 'published', 'Discussion Knowledge', '# Discussion', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('discussion-source', 'member-a', 'default', 'markdown', 'Discussion Knowledge', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('discussion-version', 'discussion-source', 'discussion-submission', 1, '# Discussion', ?, 'm1-v1', ?)").bind(hash, now).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-a', 'default', NULL, 'active', 'indexed', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('discussion-revision', 'knowledge-a', 'discussion-version', '/workspace/published/default/knowledge-a/discussion-revision.md', ?, 'Discussion Knowledge', '[]', 'shared', 'member-a', ?)").bind(hash, now).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'discussion-revision' WHERE id = 'knowledge-a'").run();
}

async function expectAccessKeys(expected: string[][]): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT principal_kind, principal_id, thread_id
     FROM discussion_thread_access
     ORDER BY principal_kind, principal_id, thread_id`,
  ).all<{ principal_kind: string; principal_id: string; thread_id: string }>();
  expect(rows.results.map(({ principal_kind, principal_id, thread_id }) => [
    principal_kind,
    principal_id,
    thread_id,
  ])).toEqual(expected);
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
