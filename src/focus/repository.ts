import type { FocusSession, FocusStatus } from "./types";

export interface FocusRepositoryPort {
  insert(input: { id: string; memberId: string; taskId: string; calendarEventId: string | null; clientKey: string; startTitle: string; durationMinutes: number; status: FocusStatus; startedAt: number; elapsedMs: number; createdAt: number; updatedAt: number }): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<FocusSession | null>;
  findByClientKey(memberId: string, clientKey: string): Promise<FocusSession | null>;
  findOpen(memberId: string): Promise<FocusSession | null>;
  update(memberId: string, id: string, input: { expectedUpdatedAt: number; status: FocusStatus; startedAt: number; pausedAt: number | null; endedAt: number | null; elapsedMs: number; updatedAt: number }): Promise<FocusSession | null>;
}

type FocusRow = { id: string; member_id: string; task_id: string; calendar_event_id: string | null; client_key: string; start_title: string | null; duration_minutes: number | null; status: FocusStatus; started_at: number; paused_at: number | null; ended_at: number | null; elapsed_ms: number; created_at: number; updated_at: number };
const columns = "id, member_id, task_id, calendar_event_id, client_key, start_title, duration_minutes, status, started_at, paused_at, ended_at, elapsed_ms, created_at, updated_at";

export class FocusRepository implements FocusRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: { id: string; memberId: string; taskId: string; calendarEventId: string | null; clientKey: string; startTitle: string; durationMinutes: number; status: FocusStatus; startedAt: number; elapsedMs: number; createdAt: number; updatedAt: number }): Promise<boolean> {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO focus_sessions (id, member_id, task_id, calendar_event_id, client_key, start_title, duration_minutes, status, started_at, elapsed_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.id, input.memberId, input.taskId, input.calendarEventId, input.clientKey, input.startTitle, input.durationMinutes, input.status, input.startedAt, input.elapsedMs, input.createdAt, input.updatedAt);
    // Only the winning insert creates a block. D1 batch rolls back both writes on failure.
    if (!input.calendarEventId) return (await insert.run()).meta.changes === 1;
    const [result] = await this.db.batch([
      insert,
      this.db.prepare(`INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, all_day, status, task_id, created_at, updated_at)
        SELECT calendar_event_id, member_id, ?, 'focus', start_title, started_at, started_at + duration_minutes * 60000, 'UTC', 0, 'scheduled', task_id, created_at, updated_at
        FROM focus_sessions WHERE member_id = ? AND id = ? AND changes() = 1`)
        .bind(`focus:${input.clientKey}`, input.memberId, input.id),
    ]);
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, id: string): Promise<FocusSession | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM focus_sessions WHERE member_id = ? AND id = ? LIMIT 1`).bind(memberId, id).first<FocusRow>());
  }

  async findByClientKey(memberId: string, clientKey: string): Promise<FocusSession | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM focus_sessions WHERE member_id = ? AND client_key = ? LIMIT 1`).bind(memberId, clientKey).first<FocusRow>());
  }

  async findOpen(memberId: string): Promise<FocusSession | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM focus_sessions WHERE member_id = ? AND status IN ('active', 'paused') ORDER BY updated_at DESC, id DESC LIMIT 1`).bind(memberId).first<FocusRow>());
  }

  async update(memberId: string, id: string, input: { expectedUpdatedAt: number; status: FocusStatus; startedAt: number; pausedAt: number | null; endedAt: number | null; elapsedMs: number; updatedAt: number }): Promise<FocusSession | null> {
    const terminal = input.status === "completed" || input.status === "abandoned";
    const update = this.db.prepare(`UPDATE focus_sessions SET status = ?, started_at = ?, paused_at = ?, ended_at = ?, elapsed_ms = ?, updated_at = ?
      WHERE member_id = ? AND id = ? AND updated_at = ?
      ${terminal ? `AND (calendar_event_id IS NULL OR EXISTS (SELECT 1 FROM calendar_events c WHERE c.id = focus_sessions.calendar_event_id AND c.member_id = focus_sessions.member_id AND c.kind = 'focus' AND c.task_id = focus_sessions.task_id))` : ""}
      RETURNING ${columns}`)
      .bind(input.status, input.startedAt, input.pausedAt, input.endedAt, input.elapsedMs, input.updatedAt, memberId, id, input.expectedUpdatedAt);
    if (!terminal) return mapRow(await update.first<FocusRow>());
    const [result] = await this.db.batch<FocusRow>([
      update,
      this.db.prepare(`UPDATE calendar_events SET status = ?, updated_at = MAX(updated_at + 1, ?)
        WHERE member_id = ? AND changes() = 1 AND id = (
          SELECT calendar_event_id FROM focus_sessions WHERE member_id = ? AND id = ? AND updated_at = ?
        )`).bind(input.status === "completed" ? "completed" : "canceled", input.updatedAt, memberId, memberId, id, input.updatedAt),
    ]);
    return mapRow(result.results[0] ?? null);
  }
}

function mapRow(row: FocusRow | null): FocusSession | null {
  if (!row) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    taskId: row.task_id,
    calendarEventId: row.calendar_event_id,
    clientKey: row.client_key,
    startTitle: row.start_title,
    durationMinutes: row.duration_minutes,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    pausedAt: row.paused_at === null ? null : new Date(row.paused_at).toISOString(),
    endedAt: row.ended_at === null ? null : new Date(row.ended_at).toISOString(),
    elapsedMs: row.elapsed_ms,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
