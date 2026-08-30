/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { DiscussionTargetAuthorization } from "../../src/discussions/authorization";
import { DiscussionsRepository } from "../../src/discussions/repository";
import { DiscussionsService, type DiscussionNotificationSink } from "../../src/discussions/service";
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
    const threadFirst = await service.listThreads("member-a", { limit: 20 });
    await seedTask("task-22", "member-a");
    await service.sendMessage("member-a", {
      context: { kind: "task", id: "task-22" },
      body: "Inserted after page one",
      clientKey: "thread-22",
    });
    const threadSecond = await service.listThreads("member-a", { limit: 20, cursor: threadFirst.nextCursor });
    expect(threadFirst.items).toHaveLength(20);
    expect(threadSecond.items).toHaveLength(1);
    expect(new Set([...threadFirst.items, ...threadSecond.items].map(({ id }) => id)).size).toBe(21);

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
