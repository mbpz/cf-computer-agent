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

export interface DiscussionThreadListQuery {
  sql: string;
  bindings: Array<string | number>;
}

export function buildDiscussionThreadListQueries(
  memberId: string,
  request: PageRequest,
): DiscussionThreadListQuery[] {
  const cursor = request.cursor === undefined
    ? undefined
    : decodePageCursor(request.cursor, TIMESTAMP_CURSOR_BOUNDS);
  const cursorSql = cursor
    ? " AND (discussion_thread_access.created_at < ? OR (discussion_thread_access.created_at = ? AND discussion_thread_access.thread_id < ?))"
    : "";
  const bindings = (): Array<string | number> => [
    memberId,
    ...(cursor ? [cursor.sort, cursor.sort, cursor.id] : []),
    request.limit + 1,
  ];
  const selectedColumns = discussionThreadColumns
    .split(",")
    .map((column) => `dt.${column.trim()}`)
    .join(", ");
  const query = (principalKind: "task_member" | "knowledge", principalIdSql: string): DiscussionThreadListQuery => ({
    sql: `WITH authorized_member AS (
      SELECT id, role FROM members WHERE id = ? AND status = 'active'
    )
    SELECT ${selectedColumns}
    FROM authorized_member am
    JOIN discussion_thread_access INDEXED BY idx_discussion_thread_access_principal_page
      ON discussion_thread_access.principal_kind = '${principalKind}'
     AND discussion_thread_access.principal_id = ${principalIdSql}
    JOIN discussion_threads dt ON dt.id = discussion_thread_access.thread_id
    WHERE 1 = 1${cursorSql}
    ORDER BY discussion_thread_access.created_at DESC,
             discussion_thread_access.thread_id DESC
    LIMIT ?`,
    bindings: bindings(),
  });
  return [
    query("task_member", "am.id"),
    query("knowledge", "CASE WHEN am.role = 'admin' THEN 'admin' ELSE 'shared' END"),
  ];
}

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
    const queries = buildDiscussionThreadListQueries(memberId, request);
    const results = await this.db.batch<DiscussionThreadRow>(queries.map(({ sql, bindings }) =>
      this.db.prepare(sql).bind(...bindings)));
    const rows = results.flatMap(({ results: queryRows }) => queryRows).sort((left, right) => {
      if (left.created_at !== right.created_at) return right.created_at - left.created_at;
      if (left.id === right.id) return 0;
      return left.id < right.id ? 1 : -1;
    }).slice(0, request.limit + 1);
    const items = rows.slice(0, request.limit).map(mapDiscussionThreadRow);
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > request.limit && last
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
