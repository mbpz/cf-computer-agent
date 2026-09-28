import type { WorkbenchReviewPeriod, WorkbenchReviewSnapshot } from "./types";

type Range = {periodKey: string; from: string; to: string};
type SnapshotRow = {id: string; period: WorkbenchReviewPeriod; period_key: string; payload_json: string; created_at: number; updated_at: number};
export interface WorkbenchReviewRepositoryPort {
  refresh(memberId: string, period: WorkbenchReviewPeriod, range: Range, now: Date): Promise<WorkbenchReviewSnapshot>;
}

// Only static column identifiers are passed here; all request values use bindings.
const instant = (column: string) => `strftime('%Y-%m-%dT%H:%M:%fZ', ${column} / 1000.0, 'unixepoch')`;
const inPeriod = (column: string) => `${column} >= b.start AND ${column} < b.finish AND ${column} <= b.observed`;
const open = "status IN ('todo', 'doing', 'blocked')";
const taskJson = `json_object('id', id, 'memberId', member_id, 'title', title, 'notes', notes, 'status', status, 'progress', progress, 'priority', priority, 'dueAt', ${instant("due_at")}, 'completedAt', ${instant("completed_at")}, 'createdAt', ${instant("created_at")}, 'updatedAt', ${instant("updated_at")})`;
const inboxJson = `json_object('id', id, 'memberId', member_id, 'clientKey', client_key, 'kind', kind, 'content', content, 'sourceUrl', source_url, 'status', status, 'promotedTaskId', promoted_task_id, 'promotedSubmissionId', promoted_submission_id, 'createdAt', ${instant("created_at")}, 'updatedAt', ${instant("updated_at")})`;
const projectJson = `json_object('id', id, 'memberId', member_id, 'clientKey', client_key, 'title', title, 'description', description, 'status', status, 'progress', progress, 'targetAt', ${instant("target_at")}, 'createdAt', ${instant("created_at")}, 'updatedAt', ${instant("updated_at")})`;
const sample = (relation: string, json: string, order: string) => `(SELECT json_group_array(json(item)) FROM (SELECT ${json} AS item FROM ${relation} ORDER BY ${order}, id ASC LIMIT 20))`;

export class WorkbenchReviewRepository implements WorkbenchReviewRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async refresh(memberId: string, period: WorkbenchReviewPeriod, range: Range, now: Date): Promise<WorkbenchReviewSnapshot> {
    const observed = now.getTime();
    // One SQLite statement owns both the source snapshot and the upsert. There is
    // no JS read/write gap and RETURNING belongs to this statement, not a later GET.
    // D1 numeric bindings can encode integer-valued timestamps as JSON real values.
    // Keep both numeric types when preserving a newer observation cutoff.
    const row = await this.db.prepare(`
      WITH input AS (SELECT ? AS member, ? AS start, ? AS finish, ? AS observed, ? AS period, ? AS period_key),
      clock AS (
        SELECT input.*, MAX(input.observed, COALESCE((
          SELECT CASE WHEN json_valid(payload_json) THEN
            CASE WHEN json_type(payload_json, '$.observedAt') IN ('integer', 'real') THEN json_extract(payload_json, '$.observedAt') END
          END FROM workbench_review_snapshots
          WHERE member_id = input.member AND period = input.period AND period_key = input.period_key
        ), input.observed)) AS effective FROM input
      ),
      b AS (SELECT member, start, finish, effective AS observed, CAST(effective / 86400000 AS INTEGER) * 86400000 AS day FROM clock),
      activity AS (SELECT t.* FROM tasks t, b WHERE t.member_id = b.member AND ${inPeriod("CASE WHEN status = 'done' THEN completed_at ELSE updated_at END")}),
      completed AS (SELECT * FROM activity WHERE status = 'done'),
      blocked AS (SELECT * FROM activity WHERE status = 'blocked'),
      overdue AS (SELECT t.* FROM tasks t, b WHERE t.member_id = b.member AND ${open} AND ${inPeriod("due_at")} AND due_at < b.observed),
      due_today AS (SELECT t.* FROM tasks t, b WHERE t.member_id = b.member AND ${open} AND due_at >= b.day AND due_at < b.day + 86400000 AND due_at >= b.start AND due_at < b.finish),
      captures AS (SELECT i.* FROM inbox_items i, b WHERE i.member_id = b.member AND status = 'inbox' AND ${inPeriod("created_at")}),
      active_projects AS (SELECT p.* FROM projects p, b WHERE p.member_id = b.member AND status = 'active' AND ${inPeriod("updated_at")}),
      ended_focus AS (SELECT f.* FROM focus_sessions f, b WHERE f.member_id = b.member AND status IN ('completed', 'abandoned') AND ${inPeriod("ended_at")})
      INSERT INTO workbench_review_snapshots (id, member_id, period, period_key, payload_json, created_at, updated_at)
      SELECT ?, b.member, ?, ?, json_object(
        'from', ?, 'to', ?, 'observedAt', b.observed,
        'taskSummary', json_object(
          'todo', (SELECT COUNT(*) FROM activity WHERE status = 'todo'),
          'doing', (SELECT COUNT(*) FROM activity WHERE status = 'doing'),
          'blocked', (SELECT COUNT(*) FROM blocked),
          'done', (SELECT COUNT(*) FROM completed),
          'canceled', (SELECT COUNT(*) FROM activity WHERE status = 'canceled'),
          'dueToday', (SELECT COUNT(*) FROM due_today),
          'overdue', (SELECT COUNT(*) FROM overdue)),
        'completed', json(${sample("completed", taskJson, "completed_at DESC")}),
        'overdue', json(${sample("overdue", taskJson, "due_at ASC")}),
        'blocked', json(${sample("blocked", taskJson, "updated_at DESC")}),
        'inbox', json(${sample("captures", inboxJson, "created_at DESC")}),
        'projects', json(${sample("active_projects", projectJson, "updated_at DESC")}),
        'focusElapsedMs', (SELECT COALESCE(SUM(elapsed_ms), 0) FROM ended_focus)
      ), b.observed, b.observed FROM b WHERE true
      ON CONFLICT(member_id, period, period_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = MAX(workbench_review_snapshots.updated_at + 1, excluded.updated_at)
      RETURNING id, period, period_key, payload_json, created_at, updated_at
    `).bind(memberId, Date.parse(range.from), Date.parse(range.to), observed, period, range.periodKey,
      `review:${memberId}:${period}:${range.periodKey}`, period, range.periodKey, range.from, range.to).first<SnapshotRow>();
    if (!row) throw new Error("REVIEW_SNAPSHOT_WRITE_FAILED");
    const {observedAt: _observedAt, ...payload} = JSON.parse(row.payload_json) as Omit<WorkbenchReviewSnapshot, "id" | "period" | "periodKey" | "createdAt" | "updatedAt"> & {observedAt?: number};
    // Persisted identity wins over any payload fields.
    return {...payload, id: row.id, period: row.period, periodKey: row.period_key, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString()};
  }
}
