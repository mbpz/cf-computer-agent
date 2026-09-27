import { AppError } from "../http";
import { normalizeNumberedPageRequest, pageOffset, type NumberedPageRequest } from "../pagination";
export interface GoalTaskRow { id: string; title: string; linked: boolean; }
export class GoalTasksRepository {
  constructor(private readonly db: D1Database) {}
  async list(memberId: string, goalId: string, request: NumberedPageRequest) {
    const page = normalizeNumberedPageRequest(request, "GOAL_PAGE_INVALID");
    const [goal, count, rows, summary] = await this.db.batch<any>([
      this.db.prepare("SELECT updated_at FROM goals WHERE member_id = ? AND id = ?").bind(memberId, goalId),
      this.db.prepare("SELECT COUNT(*) AS total FROM tasks WHERE member_id = ?").bind(memberId),
      this.db.prepare(`SELECT t.id, t.title, EXISTS(SELECT 1 FROM goal_tasks gt WHERE gt.member_id = t.member_id AND gt.goal_id = ? AND gt.task_id = t.id) AS linked
        FROM tasks t WHERE t.member_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`).bind(goalId, memberId, page.pageSize, pageOffset(page, "GOAL_PAGE_INVALID")),
      this.db.prepare(`SELECT COUNT(*) AS taskCount, COALESCE(SUM(t.status = 'done'), 0) AS completedTaskCount FROM goal_tasks gt
        JOIN tasks t ON t.member_id = gt.member_id AND t.id = gt.task_id WHERE gt.member_id = ? AND gt.goal_id = ?`).bind(memberId, goalId),
    ]);
    if ([goal, count, rows, summary].some(result => !result.success)) throw new AppError("GOAL_TASK_READ_FAILED", "Unable to read goal tasks", 500);
    if (!goal.results[0]) return null;
    const total = count.results[0].total as number;
    return { goalId, expectedUpdatedAt: new Date(goal.results[0].updated_at).toISOString(), summary: summary.results[0] as { taskCount: number; completedTaskCount: number },
      items: rows.results.map(row => ({ id: row.id as string, title: row.title as string, linked: row.linked === 1 })), pagination: { ...page, total, totalPages: Math.ceil(total / page.pageSize) } };
  }
  async ownsTask(memberId: string, taskId: string): Promise<boolean> {
    return !!await this.db.prepare("SELECT id FROM tasks WHERE member_id = ? AND id = ?").bind(memberId, taskId).first();
  }
  async change(memberId: string, goalId: string, taskId: string, linked: boolean, expected: number, updatedAt: number): Promise<boolean | null> {
    const guard = "EXISTS(SELECT 1 FROM goals WHERE member_id = ? AND id = ? AND updated_at = ?) AND EXISTS(SELECT 1 FROM tasks WHERE member_id = ? AND id = ?)";
    const edge = linked
      ? this.db.prepare(`INSERT OR IGNORE INTO goal_tasks (member_id, goal_id, task_id, created_at) SELECT ?, ?, ?, ? WHERE ${guard}`).bind(memberId, goalId, taskId, updatedAt, memberId, goalId, expected, memberId, taskId)
      : this.db.prepare(`DELETE FROM goal_tasks WHERE member_id = ? AND goal_id = ? AND task_id = ? AND ${guard}`).bind(memberId, goalId, taskId, memberId, goalId, expected, memberId, taskId);
    // D1 batch is atomic: edge and version either commit together or roll back.
    const [changed, consumed] = await this.db.batch([edge, this.db.prepare(`UPDATE goals SET updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ? AND EXISTS(SELECT 1 FROM tasks WHERE member_id = ? AND id = ?)`).bind(updatedAt, memberId, goalId, expected, memberId, taskId)]);
    if (!changed.success || !consumed.success) throw new AppError("GOAL_TASK_WRITE_FAILED", "Unable to change goal task", 500);
    return consumed.meta.changes === 1 ? changed.meta.changes === 1 : null;
  }
}
