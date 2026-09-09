import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest, type PageRequest } from "../pagination";
import type { CalendarEvent, CalendarEventListRequest, CalendarEventPage, CalendarEventStatus } from "./types";

export interface CalendarRepositoryPort {
  insert(input: { id: string; memberId: string; clientKey: string; kind: CalendarEvent["kind"]; title: string; description: string; startsAt: number; endsAt: number; timezone: string; allDay: boolean; taskId: string | null; projectId: string | null; createdAt: number; updatedAt: number }): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<CalendarEvent | null>;
  findByClientKey(memberId: string, clientKey: string): Promise<CalendarEvent | null>;
  listOwned(memberId: string, request: CalendarEventListRequest): Promise<CalendarEventPage>;
  update(memberId: string, id: string, input: { title: string; description: string; startsAt: number; endsAt: number; timezone: string; allDay: boolean; taskId: string | null; projectId: string | null; updatedAt: number }): Promise<CalendarEvent | null>;
  updateStatus(memberId: string, id: string, status: CalendarEventStatus, updatedAt: number): Promise<CalendarEvent | null>;
}

type CalendarRow = {
  id: string; member_id: string; client_key: string; kind: CalendarEvent["kind"]; title: string; description: string;
  starts_at: number; ends_at: number; timezone: string; all_day: number; status: CalendarEventStatus;
  task_id: string | null; project_id: string | null; created_at: number; updated_at: number;
};
const columns = "id, member_id, client_key, kind, title, description, starts_at, ends_at, timezone, all_day, status, task_id, project_id, created_at, updated_at";

export class CalendarRepository implements CalendarRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: { id: string; memberId: string; clientKey: string; kind: CalendarEvent["kind"]; title: string; description: string; startsAt: number; endsAt: number; timezone: string; allDay: boolean; taskId: string | null; projectId: string | null; createdAt: number; updatedAt: number }): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO calendar_events
       (id, member_id, client_key, kind, title, description, starts_at, ends_at, timezone, all_day, status, task_id, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`,
    ).bind(input.id, input.memberId, input.clientKey, input.kind, input.title, input.description, input.startsAt, input.endsAt, input.timezone, input.allDay ? 1 : 0, input.taskId, input.projectId, input.createdAt, input.updatedAt).run();
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, id: string): Promise<CalendarEvent | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM calendar_events WHERE member_id = ? AND id = ? LIMIT 1`).bind(memberId, id).first<CalendarRow>());
  }

  async findByClientKey(memberId: string, clientKey: string): Promise<CalendarEvent | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM calendar_events WHERE member_id = ? AND client_key = ? LIMIT 1`).bind(memberId, clientKey).first<CalendarRow>());
  }

  async listOwned(memberId: string, request: CalendarEventListRequest): Promise<CalendarEventPage> {
    const parsed = parsePageRequest(request.limit, request.cursor);
    const cursor = parsed.cursor ? decodeCursor(parsed.cursor, memberId, request.from, request.to, request.status) : undefined;
    const filters = ["member_id = ?", "starts_at < ?", "ends_at > ?"];
    const values: unknown[] = [memberId, request.to, request.from];
    if (request.status) { filters.push("status = ?"); values.push(request.status); }
    if (cursor) { filters.push("(starts_at > ? OR (starts_at = ? AND id > ?))"); values.push(cursor.startsAt, cursor.startsAt, cursor.id); }
    const rows = await this.db.prepare(`SELECT ${columns} FROM calendar_events WHERE ${filters.join(" AND ")} ORDER BY starts_at ASC, id ASC LIMIT ?`).bind(...values, parsed.limit + 1).all<CalendarRow>();
    const items = rows.results.slice(0, parsed.limit).map(mapRow).filter((item): item is CalendarEvent => item !== null);
    const last = items.at(-1);
    return { items, ...(rows.results.length > parsed.limit && last ? { nextCursor: encodeOpaqueCursor({ v: 1, memberId, from: request.from, to: request.to, status: request.status ?? null, startsAt: Date.parse(last.startsAt), id: last.id }) } : {}) };
  }

  async update(memberId: string, id: string, input: { title: string; description: string; startsAt: number; endsAt: number; timezone: string; allDay: boolean; taskId: string | null; projectId: string | null; updatedAt: number }): Promise<CalendarEvent | null> {
    await this.db.prepare("UPDATE calendar_events SET title = ?, description = ?, starts_at = ?, ends_at = ?, timezone = ?, all_day = ?, task_id = ?, project_id = ?, updated_at = ? WHERE member_id = ? AND id = ?")
      .bind(input.title, input.description, input.startsAt, input.endsAt, input.timezone, input.allDay ? 1 : 0, input.taskId, input.projectId, input.updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }

  async updateStatus(memberId: string, id: string, status: CalendarEventStatus, updatedAt: number): Promise<CalendarEvent | null> {
    await this.db.prepare("UPDATE calendar_events SET status = ?, updated_at = ? WHERE member_id = ? AND id = ?").bind(status, updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }
}

function mapRow(row: CalendarRow | null): CalendarEvent | null {
  if (!row) return null;
  return {
    id: row.id, memberId: row.member_id, clientKey: row.client_key, kind: row.kind, title: row.title, description: row.description,
    startsAt: new Date(row.starts_at).toISOString(), endsAt: new Date(row.ends_at).toISOString(), timezone: row.timezone,
    allDay: row.all_day === 1, status: row.status, taskId: row.task_id, projectId: row.project_id,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function decodeCursor(cursor: string, memberId: string, from: number, to: number, status?: CalendarEventStatus): { startsAt: number; id: string } {
  const decoded = decodeOpaqueCursor(cursor) as Record<string, unknown>;
  if (!decoded || decoded.memberId !== memberId || decoded.from !== from || decoded.to !== to || (decoded.status ?? null) !== (status ?? null) || typeof decoded.startsAt !== "number" || typeof decoded.id !== "string") {
    throw new AppError("CALENDAR_PAGE_INVALID", "Calendar cursor is invalid", 400);
  }
  return { startsAt: decoded.startsAt, id: decoded.id };
}
