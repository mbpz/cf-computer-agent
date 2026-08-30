import { describe, expect, it } from "vitest";
import {
  DiscussionsService,
  type DiscussionAuthorizationPort,
  type DiscussionNotificationSink,
} from "../../src/discussions/service";
import type { DiscussionsRepositoryPort } from "../../src/discussions/repository";
import type {
  DiscussionContext,
  DiscussionMessage,
  DiscussionMessageInsert,
  DiscussionThread,
  DiscussionThreadCreate,
  DiscussionThreadPage,
  DiscussionMessagePage,
} from "../../src/discussions/types";
import type { PageRequest } from "../../src/pagination";
import type { NotificationEventInput } from "../../src/notifications/types";

const NOW = new Date("2026-08-30T08:00:00.000Z");
const TASK_CONTEXT: DiscussionContext = { kind: "task", id: "task-a" };

describe("DiscussionsService", () => {
  it("rechecks canonical target authorization for every list, read, history, and send operation", async () => {
    const repository = new FakeDiscussionsRepository();
    const authorization = new FakeDiscussionAuthorization(repository);
    authorization.allow("member-a", TASK_CONTEXT);
    const service = createService(repository, authorization);

    const sent = await service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "First message",
      clientKey: "client-1",
    });
    await expect(service.listThreads("member-a", { limit: 20 })).resolves.toMatchObject({ items: [{ id: sent.thread.id }] });
    await expect(service.getThread("member-a", sent.thread.id)).resolves.toMatchObject({ id: sent.thread.id });
    await expect(service.listMessages("member-a", sent.thread.id, { limit: 20 })).resolves.toMatchObject({ items: [{ id: sent.message.id }] });

    authorization.revoke("member-a", TASK_CONTEXT);
    await expect(service.listThreads("member-a", { limit: 20 })).resolves.toEqual({ items: [] });
    await expect(service.getThread("member-a", sent.thread.id)).rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });
    await expect(service.listMessages("member-a", sent.thread.id, { limit: 20 })).rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });
    await expect(service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "Cannot send",
      clientKey: "client-2",
    })).rejects.toMatchObject({ code: "DISCUSSION_NOT_FOUND", status: 404 });
    expect(authorization.checks.filter(({ memberId }) => memberId === "member-a").length).toBeGreaterThanOrEqual(7);
  });

  it("returns the original message on author/client-key replay without allocating another sequence", async () => {
    const repository = new FakeDiscussionsRepository();
    const authorization = new FakeDiscussionAuthorization(repository);
    authorization.allow("member-a", TASK_CONTEXT);
    const service = createService(repository, authorization);

    const first = await service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "Stable body",
      clientKey: "same-key",
    });
    const replay = await service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "A replay cannot replace the original body",
      clientKey: "same-key",
    });

    expect(first.created).toBe(true);
    expect(replay).toMatchObject({ created: false, message: { id: first.message.id, sequence: 1, body: "Stable body" } });
    expect(repository.messageInsertAttempts).toBe(1);
    expect(repository.messages).toHaveLength(1);
  });

  it("validates bounded message input, same-thread replies, and eligible deduplicated mentions", async () => {
    const repository = new FakeDiscussionsRepository();
    const authorization = new FakeDiscussionAuthorization(repository);
    authorization.allow("member-a", TASK_CONTEXT);
    authorization.allow("member-b", TASK_CONTEXT);
    const service = createService(repository, authorization);

    const parent = await service.sendMessage("member-b", {
      context: TASK_CONTEXT,
      body: "Parent",
      clientKey: "parent-key",
    });
    const sent = await service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "Reply",
      clientKey: "reply-key",
      replyToMessageId: parent.message.id,
      mentionMemberIds: ["member-b", "member-b", "member-a"],
    });
    expect(sent.message.mentionMemberIds).toEqual(["member-b"]);
    expect(repository.participants.get(sent.thread.id)).toEqual(new Set(["member-a", "member-b"]));

    authorization.revoke("member-b", TASK_CONTEXT);
    await expect(service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "Hidden mention",
      clientKey: "bad-mention",
      mentionMemberIds: ["member-b"],
    })).rejects.toMatchObject({ code: "DISCUSSION_MESSAGE_INVALID", status: 400 });
    await expect(service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "Wrong reply",
      clientKey: "bad-reply",
      replyToMessageId: "missing-message",
    })).rejects.toMatchObject({ code: "DISCUSSION_MESSAGE_INVALID", status: 400 });
    await expect(service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: " ",
      clientKey: "empty-body",
    })).rejects.toMatchObject({ code: "DISCUSSION_MESSAGE_INVALID", status: 400 });
  });

  it("does not persist an empty thread before reply and mention validation succeeds", async () => {
    const repository = new FakeDiscussionsRepository();
    const authorization = new FakeDiscussionAuthorization(repository);
    authorization.allow("member-a", TASK_CONTEXT);
    const service = createService(repository, authorization);

    await expect(service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "Invalid mention",
      clientKey: "invalid-before-thread",
      mentionMemberIds: ["member-b"],
    })).rejects.toMatchObject({ code: "DISCUSSION_MESSAGE_INVALID", status: 400 });
    expect(repository.threads).toEqual([]);
  });

  it("emits stable mention/reply events only after persistence and repairs a failed notification on replay", async () => {
    const repository = new FakeDiscussionsRepository();
    const authorization = new FakeDiscussionAuthorization(repository);
    authorization.allow("member-a", TASK_CONTEXT);
    authorization.allow("member-b", TASK_CONTEXT);
    authorization.allow("member-c", TASK_CONTEXT);
    const notifications = new FakeNotificationSink();
    const service = createService(repository, authorization, notifications);

    const parent = await service.sendMessage("member-b", {
      context: TASK_CONTEXT,
      body: "Parent",
      clientKey: "parent",
    });
    notifications.failNext = true;
    await expect(service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "Reply with mention",
      clientKey: "delivery-key",
      replyToMessageId: parent.message.id,
      mentionMemberIds: ["member-c"],
    })).rejects.toThrow("notification unavailable");

    expect(repository.messages.some(({ clientKey }) => clientKey === "delivery-key")).toBe(true);
    const replay = await service.sendMessage("member-a", {
      context: TASK_CONTEXT,
      body: "ignored replay body",
      clientKey: "delivery-key",
    });
    expect(replay.created).toBe(false);
    const deliveryEvents = notifications.events.filter(({ deduplicationKey }) => String(deduplicationKey).includes(replay.message.id));
    expect(deliveryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recipientMemberId: "member-b",
        eventType: "discussion.reply",
        targetKind: "discussion_thread",
        targetId: replay.thread.id,
        deduplicationKey: `discussion:${replay.message.id}:reply:member-b`,
      }),
      expect.objectContaining({
        recipientMemberId: "member-c",
        eventType: "discussion.mention",
        deduplicationKey: `discussion:${replay.message.id}:mention:member-c`,
      }),
    ]));
    expect(deliveryEvents.every(({ recipientMemberId }) => recipientMemberId !== "member-a")).toBe(true);
    expect(repository.messageInsertAttempts).toBe(2);
  });
});

