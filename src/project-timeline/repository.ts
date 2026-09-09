import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest } from "../pagination";
import type { ProjectTimelineCreate, ProjectTimelineItem, ProjectTimelineListRequest, ProjectTimelinePage, ProjectTimelineStatus } from "./types";

export interface ProjectTimelineRepositoryPort {
  insert(input: ProjectTimelineCreate): Promise<boolean>;
  findOwned(memberId: string, projectId: string, id: string): Promise<ProjectTimelineItem | null>;
  findByClientKey(memberId: string, clientKey: string): Promise<ProjectTimelineItem | null>;
  listOwned(memberId: string, request: ProjectTimelineListRequest): Promise<ProjectTimelinePage>;
  updateStatus(memberId: string, projectId: string, id: string, status: ProjectTimelineStatus, updatedAt: number): Promise<ProjectTimelineItem | null>;
}

type TimelineRow = {
  id: string; member_id: string; project_id: string; client_key: string;
  kind: ProjectTimelineItem["kind"]; title: string; body: string;
  status: ProjectTimelineStatus; starts_at: number | null; due_at: number | null;
  created_at: number; updated_at: number;
};

const columns = "id, member_id, project_id, client_key, kind, title, body, status, starts_at, due_at, created_at, updated_at";

export class ProjectTimelineRepository implements ProjectTimelineRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: ProjectTimelineCreate): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO project_timeline_items
       (id, member_id, project_id, client_key, kind, title, body, status, starts_at, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
    ).bind(input.id, input.memberId, input.projectId, input.clientKey, input.kind, input.title, input.body, input.startsAt, input.dueAt, input.createdAt, input.updatedAt).run();
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, projectId: string, id: string): Promise<ProjectTimelineItem | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM project_timeline_items WHERE member_id = ? AND project_id = ? AND id = ? LIMIT 1`).bind(memberId, projectId, id).first<TimelineRow>());
  }

  async findByClientKey(memberId: string, clientKey: string): Promise<ProjectTimelineItem | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM project_timeline_items WHERE member_id = ? AND client_key = ? LIMIT 1`).bind(memberId, clientKey).first<TimelineRow>());
  }

  async listOwned(memberId: string, request: ProjectTimelineListRequest): Promise<ProjectTimelinePage> {
    const parsed = parsePageRequest(request.limit, request.cursor);
    const cursor = parsed.cursor ? decodeCursor(parsed.cursor, memberId, request.projectId) : undefined;
    const filters = ["member_id = ?", "project_id = ?"];
    const values: unknown[] = [memberId, request.projectId];
    if (cursor) {
      filters.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
      values.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
    }
    const rows = await this.db.prepare(
      `SELECT ${columns} FROM project_timeline_items WHERE ${filters.join(" AND ")}
       ORDER BY updated_at DESC, id DESC LIMIT ?`,
    ).bind(...values, parsed.limit + 1).all<TimelineRow>();
    const items = rows.results.slice(0, parsed.limit).map(mapRow).filter((item): item is ProjectTimelineItem => item !== null);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > parsed.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, memberId, projectId: request.projectId, updatedAt: Date.parse(last.updatedAt), id: last.id }),
      } : {}),
    };
  }

  async updateStatus(memberId: string, projectId: string, id: string, status: ProjectTimelineStatus, updatedAt: number): Promise<ProjectTimelineItem | null> {
    await this.db.prepare("UPDATE project_timeline_items SET status = ?, updated_at = ? WHERE member_id = ? AND project_id = ? AND id = ?").bind(status, updatedAt, memberId, projectId, id).run();
    return this.findOwned(memberId, projectId, id);
  }
}

function mapRow(row: TimelineRow | null): ProjectTimelineItem | null {
  if (!row) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    projectId: row.project_id,
    clientKey: row.client_key,
    kind: row.kind,
    title: row.title,
    body: row.body,
    status: row.status,
    startsAt: row.starts_at === null ? null : new Date(row.starts_at).toISOString(),
    dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function decodeCursor(cursor: string, memberId: string, projectId: string): { updatedAt: number; id: string } {
  const value = decodeOpaqueCursor(cursor) as Record<string, unknown>;
  if (value.v !== 1 || value.memberId !== memberId || value.projectId !== projectId || typeof value.updatedAt !== "number" || !Number.isSafeInteger(value.updatedAt) || typeof value.id !== "string") throw new Error("INVALID_CURSOR");
  return { updatedAt: value.updatedAt, id: value.id };
}
