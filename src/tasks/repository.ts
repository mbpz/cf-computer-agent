import { normalizeNumberedPageRequest, pageOffset } from "../pagination";
import { queryNumberedPage } from "../pagination-d1";
import {
  ACTIVE_KNOWLEDGE_ITEM_SQL,
  ACTIVE_KNOWLEDGE_SPACE_JOIN_SQL,
  authorizedKnowledgeMemberCteSql,
  readableKnowledgeRevisionSql,
} from "../library/read-authorization";
import type { Task, TaskCreate, TaskLink, TaskLinkInsert, TaskListRequest, TaskPage, TaskStatus, TaskStatusNotificationIntent, TaskSummary, TaskUpdate } from "./types";

export interface TasksRepositoryPort {
  insert(input: TaskCreate): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<Task | null>;
  list(memberId: string, request: TaskListRequest): Promise<TaskPage>;
  update(memberId: string, id: string, input: TaskUpdate): Promise<Task | null>;
  compareAndSetStatus(memberId: string, id: string, expectedStatus: TaskStatus, status: TaskStatus, completedAt: number | null, progress: number, updatedAt: number): Promise<boolean>;
  listPendingStatusNotifications(memberId: string, taskId: string, limit: number): Promise<TaskStatusNotificationIntent[]>;
  markStatusNotificationDelivered(memberId: string, intentId: string, deliveredAt: number): Promise<boolean>;
  updateProgress(memberId: string, id: string, progress: number, updatedAt: number): Promise<Task | null>;
  delete(memberId: string, id: string): Promise<boolean>;
  countByMember(memberId: string): Promise<number>;
  summary(memberId: string, now: Date): Promise<TaskSummary>;
  listTags(memberId: string, taskId: string): Promise<string[]>;
  replaceTags(memberId: string, taskId: string, tags: readonly string[]): Promise<void>;
  listLinks(memberId: string, taskId: string): Promise<TaskLink[]>;
  insertLink(link: TaskLinkInsert): Promise<boolean>;
  findLink(memberId: string, taskId: string, knowledgeItemId: string): Promise<TaskLink | null>;
  deleteLink(memberId: string, taskId: string, linkId: string): Promise<boolean>;
  countLinks(memberId: string, taskId: string): Promise<number>;
  isKnowledgeVisible(memberId: string, knowledgeItemId: string): Promise<boolean>;
}

type TaskRow = {
  id: string; member_id: string; title: string; notes: string; status: TaskStatus;
  progress: number; priority: Task["priority"]; due_at: number | null; completed_at: number | null;
  created_at: number; updated_at: number;
};
type LinkRow = { id: string; task_id: string; knowledge_item_id: string; title: string | null; created_at: number };
type SummaryRow = { status: TaskStatus; due_at: number | null };
type TaskStatusNotificationIntentRow = {
  id: string; recipient_member_id: string; task_id: string; previous_status: TaskStatus;
  status: TaskStatus; deduplication_key: string; created_at: number;
};

const taskColumns = "id, member_id, title, notes, status, progress, priority, due_at, completed_at, created_at, updated_at";
const OPEN_STATUSES = "('todo', 'doing', 'blocked')";

