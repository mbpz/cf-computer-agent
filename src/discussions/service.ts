import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { NotificationEventInput } from "../notifications/types";
import type { DiscussionsRepositoryPort } from "./repository";
import {
  DISCUSSION_CONTEXT_KINDS,
  type DiscussionContext,
  type DiscussionMessage,
  type DiscussionMessagePage,
  type DiscussionThread,
  type DiscussionThreadPage,
  type SendDiscussionMessageInput,
  type SendDiscussionMessageResult,
} from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

export interface DiscussionAuthorizationPort {
  canReadContext(memberId: string, context: DiscussionContext): Promise<boolean>;
  findAuthorizedThread(memberId: string, threadId: string): Promise<DiscussionThread | null>;
  listThreads(memberId: string, request: PageRequest): Promise<DiscussionThreadPage>;
  areEligibleMembers(memberIds: readonly string[], context: DiscussionContext): Promise<boolean>;
}

export interface DiscussionNotificationSink {
  emit(event: NotificationEventInput): Promise<unknown>;
}

export interface DiscussionsServiceOptions {
  id?: () => string;
  now?: () => Date;
  notifications?: DiscussionNotificationSink;
}

export class DiscussionsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: DiscussionsRepositoryPort,
    private readonly authorization: DiscussionAuthorizationPort,
    private readonly options: DiscussionsServiceOptions = {},
  ) {
    this.id = options.id ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
  }

  async listThreads(memberId: string, request: Partial<PageRequest> = {}): Promise<DiscussionThreadPage> {
    const actorMemberId = normalizeMemberId(memberId);
    return this.authorization.listThreads(actorMemberId, parsePageRequest(request.limit, request.cursor));
  }

  async getThread(memberId: string, threadId: string): Promise<DiscussionThread> {
    const actorMemberId = normalizeMemberId(memberId);
    const normalizedThreadId = normalizeLookupId(threadId);
    const thread = await this.authorization.findAuthorizedThread(actorMemberId, normalizedThreadId);
    if (!thread) throw notFound();
    return thread;
  }

  async listMessages(
    memberId: string,
    threadId: string,
    request: Partial<PageRequest> = {},
  ): Promise<DiscussionMessagePage> {
    const thread = await this.getThread(memberId, threadId);
    return this.repository.listMessages(thread.id, parsePageRequest(request.limit, request.cursor));
  }

  async sendMessage(memberId: string, input: SendDiscussionMessageInput): Promise<SendDiscussionMessageResult> {
    const actorMemberId = normalizeMemberId(memberId);
    const normalized = normalizeSendInput(input, actorMemberId);

    const replay = await this.repository.findMessageByAuthorClientKey(actorMemberId, normalized.clientKey);
    if (replay) return this.finishReplay(actorMemberId, normalized.context, replay);

    if (!await this.authorization.canReadContext(actorMemberId, normalized.context)) throw notFound();
    const now = this.now().getTime();
    const existingThread = await this.repository.findThreadByContext(normalized.context);
    if (normalized.replyToMessageId !== null
      && (!existingThread || !await this.repository.findMessage(existingThread.id, normalized.replyToMessageId))) {
      throw invalidMessage();
    }
    if (!await this.authorization.areEligibleMembers(normalized.mentionMemberIds, normalized.context)) {
      throw invalidMessage();
    }
    const thread = existingThread ?? await this.repository.ensureThread({
      id: normalizeGeneratedId(this.id()),
      context: normalized.context,
      creatorMemberId: actorMemberId,
      createdAt: now,
    });
    const authorizedThread = await this.authorization.findAuthorizedThread(actorMemberId, thread.id);
    if (!authorizedThread) throw notFound();
    if (!await this.authorization.canReadContext(actorMemberId, normalized.context)) throw notFound();

    const inserted = await this.repository.insertMessage({
      id: normalizeGeneratedId(this.id()),
      threadId: authorizedThread.id,
      authorMemberId: actorMemberId,
      body: normalized.body,
      replyToMessageId: normalized.replyToMessageId,
      mentionMemberIds: normalized.mentionMemberIds,
      clientKey: normalized.clientKey,
      createdAt: now,
    });
    if (inserted.message.threadId !== authorizedThread.id) throw invalidMessage();
    await this.repairParticipants(authorizedThread, inserted.message, now);
    await this.deliverNotifications(authorizedThread, inserted.message);
    return { thread: await this.getThread(actorMemberId, authorizedThread.id), ...inserted };
  }

  private async finishReplay(
    actorMemberId: string,
    requestedContext: DiscussionContext,
    message: DiscussionMessage,
  ): Promise<SendDiscussionMessageResult> {
    const thread = await this.authorization.findAuthorizedThread(actorMemberId, message.threadId);
    if (!thread) throw notFound();
    if (thread.contextKind !== requestedContext.kind || thread.contextId !== requestedContext.id) throw invalidMessage();
    await this.repairParticipants(thread, message, this.now().getTime());
    await this.deliverNotifications(thread, message);
    return { thread, message, created: false };
  }

  private async repairParticipants(
    thread: DiscussionThread,
    message: DiscussionMessage,
    joinedAt: number,
  ): Promise<void> {
    const context = { kind: thread.contextKind, id: thread.contextId } satisfies DiscussionContext;
    const eligibleMentions: string[] = [];
    for (const memberId of message.mentionMemberIds) {
      if (await this.authorization.areEligibleMembers([memberId], context)) eligibleMentions.push(memberId);
    }
    await this.repository.syncParticipants(
      message.threadId,
      [message.authorMemberId, ...eligibleMentions],
      joinedAt,
    );
  }

  private async deliverNotifications(thread: DiscussionThread, message: DiscussionMessage): Promise<void> {
    if (!this.options.notifications) return;
    const context = { kind: thread.contextKind, id: thread.contextId } satisfies DiscussionContext;
    if (message.replyToMessageId !== null) {
      const parent = await this.repository.findMessage(thread.id, message.replyToMessageId);
      if (!parent) throw invalidMessage();
      if (parent.authorMemberId !== message.authorMemberId
        && await this.authorization.areEligibleMembers([parent.authorMemberId], context)) {
        await this.options.notifications.emit(notificationEvent(
          parent.authorMemberId,
          "discussion.reply",
          thread.id,
          message,
        ));
      }
    }
    for (const recipientMemberId of message.mentionMemberIds) {
      if (recipientMemberId === message.authorMemberId) continue;
      if (!await this.authorization.areEligibleMembers([recipientMemberId], context)) continue;
      await this.options.notifications.emit(notificationEvent(
        recipientMemberId,
        "discussion.mention",
        thread.id,
        message,
      ));
    }
  }
}

