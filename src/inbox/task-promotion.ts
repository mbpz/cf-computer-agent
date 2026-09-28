import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import { planningConflict } from "../planning-version";
import { normalizeTaskCreate } from "../tasks/service";
import { InboxRepository } from "./repository";
import type { InboxItem, InboxTaskPromotionResult } from "./types";

/** Task, audit and Inbox receipt share one D1 transaction; no external effects. */
export class InboxTaskPromotion {
  constructor(private readonly db: D1Database) {}

  async promote(memberId: string, item: InboxItem, updatedAt: number): Promise<InboxTaskPromotionResult> {
    if (item.memberId !== memberId) throw new AppError("INBOX_NOT_FOUND", "Inbox item not found", 404);
    let promoted = false;
    if (!item.promotedTaskId) {
      const task = normalizeTaskCreate({
        id: crypto.randomUUID(),
        title: item.kind === "link" ? item.sourceUrl || item.content : item.content.slice(0, 200),
        notes: item.content, priority: "medium",
      });
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at)
          SELECT ?, member_id, ?, ?, 'todo', 0, 'medium', ?, ? FROM inbox_items
          WHERE member_id = ? AND id = ? AND updated_at = ? AND status IN ('inbox', 'archived')
          AND promoted_task_id IS NULL AND promoted_submission_id IS NULL
          AND (SELECT COUNT(*) FROM tasks WHERE member_id = ?) < ?`)
          .bind(task.id, task.title, task.notes, updatedAt, updatedAt, memberId, item.id, Date.parse(item.updatedAt), memberId, APP_CONFIG.maxTasksPerMember),
        // changes() refers to the immediately preceding INSERT in this batch.
        this.db.prepare(`INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at)
          SELECT ?, 'member', ?, 'task.created', 'task', ?, ?, ? WHERE changes() = 1`)
          .bind(crypto.randomUUID(), memberId, task.id, JSON.stringify({ status: "todo", priority: "medium" }), new Date(updatedAt).toISOString()),
        this.db.prepare(`UPDATE inbox_items SET status = 'promoted', promoted_task_id = ?, updated_at = ?
          WHERE member_id = ? AND id = ? AND updated_at = ? AND status IN ('inbox', 'archived')
          AND promoted_task_id IS NULL AND promoted_submission_id IS NULL
          AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND member_id = ?)`)
          .bind(task.id, updatedAt, memberId, item.id, Date.parse(item.updatedAt), task.id, memberId),
      ]);
      promoted = results[2]!.meta.changes === 1;
    }
    const current = await new InboxRepository(this.db).findOwned(memberId, item.id);
    if (!current) throw new AppError("INBOX_NOT_FOUND", "Inbox item not found", 404);
    if (!current.promotedTaskId || current.status !== "promoted" || current.promotedSubmissionId) {
      const count = await this.db.prepare("SELECT COUNT(*) AS total FROM tasks WHERE member_id = ?")
        .bind(memberId).first<{ total: number }>();
      if (current.updatedAt === item.updatedAt && (count?.total ?? 0) >= APP_CONFIG.maxTasksPerMember) {
        throw new AppError("TASK_LIMIT_REACHED", "Task limit reached", 409);
      }
      throw planningConflict("INBOX");
    }
    const target = await this.db.prepare("SELECT id FROM tasks WHERE id = ? AND member_id = ?")
      .bind(current.promotedTaskId, memberId).first<{ id: string }>();
    if (!target) throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
    return { item: current, promoted, taskId: target.id };
  }
}