function createService(
  repository: FakeDiscussionsRepository,
  authorization: FakeDiscussionAuthorization,
  notifications?: DiscussionNotificationSink,
): DiscussionsService {
  let id = 0;
  return new DiscussionsService(repository, authorization, {
    id: () => `discussion-${++id}`,
    now: () => NOW,
    ...(notifications ? { notifications } : {}),
  });
}

class FakeDiscussionAuthorization implements DiscussionAuthorizationPort {
  readonly checks: Array<{ memberId: string; context: DiscussionContext }> = [];
  private readonly allowed = new Set<string>();

  constructor(private readonly repository: FakeDiscussionsRepository) {}

  allow(memberId: string, context: DiscussionContext): void { this.allowed.add(key(memberId, context)); }
  revoke(memberId: string, context: DiscussionContext): void { this.allowed.delete(key(memberId, context)); }

  async canReadContext(memberId: string, context: DiscussionContext): Promise<boolean> {
    this.checks.push({ memberId, context });
    return this.allowed.has(key(memberId, context));
  }

  async listThreads(memberId: string, request: PageRequest): Promise<DiscussionThreadPage> {
    const visible = this.repository.threads.filter((thread) => this.allowed.has(key(memberId, {
      kind: thread.contextKind,
      id: thread.contextId,
    })));
    return { items: visible.slice(0, request.limit) };
  }

