import type { FocusSession, FocusStatus } from "./types";

export interface FocusRepositoryPort {
  insert(input: { id: string; memberId: string; taskId: string; calendarEventId: string | null; clientKey: string; status: FocusStatus; startedAt: number; elapsedMs: number; createdAt: number; updatedAt: number }): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<FocusSession | null>;
  findByClientKey(memberId: string, clientKey: string): Promise<FocusSession | null>;
  findOpen(memberId: string): Promise<FocusSession | null>;
  update(memberId: string, id: string, input: { status: FocusStatus; startedAt: number; pausedAt: number | null; endedAt: number | null; elapsedMs: number; updatedAt: number }): Promise<FocusSession | null>;
}

type FocusRow = { id: string; member_id: string; task_id: string; calendar_event_id: string | null; client_key: string; status: FocusStatus; started_at: number; paused_at: number | null; ended_at: number | null; elapsed_ms: number; created_at: number; updated_at: number };
const columns = "id, member_id, task_id, calendar_event_id, client_key, status, started_at, paused_at, ended_at, elapsed_ms, created_at, updated_at";

export class FocusRepository implements FocusRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: { id: string; memberId: string; taskId: string; calendarEventId: string | null; clientKey: string; status: FocusStatus; startedAt: number; elapsedMs: number; createdAt: number; updatedAt: number }): Promise<boolean> {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO focus_sessions (id, member_id, task_id, calendar_event_id, client_key, status, started_at, elapsed_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.id, input.memberId, input.taskId, input.calendarEventId, input.clientKey, input.status, input.startedAt, input.elapsedMs, input.createdAt, input.updatedAt).run();
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

  async update(memberId: string, id: string, input: { status: FocusStatus; startedAt: number; pausedAt: number | null; endedAt: number | null; elapsedMs: number; updatedAt: number }): Promise<FocusSession | null> {
    await this.db.prepare("UPDATE focus_sessions SET status = ?, started_at = ?, paused_at = ?, ended_at = ?, elapsed_ms = ?, updated_at = ? WHERE member_id = ? AND id = ?")
      .bind(input.status, input.startedAt, input.pausedAt, input.endedAt, input.elapsedMs, input.updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
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
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    pausedAt: row.paused_at === null ? null : new Date(row.paused_at).toISOString(),
    endedAt: row.ended_at === null ? null : new Date(row.ended_at).toISOString(),
    elapsedMs: row.elapsed_ms,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
