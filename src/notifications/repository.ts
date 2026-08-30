import { normalizeNumberedPageRequest, pageOffset } from "../pagination";
import { queryNumberedPage } from "../pagination-d1";
import type {
  Notification,
  NotificationBulkReadSelection,
  DueNotificationCandidate,
  NotificationEventType,
  NotificationInsert,
  NotificationListRequest,
  NotificationPage,
  NotificationPayload,
  NotificationSummary,
  NotificationTargetKind,
} from "./types";

export interface NotificationsRepositoryPort {
  insert(input: NotificationInsert): Promise<boolean>;
  findByDeduplicationKey(recipientMemberId: string, deduplicationKey: string): Promise<Notification | null>;
  findOwned(recipientMemberId: string, id: string): Promise<Notification | null>;
  list(recipientMemberId: string, request: NotificationListRequest): Promise<NotificationPage>;
  summary(recipientMemberId: string): Promise<NotificationSummary>;
  markRead(recipientMemberId: string, id: string, readAt: number): Promise<boolean>;
  markManyRead(recipientMemberId: string, selection: NotificationBulkReadSelection, readAt: number): Promise<number>;
}

type NotificationRow = {
  id: string;
  recipient_member_id: string;
  event_type: NotificationEventType;
  actor_member_id: string | null;
  target_kind: NotificationTargetKind;
  target_id: string;
  payload_json: string;
  deduplication_key: string;
  read_at: number | null;
  created_at: number;
};

const notificationColumns = `id, recipient_member_id, event_type, actor_member_id, target_kind,
  target_id, payload_json, deduplication_key, read_at, created_at`;

export class NotificationsRepository implements NotificationsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: NotificationInsert): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO notifications
       (id, recipient_member_id, event_type, actor_member_id, target_kind, target_id,
        payload_json, deduplication_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.id,
      input.recipientMemberId,
      input.eventType,
      input.actorMemberId,
      input.targetKind,
      input.targetId,
      input.payloadJson,
      input.deduplicationKey,
      input.createdAt,
    ).run();
    return result.meta.changes === 1;
  }

  async findByDeduplicationKey(recipientMemberId: string, deduplicationKey: string): Promise<Notification | null> {
    return mapNullable(await this.db.prepare(
      `SELECT ${notificationColumns} FROM notifications
       WHERE recipient_member_id = ? AND deduplication_key = ? LIMIT 1`,
    ).bind(recipientMemberId, deduplicationKey).first<NotificationRow>());
  }

  async findOwned(recipientMemberId: string, id: string): Promise<Notification | null> {
    return mapNullable(await this.db.prepare(
      `SELECT ${notificationColumns} FROM notifications
       WHERE recipient_member_id = ? AND id = ? LIMIT 1`,
    ).bind(recipientMemberId, id).first<NotificationRow>());
  }

  async list(recipientMemberId: string, request: NotificationListRequest): Promise<NotificationPage> {
    const pagination = normalizeNumberedPageRequest(request, "NOTIFICATION_PAGE_INVALID");
    const conditions = ["recipient_member_id = ?"];
    const bindings: Array<string | number> = [recipientMemberId];
    if (request.filters.eventType) {
      conditions.push("event_type = ?");
      bindings.push(request.filters.eventType);
    }
    if (request.filters.read === true) conditions.push("read_at IS NOT NULL");
    if (request.filters.read === false) conditions.push("read_at IS NULL");
    const where = conditions.join(" AND ");
    return queryNumberedPage(
      this.db,
      this.db.prepare(`SELECT COUNT(*) AS total FROM notifications WHERE ${where}`).bind(...bindings),
      this.db.prepare(
        `SELECT ${notificationColumns} FROM notifications WHERE ${where}
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).bind(...bindings, pagination.pageSize, pageOffset(pagination, "NOTIFICATION_PAGE_INVALID")),
      pagination,
      (row) => mapRow(row as NotificationRow),
    );
  }

  async summary(recipientMemberId: string): Promise<NotificationSummary> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) AS unread FROM notifications WHERE recipient_member_id = ? AND read_at IS NULL",
    ).bind(recipientMemberId).first<{ unread: number }>();
    return { unread: row?.unread ?? 0 };
  }

  async markRead(recipientMemberId: string, id: string, readAt: number): Promise<boolean> {
    const result = await this.db.prepare(
      "UPDATE notifications SET read_at = ? WHERE recipient_member_id = ? AND id = ? AND read_at IS NULL",
    ).bind(readAt, recipientMemberId, id).run();
    return result.meta.changes === 1;
  }

  async markManyRead(recipientMemberId: string, selection: NotificationBulkReadSelection, readAt: number): Promise<number> {
    const conditions = ["recipient_member_id = ?", "read_at IS NULL"];
    const bindings: Array<string | number> = [recipientMemberId];
    if (selection.ids) {
      if (selection.ids.length === 0) return 0;
      conditions.push("id IN (SELECT value FROM json_each(?))");
      bindings.push(JSON.stringify(selection.ids));
    }
    if (selection.eventType) {
      conditions.push("event_type = ?");
      bindings.push(selection.eventType);
    }
    if (selection.createdBefore !== undefined) {
      conditions.push("created_at <= ?");
      bindings.push(selection.createdBefore);
    }
    const result = await this.db.prepare(
      `UPDATE notifications SET read_at = ?
       WHERE recipient_member_id = ? AND id IN (
         SELECT id FROM notifications WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC, id DESC LIMIT ?
       )`,
    ).bind(readAt, recipientMemberId, ...bindings, selection.limit).run();
    return result.meta.changes;
  }

  async listDueCandidates(recipientMemberId: string, observedAt: number, limit: number): Promise<DueNotificationCandidate[]> {
    const startOfDay = observedAt - (observedAt % 86_400_000);
    const endOfDay = startOfDay + 86_400_000;
    const rows = await this.db.prepare(
      `SELECT t.id AS task_id, t.due_at
       FROM tasks t
       WHERE t.member_id = ? AND t.status IN ('todo', 'doing', 'blocked')
         AND t.due_at IS NOT NULL AND t.due_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.recipient_member_id = ?
             AND n.deduplication_key = 'task:' || t.id || ':' ||
               CASE WHEN t.due_at < ? THEN 'overdue' ELSE 'due' END || ':' || t.due_at
         )
       ORDER BY t.due_at, t.id LIMIT ?`,
    ).bind(recipientMemberId, endOfDay, recipientMemberId, startOfDay, limit).all<{ task_id: string; due_at: number }>();
    return rows.results.map(({ task_id, due_at }) => ({ taskId: task_id, dueAt: due_at }));
  }
}

function mapNullable(row: NotificationRow | null): Notification | null {
  return row ? mapRow(row) : null;
}

function mapRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientMemberId: row.recipient_member_id,
    eventType: row.event_type,
    actorMemberId: row.actor_member_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    payload: JSON.parse(row.payload_json) as NotificationPayload,
    deduplicationKey: row.deduplication_key,
    readAt: row.read_at === null ? null : new Date(row.read_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
