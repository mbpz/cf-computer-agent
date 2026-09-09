import type { WorkbenchReviewPeriod, WorkbenchReviewSnapshot } from "./types";

export interface WorkbenchReviewRepositoryPort {
  find(memberId: string, period: WorkbenchReviewPeriod, periodKey: string): Promise<WorkbenchReviewSnapshot | null>;
  upsert(memberId: string, snapshot: WorkbenchReviewSnapshot): Promise<WorkbenchReviewSnapshot>;
}

export class WorkbenchReviewRepository implements WorkbenchReviewRepositoryPort {
  constructor(private readonly db: D1Database) {}
  async find(memberId: string, period: WorkbenchReviewPeriod, periodKey: string): Promise<WorkbenchReviewSnapshot | null> {
    const row = await this.db.prepare("SELECT id, period, period_key, payload_json, created_at, updated_at FROM workbench_review_snapshots WHERE member_id = ? AND period = ? AND period_key = ? LIMIT 1").bind(memberId, period, periodKey).first<{ id: string; period: WorkbenchReviewPeriod; period_key: string; payload_json: string; created_at: number; updated_at: number }>();
    if (!row) return null;
    const payload = JSON.parse(row.payload_json) as Omit<WorkbenchReviewSnapshot, "id" | "period" | "periodKey" | "createdAt" | "updatedAt">;
    return { id: row.id, period: row.period, periodKey: row.period_key, ...payload, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
  }
  async upsert(memberId: string, snapshot: WorkbenchReviewSnapshot): Promise<WorkbenchReviewSnapshot> {
    const now = Date.parse(snapshot.updatedAt);
    const created = Date.parse(snapshot.createdAt);
    const payload = { from: snapshot.from, to: snapshot.to, taskSummary: snapshot.taskSummary, completed: snapshot.completed, overdue: snapshot.overdue, blocked: snapshot.blocked, inbox: snapshot.inbox, projects: snapshot.projects, focusElapsedMs: snapshot.focusElapsedMs };
    await this.db.prepare("INSERT INTO workbench_review_snapshots (id, member_id, period, period_key, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(member_id, period, period_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at").bind(snapshot.id, memberId, snapshot.period, snapshot.periodKey, JSON.stringify(payload), created, now).run();
    return (await this.find(memberId, snapshot.period, snapshot.periodKey))!;
  }
}