  async findAuthorizedThread(memberId: string, threadId: string): Promise<DiscussionThread | null> {
    const thread = this.repository.threads.find(({ id }) => id === threadId) ?? null;
    if (!thread) return null;
    const context = { kind: thread.contextKind, id: thread.contextId } satisfies DiscussionContext;
    return await this.canReadContext(memberId, context) ? thread : null;
  }

  async areEligibleMembers(memberIds: readonly string[], context: DiscussionContext): Promise<boolean> {
    return (await Promise.all(memberIds.map((memberId) => this.canReadContext(memberId, context)))).every(Boolean);
  }
}

class FakeDiscussionsRepository implements DiscussionsRepositoryPort {
  readonly threads: DiscussionThread[] = [];
  readonly messages: DiscussionMessage[] = [];
  readonly participants = new Map<string, Set<string>>();
  messageInsertAttempts = 0;

  async ensureThread(input: DiscussionThreadCreate): Promise<DiscussionThread> {
    const existing = await this.findThreadByContext(input.context);
    if (existing) return existing;
    const thread: DiscussionThread = {
      id: input.id,
      contextKind: input.context.kind,
      contextId: input.context.id,
      creatorMemberId: input.creatorMemberId,
      lastSequence: 0,
      createdAt: new Date(input.createdAt).toISOString(),
      updatedAt: new Date(input.createdAt).toISOString(),
    };
    this.threads.push(thread);
    return thread;
  }
  async findThreadByContext(context: DiscussionContext) {
    return this.threads.find(({ contextKind, contextId }) => contextKind === context.kind && contextId === context.id) ?? null;
  }
  async findThreadById(id: string) { return this.threads.find((thread) => thread.id === id) ?? null; }
  async findMessageByAuthorClientKey(authorMemberId: string, clientKey: string) {
    return this.messages.find((message) => message.authorMemberId === authorMemberId && message.clientKey === clientKey) ?? null;
  }
  async findMessage(threadId: string, messageId: string) {
    return this.messages.find((message) => message.threadId === threadId && message.id === messageId) ?? null;
  }
  async insertMessage(input: DiscussionMessageInsert) {
    this.messageInsertAttempts += 1;
    const replay = await this.findMessageByAuthorClientKey(input.authorMemberId, input.clientKey);
    if (replay) return { message: replay, created: false };
    const thread = (await this.findThreadById(input.threadId))!;
    thread.lastSequence += 1;
    thread.updatedAt = new Date(input.createdAt).toISOString();
    const message: DiscussionMessage = {
      id: input.id,
      threadId: input.threadId,
      sequence: thread.lastSequence,
      authorMemberId: input.authorMemberId,
      body: input.body,
      replyToMessageId: input.replyToMessageId,
      mentionMemberIds: [...input.mentionMemberIds],
      clientKey: input.clientKey,
      createdAt: new Date(input.createdAt).toISOString(),
    };
    this.messages.push(message);
    return { message, created: true };
  }
  async syncParticipants(threadId: string, memberIds: readonly string[]): Promise<void> {
    const members = this.participants.get(threadId) ?? new Set<string>();
    memberIds.forEach((memberId) => members.add(memberId));
    this.participants.set(threadId, members);
  }
  async listMessages(threadId: string, request: PageRequest): Promise<DiscussionMessagePage> {
    return { items: this.messages.filter((message) => message.threadId === threadId).slice(-request.limit).reverse() };
  }
}

class FakeNotificationSink implements DiscussionNotificationSink {
  readonly events: NotificationEventInput[] = [];
  failNext = false;
  async emit(event: NotificationEventInput): Promise<unknown> {
    if (this.failNext) { this.failNext = false; throw new Error("notification unavailable"); }
    this.events.push(event);
    return undefined;
  }
}

function key(memberId: string, context: DiscussionContext): string {
  return `${memberId}:${context.kind}:${context.id}`;
}