function notificationEvent(
  recipientMemberId: string,
  eventType: "discussion.reply" | "discussion.mention",
  threadId: string,
  message: DiscussionMessage,
): NotificationEventInput {
  const suffix = eventType === "discussion.reply" ? "reply" : "mention";
  return {
    recipientMemberId,
    eventType,
    actorMemberId: message.authorMemberId,
    targetKind: "discussion_thread",
    targetId: threadId,
    payload: { messageId: message.id },
    deduplicationKey: `discussion:${message.id}:${suffix}:${recipientMemberId}`,
  };
}

function normalizeSendInput(input: SendDiscussionMessageInput, actorMemberId: string): {
  context: DiscussionContext;
  body: string;
  clientKey: string;
  replyToMessageId: string | null;
  mentionMemberIds: string[];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidMessage();
  const context = normalizeContext(input.context);
  const body = normalizeBody(input.body);
  const clientKey = normalizeClientKey(input.clientKey);
  const replyToMessageId = input.replyToMessageId === undefined || input.replyToMessageId === null
    ? null
    : normalizeInputId(input.replyToMessageId);
  const mentionMemberIds = normalizeMentions(input.mentionMemberIds, actorMemberId);
  return { context, body, clientKey, replyToMessageId, mentionMemberIds };
}

function normalizeContext(value: unknown): DiscussionContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidMessage();
  const record = value as Record<string, unknown>;
  if (typeof record.kind !== "string" || !DISCUSSION_CONTEXT_KINDS.includes(record.kind as DiscussionContext["kind"])) {
    throw invalidMessage();
  }
  return { kind: record.kind as DiscussionContext["kind"], id: normalizeInputId(record.id) };
}

function normalizeBody(value: unknown): string {
  if (typeof value !== "string") throw invalidMessage();
  const normalized = value.trim();
  if (!normalized
    || [...normalized].length > APP_CONFIG.maxDiscussionMessageChars
    || CONTROL_CHARACTERS.test(normalized)) throw invalidMessage();
  return normalized;
}

function normalizeClientKey(value: unknown): string {
  if (typeof value !== "string") throw invalidMessage();
  const normalized = value.trim();
  if (!normalized
    || normalized.length > APP_CONFIG.maxDiscussionClientKeyChars
    || CONTROL_CHARACTERS.test(normalized)) throw invalidMessage();
  return normalized;
}

function normalizeMentions(value: unknown, actorMemberId: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > APP_CONFIG.maxDiscussionMentions) throw invalidMessage();
  const mentions: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const memberId = normalizeInputId(candidate);
    if (memberId !== actorMemberId && !seen.has(memberId)) {
      seen.add(memberId);
      mentions.push(memberId);
    }
  }
  return mentions;
}

function normalizeMemberId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw notFound();
  return value;
}

function normalizeLookupId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw notFound();
  return value;
}

function normalizeInputId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw invalidMessage();
  return value;
}

function normalizeGeneratedId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new AppError("DISCUSSION_WRITE_FAILED", "Discussion write failed", 500, true);
  }
  return value;
}

function invalidMessage(): AppError {
  return new AppError("DISCUSSION_MESSAGE_INVALID", "Discussion message is invalid", 400);
}

function notFound(): AppError {
  return new AppError("DISCUSSION_NOT_FOUND", "Discussion not found", 404);
}
