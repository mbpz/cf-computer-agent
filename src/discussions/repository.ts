import { AppError } from "../http";
import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import type {
  DiscussionContext,
  DiscussionMessage,
  DiscussionMessageInsert,
  DiscussionMessagePage,
  DiscussionThread,
  DiscussionThreadCreate,
} from "./types";

export interface DiscussionsRepositoryPort {
  ensureThread(input: DiscussionThreadCreate): Promise<DiscussionThread>;
  findThreadByContext(context: DiscussionContext): Promise<DiscussionThread | null>;
  findThreadById(id: string): Promise<DiscussionThread | null>;
  findMessageByAuthorClientKey(authorMemberId: string, clientKey: string): Promise<DiscussionMessage | null>;
  findMessage(threadId: string, messageId: string): Promise<DiscussionMessage | null>;
  insertMessage(input: DiscussionMessageInsert): Promise<{ message: DiscussionMessage; created: boolean }>;
  syncParticipants(threadId: string, memberIds: readonly string[], joinedAt?: number): Promise<void>;
  listMessages(threadId: string, request: PageRequest): Promise<DiscussionMessagePage>;
}

export type DiscussionThreadRow = {
  id: string;
  context_kind: DiscussionThread["contextKind"];
  context_id: string;
  creator_member_id: string;
  last_sequence: number;
  created_at: number;
  updated_at: number;
};

type DiscussionMessageRow = {
  id: string;
  thread_id: string;
  sequence: number;
  author_member_id: string;
  body: string;
  reply_to_message_id: string | null;
  mentions_json: string;
  client_key: string;
  created_at: number;
};

export const discussionThreadColumns = `id, context_kind, context_id, creator_member_id,
  last_sequence, created_at, updated_at`;
const discussionMessageColumns = `id, thread_id, sequence, author_member_id, body,
  reply_to_message_id, mentions_json, client_key, created_at`;