export class TasksRepository implements TasksRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: TaskCreate): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', 0, ?, ?, ?, ?)`,
    ).bind(input.id, input.memberId, input.title, input.notes, input.priority, input.dueAt, input.createdAt, input.updatedAt).run();
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, id: string): Promise<Task | null> {
    return mapTask(await this.db.prepare(
      `SELECT ${taskColumns} FROM tasks WHERE member_id = ? AND id = ? LIMIT 1`,
    ).bind(memberId, id).first<TaskRow>());
  }

  async list(memberId: string, request: TaskListRequest): Promise<TaskPage> {
    const pagination = normalizeNumberedPageRequest(request, "TASK_PAGE_INVALID");
    const conditions = ["member_id = ?"];
    const bindings: (string | number)[] = [memberId];
    const { filters } = request;
    if (filters.status) { conditions.push("status = ?"); bindings.push(filters.status); }
    if (filters.priority) { conditions.push("priority = ?"); bindings.push(filters.priority); }
    if (filters.tag) {
      conditions.push("id IN (SELECT task_id FROM task_tags WHERE member_id = ? AND tag = ?)");
      bindings.push(memberId, filters.tag);
    }
    if (filters.due) {
      const now = Date.now();
      const startOfDay = now - (now % 86_400_000);
      const endOfDay = startOfDay + 86_400_000;
      if (filters.due === "none") conditions.push("due_at IS NULL");
      if (filters.due === "today") { conditions.push(`due_at >= ? AND due_at < ? AND status IN ${OPEN_STATUSES}`); bindings.push(startOfDay, endOfDay); }
      if (filters.due === "overdue") { conditions.push(`due_at < ? AND status IN ${OPEN_STATUSES}`); bindings.push(startOfDay); }
    }
    if (filters.q) { conditions.push("title LIKE ? ESCAPE '\\'"); bindings.push(`%${escapeLike(filters.q)}%`); }
    const where = conditions.join(" AND ");
    return queryNumberedPage(
      this.db,
      this.db.prepare(`SELECT COUNT(*) AS total FROM tasks WHERE ${where}`).bind(...bindings),
      this.db.prepare(`SELECT ${taskColumns} FROM tasks WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, pagination.pageSize, pageOffset(pagination, "TASK_PAGE_INVALID")),
      pagination,
      (row) => mapTaskRow(row as TaskRow),
    );
  }

  async update(memberId: string, id: string, input: TaskUpdate): Promise<Task | null> {
    const result = await this.db.prepare(
      `UPDATE tasks SET title = ?, notes = ?, priority = ?, due_at = ?, updated_at = ? WHERE member_id = ? AND id = ?`,
    ).bind(input.title, input.notes, input.priority, input.dueAt, input.updatedAt, memberId, id).run();
    return result.meta.changes === 1 ? this.findOwned(memberId, id) : null;
  }

  async compareAndSetStatus(memberId: string, id: string, expectedStatus: TaskStatus, status: TaskStatus, completedAt: number | null, progress: number, updatedAt: number): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE tasks
       SET status = ?, completed_at = ?, progress = ?, updated_at = ?, status_version = status_version + 1
       WHERE member_id = ? AND id = ? AND status = ?`,
    ).bind(status, completedAt, progress, updatedAt, memberId, id, expectedStatus).run();
    // D1 includes the trigger's outbox INSERT in meta.changes for a winner.
    return result.meta.changes > 0;
  }

  async listPendingStatusNotifications(memberId: string, taskId: string, limit: number): Promise<TaskStatusNotificationIntent[]> {
    const rows = await this.db.prepare(
      `SELECT id, recipient_member_id, task_id, previous_status, status, deduplication_key, created_at
       FROM task_status_notification_intents
       WHERE recipient_member_id = ? AND task_id = ? AND delivered_at IS NULL
       ORDER BY created_at, id LIMIT ?`,
    ).bind(memberId, taskId, limit).all<TaskStatusNotificationIntentRow>();
    return rows.results.map(mapStatusNotificationIntent);
  }

  async markStatusNotificationDelivered(memberId: string, intentId: string, deliveredAt: number): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE task_status_notification_intents SET delivered_at = ?
       WHERE recipient_member_id = ? AND id = ? AND delivered_at IS NULL`,
    ).bind(deliveredAt, memberId, intentId).run();
    return result.meta.changes === 1;
  }

  async updateProgress(memberId: string, id: string, progress: number, updatedAt: number): Promise<Task | null> {
    const result = await this.db.prepare(
      `UPDATE tasks SET progress = ?, updated_at = ? WHERE member_id = ? AND id = ?`,
    ).bind(progress, updatedAt, memberId, id).run();
    return result.meta.changes === 1 ? this.findOwned(memberId, id) : null;
  }

  async delete(memberId: string, id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM tasks WHERE member_id = ? AND id = ?").bind(memberId, id).run();
    // workerd counts FK-cascade rows (task_tags/task_links) in meta.changes,
    // so a delete with children reports more than 1 change.
    return result.meta.changes > 0;
  }

  async countByMember(memberId: string): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE member_id = ?").bind(memberId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async summary(memberId: string, now: Date): Promise<TaskSummary> {
    const rows = await this.db.prepare(
      `SELECT status, due_at FROM tasks WHERE member_id = ?`,
    ).bind(memberId).all<SummaryRow>();
    const startOfDay = now.getTime() - (now.getTime() % 86_400_000);
    const endOfDay = startOfDay + 86_400_000;
    const summary: TaskSummary = { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 };
    for (const row of rows.results) {
      summary[row.status] += 1;
      if (row.status === "todo" || row.status === "doing" || row.status === "blocked") {
        if (row.due_at !== null && row.due_at < startOfDay) summary.overdue += 1;
        if (row.due_at !== null && row.due_at >= startOfDay && row.due_at < endOfDay) summary.dueToday += 1;
      }
    }
    return summary;
  }

  async listTags(memberId: string, taskId: string): Promise<string[]> {
    const rows = await this.db.prepare(
      "SELECT tag FROM task_tags WHERE member_id = ? AND task_id = ? ORDER BY tag",
    ).bind(memberId, taskId).all<{ tag: string }>();
    return rows.results.map((row) => row.tag);
  }

  async replaceTags(memberId: string, taskId: string, tags: readonly string[]): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM task_tags WHERE member_id = ? AND task_id = ?").bind(memberId, taskId),
      ...tags.map((tag) => this.db.prepare(
        "INSERT INTO task_tags (task_id, member_id, tag) VALUES (?, ?, ?)",
      ).bind(taskId, memberId, tag)),
    ]);
  }

  async listLinks(memberId: string, taskId: string): Promise<TaskLink[]> {
    const rows = await this.db.prepare(
      `SELECT tl.id, tl.task_id, tl.knowledge_item_id, r.title, tl.created_at
       FROM task_links tl
       LEFT JOIN knowledge_items ki ON ki.id = tl.knowledge_item_id
       LEFT JOIN revisions r ON r.id = ki.current_revision_id
       WHERE tl.member_id = ? AND tl.task_id = ?
       ORDER BY tl.created_at DESC, tl.id DESC`,
    ).bind(memberId, taskId).all<LinkRow>();
    return rows.results.map(mapLinkRow);
  }

  async insertLink(link: TaskLinkInsert): Promise<boolean> {
    const result = await this.db.prepare(
      "INSERT OR IGNORE INTO task_links (id, task_id, member_id, knowledge_item_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(link.id, link.taskId, link.memberId, link.knowledgeItemId, link.createdAt).run();
    return result.meta.changes === 1;
  }

  async findLink(memberId: string, taskId: string, knowledgeItemId: string): Promise<TaskLink | null> {
    const row = await this.db.prepare(
      `SELECT tl.id, tl.task_id, tl.knowledge_item_id, r.title, tl.created_at
       FROM task_links tl
       LEFT JOIN knowledge_items ki ON ki.id = tl.knowledge_item_id
       LEFT JOIN revisions r ON r.id = ki.current_revision_id
       WHERE tl.member_id = ? AND tl.task_id = ? AND tl.knowledge_item_id = ? LIMIT 1`,
    ).bind(memberId, taskId, knowledgeItemId).first<LinkRow>();
    return row ? mapLinkRow(row) : null;
  }

  async deleteLink(memberId: string, taskId: string, linkId: string): Promise<boolean> {
    const result = await this.db.prepare(
      "DELETE FROM task_links WHERE member_id = ? AND task_id = ? AND id = ?",
    ).bind(memberId, taskId, linkId).run();
    return result.meta.changes === 1;
  }

  async countLinks(memberId: string, taskId: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) AS n FROM task_links WHERE member_id = ? AND task_id = ?",
    ).bind(memberId, taskId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async isKnowledgeVisible(memberId: string, knowledgeItemId: string): Promise<boolean> {
    const row = await this.db.prepare(
      `WITH ${authorizedKnowledgeMemberCteSql(false)}
       SELECT 1 AS visible FROM authorized_member am
       JOIN knowledge_items k
       JOIN revisions r ON r.id = k.current_revision_id
       ${ACTIVE_KNOWLEDGE_SPACE_JOIN_SQL}
       WHERE k.id = ? AND ${ACTIVE_KNOWLEDGE_ITEM_SQL}
         AND ${readableKnowledgeRevisionSql()}
       LIMIT 1`,
    ).bind(memberId, knowledgeItemId).first<{ visible: number }>();
    return row !== null;
  }
}

function mapTask(row: TaskRow | null): Task | null {
  return row ? mapTaskRow(row) : null;
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    memberId: row.member_id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    progress: row.progress,
    priority: row.priority,
    dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    completedAt: row.completed_at === null ? null : new Date(row.completed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapLinkRow(row: LinkRow): TaskLink {
  return {
    id: row.id,
    taskId: row.task_id,
    knowledgeItemId: row.knowledge_item_id,
    knowledgeTitle: row.title,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapStatusNotificationIntent(row: TaskStatusNotificationIntentRow): TaskStatusNotificationIntent {
  return {
    id: row.id,
    recipientMemberId: row.recipient_member_id,
    taskId: row.task_id,
    previousStatus: row.previous_status,
    status: row.status,
    deduplicationKey: row.deduplication_key,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}
