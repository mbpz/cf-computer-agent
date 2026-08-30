import {
  ACTIVE_KNOWLEDGE_ITEM_SQL,
  ACTIVE_KNOWLEDGE_SPACE_JOIN_SQL,
  authorizedKnowledgeMemberCteSql,
  readableKnowledgeRevisionSql,
} from "../library/read-authorization";
import { APP_CONFIG } from "../config";
import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import {
  discussionThreadColumns,
  mapDiscussionThreadRow,
  type DiscussionThreadRow,
} from "./repository";
import type { DiscussionAuthorizationPort } from "./service";
import type { DiscussionContext, DiscussionThread, DiscussionThreadPage } from "./types";

const TIMESTAMP_CURSOR_BOUNDS = { minSort: 0, maxSort: 8_640_000_000_000_000 } as const;

export class DiscussionTargetAuthorization implements DiscussionAuthorizationPort {
  constructor(private readonly db: D1Database) {}

  async canReadContext(memberId: string, context: DiscussionContext): Promise<boolean> {
    if (context.kind === "task") {
      const row = await this.db.prepare(
        `SELECT 1 AS visible
         FROM members m JOIN tasks t ON t.member_id = m.id
         WHERE m.id = ? AND m.status = 'active' AND t.id = ? AND t.member_id = ?
         LIMIT 1`,
      ).bind(memberId, context.id, memberId).first<{ visible: number }>();
      return row !== null;
    }
    const row = await this.db.prepare(
      `WITH ${authorizedKnowledgeMemberCteSql(false)}
       SELECT 1 AS visible FROM authorized_member am
       JOIN knowledge_items k
       JOIN revisions r ON r.id = k.current_revision_id
       ${ACTIVE_KNOWLEDGE_SPACE_JOIN_SQL}
       WHERE k.id = ? AND ${ACTIVE_KNOWLEDGE_ITEM_SQL}
         AND ${readableKnowledgeRevisionSql()}
       LIMIT 1`,
    ).bind(memberId, context.id).first<{ visible: number }>();
    return row !== null;
  }

  async findAuthorizedThread(memberId: string, threadId: string): Promise<DiscussionThread | null> {
    const row = await this.db.prepare(
      `SELECT ${discussionThreadColumns} FROM discussion_threads WHERE id = ? LIMIT 1`,
    ).bind(threadId).first<DiscussionThreadRow>();
    if (!row) return null;
    const thread = mapDiscussionThreadRow(row);
    return await this.canReadContext(memberId, {
      kind: thread.contextKind,
      id: thread.contextId,
    }) ? thread : null;
  }

  async listThreads(memberId: string, request: PageRequest): Promise<DiscussionThreadPage> {
    const cursor = request.cursor === undefined
      ? undefined
      : decodePageCursor(request.cursor, TIMESTAMP_CURSOR_BOUNDS);
    const bindings: Array<string | number> = [memberId, memberId];
    const cursorSql = cursor
      ? " AND (dt.created_at < ? OR (dt.created_at = ? AND dt.id < ?))"
      : "";
    if (cursor) bindings.push(cursor.sort, cursor.sort, cursor.id);
    const rows = await this.db.prepare(
      `WITH ${authorizedKnowledgeMemberCteSql(false)}
       SELECT ${discussionThreadColumns.split(",").map((column) => `dt.${column.trim()}`).join(", ")}
       FROM discussion_threads dt CROSS JOIN authorized_member am
       WHERE (
         (dt.context_kind = 'task' AND EXISTS (
           SELECT 1 FROM tasks t WHERE t.id = dt.context_id AND t.member_id = ?
         ))
         OR
         (dt.context_kind = 'knowledge' AND EXISTS (
           SELECT 1 FROM knowledge_items k
           JOIN revisions r ON r.id = k.current_revision_id
           ${ACTIVE_KNOWLEDGE_SPACE_JOIN_SQL}
           WHERE k.id = dt.context_id AND ${ACTIVE_KNOWLEDGE_ITEM_SQL}
             AND ${readableKnowledgeRevisionSql()}
         ))
       )${cursorSql}
       ORDER BY dt.created_at DESC, dt.id DESC LIMIT ?`,
    ).bind(...bindings, request.limit + 1).all<DiscussionThreadRow>();
    const items = rows.results.slice(0, request.limit).map(mapDiscussionThreadRow);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last
        ? { nextCursor: encodePageCursor({ sort: Date.parse(last.createdAt), id: last.id }) }
        : {}),
    };
  }

  async areEligibleMembers(memberIds: readonly string[], context: DiscussionContext): Promise<boolean> {
    const uniqueMemberIds = [...new Set(memberIds)];
    if (uniqueMemberIds.length !== memberIds.length || uniqueMemberIds.length > APP_CONFIG.maxDiscussionMentions) return false;
    if (uniqueMemberIds.length === 0) return true;
    const requestedJson = JSON.stringify(uniqueMemberIds);
    if (context.kind === "task") {
      const row = await this.db.prepare(
        `SELECT COUNT(*) AS eligible
         FROM json_each(?) requested
         JOIN members m ON m.id = requested.value AND m.status = 'active'
         JOIN tasks t ON t.member_id = m.id AND t.id = ?`,
      ).bind(requestedJson, context.id).first<{ eligible: number }>();
      return row?.eligible === uniqueMemberIds.length;
    }
    const row = await this.db.prepare(
      `SELECT COUNT(*) AS eligible
       FROM json_each(?) requested
       JOIN members m ON m.id = requested.value AND m.status = 'active'
       WHERE EXISTS (
         SELECT 1 FROM knowledge_items k
         JOIN revisions r ON r.id = k.current_revision_id
         ${ACTIVE_KNOWLEDGE_SPACE_JOIN_SQL}
         WHERE k.id = ? AND ${ACTIVE_KNOWLEDGE_ITEM_SQL}
           AND (r.visibility = 'shared' OR m.role = 'admin')
       )`,
    ).bind(requestedJson, context.id).first<{ eligible: number }>();
    return row?.eligible === uniqueMemberIds.length;
  }
}