export class DiscussionsRepository implements DiscussionsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async ensureThread(input: DiscussionThreadCreate): Promise<DiscussionThread> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO discussion_threads
       (id, context_kind, context_id, creator_member_id, last_sequence, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).bind(
      input.id,
      input.context.kind,
      input.context.id,
      input.creatorMemberId,
      input.createdAt,
      input.createdAt,
    ).run();
    const thread = await this.findThreadByContext(input.context);
    if (!thread) throw writeFailed();
    return thread;
  }

  async findThreadByContext(context: DiscussionContext): Promise<DiscussionThread | null> {
    return mapThreadNullable(await this.db.prepare(
      `SELECT ${discussionThreadColumns} FROM discussion_threads
       WHERE context_kind = ? AND context_id = ? LIMIT 1`,
    ).bind(context.kind, context.id).first<DiscussionThreadRow>());
  }

  async findThreadById(id: string): Promise<DiscussionThread | null> {
    return mapThreadNullable(await this.db.prepare(
      `SELECT ${discussionThreadColumns} FROM discussion_threads WHERE id = ? LIMIT 1`,
    ).bind(id).first<DiscussionThreadRow>());
  }

  async findMessageByAuthorClientKey(authorMemberId: string, clientKey: string): Promise<DiscussionMessage | null> {
    return mapMessageNullable(await this.db.prepare(
      `SELECT ${discussionMessageColumns} FROM discussion_messages
       WHERE author_member_id = ? AND client_key = ? LIMIT 1`,
    ).bind(authorMemberId, clientKey).first<DiscussionMessageRow>());
  }

  async findMessage(threadId: string, messageId: string): Promise<DiscussionMessage | null> {
    return mapMessageNullable(await this.db.prepare(
      `SELECT ${discussionMessageColumns} FROM discussion_messages
       WHERE thread_id = ? AND id = ? LIMIT 1`,
    ).bind(threadId, messageId).first<DiscussionMessageRow>());
  }

  async insertMessage(input: DiscussionMessageInsert): Promise<{ message: DiscussionMessage; created: boolean }> {
    const mentionsJson = JSON.stringify(input.mentionMemberIds);
    const [, insertResult] = await this.db.batch([
      this.db.prepare(
        `UPDATE discussion_threads
         SET last_sequence = last_sequence + 1, updated_at = ?
         WHERE id = ? AND NOT EXISTS (
           SELECT 1 FROM discussion_messages WHERE author_member_id = ? AND client_key = ?
         )`,
      ).bind(input.createdAt, input.threadId, input.authorMemberId, input.clientKey),
      this.db.prepare(
        `INSERT OR IGNORE INTO discussion_messages
         (id, thread_id, sequence, author_member_id, body, reply_to_message_id,
          mentions_json, client_key, created_at)
         SELECT ?, id, last_sequence, ?, ?, ?, ?, ?, ?
         FROM discussion_threads
         WHERE id = ? AND NOT EXISTS (
           SELECT 1 FROM discussion_messages WHERE author_member_id = ? AND client_key = ?
         )`,
      ).bind(
        input.id,
        input.authorMemberId,
        input.body,
        input.replyToMessageId,
        mentionsJson,
        input.clientKey,
        input.createdAt,
        input.threadId,
        input.authorMemberId,
        input.clientKey,
      ),
    ]);
    const message = await this.findMessageByAuthorClientKey(input.authorMemberId, input.clientKey);
    if (!message) throw writeFailed();
    return { message, created: insertResult.meta.changes === 1 };
  }

  async syncParticipants(threadId: string, memberIds: readonly string[], joinedAt = Date.now()): Promise<void> {
    if (memberIds.length === 0) return;
    await this.db.batch(memberIds.map((memberId) => this.db.prepare(
      `INSERT OR IGNORE INTO discussion_participants
       (thread_id, member_id, joined_at, last_read_sequence) VALUES (?, ?, ?, 0)`,
    ).bind(threadId, memberId, joinedAt)));
  }

  async listMessages(threadId: string, request: PageRequest): Promise<DiscussionMessagePage> {
    const cursor = request.cursor === undefined
      ? undefined
      : decodePageCursor(request.cursor, { minSort: 1, maxSort: Number.MAX_SAFE_INTEGER });
    const bindings: Array<string | number> = [threadId];
    const cursorSql = cursor
      ? " AND (sequence < ? OR (sequence = ? AND id < ?))"
      : "";
    if (cursor) bindings.push(cursor.sort, cursor.sort, cursor.id);
    const rows = await this.db.prepare(
      `SELECT ${discussionMessageColumns} FROM discussion_messages
       WHERE thread_id = ?${cursorSql}
       ORDER BY sequence DESC, id DESC LIMIT ?`,
    ).bind(...bindings, request.limit + 1).all<DiscussionMessageRow>();
    const items = rows.results.slice(0, request.limit).map(mapMessageRow);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last
        ? { nextCursor: encodePageCursor({ sort: last.sequence, id: last.id }) }
        : {}),
    };
  }
}

export function mapDiscussionThreadRow(row: DiscussionThreadRow): DiscussionThread {
  return {
    id: row.id,
    contextKind: row.context_kind,
    contextId: row.context_id,
    creatorMemberId: row.creator_member_id,
    lastSequence: row.last_sequence,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapThreadNullable(row: DiscussionThreadRow | null): DiscussionThread | null {
  return row ? mapDiscussionThreadRow(row) : null;
}

function mapMessageNullable(row: DiscussionMessageRow | null): DiscussionMessage | null {
  return row ? mapMessageRow(row) : null;
}

function mapMessageRow(row: DiscussionMessageRow): DiscussionMessage {
  let mentionMemberIds: unknown;
  try { mentionMemberIds = JSON.parse(row.mentions_json) as unknown; } catch { throw readFailed(); }
  if (!Array.isArray(mentionMemberIds) || !mentionMemberIds.every((value) => typeof value === "string")) throw readFailed();
  return {
    id: row.id,
    threadId: row.thread_id,
    sequence: row.sequence,
    authorMemberId: row.author_member_id,
    body: row.body,
    replyToMessageId: row.reply_to_message_id,
    mentionMemberIds,
    clientKey: row.client_key,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function writeFailed(): AppError {
  return new AppError("DISCUSSION_WRITE_FAILED", "Discussion write failed", 500, true);
}

function readFailed(): AppError {
  return new AppError("DISCUSSION_READ_FAILED", "Discussion read failed", 500, true);
}
