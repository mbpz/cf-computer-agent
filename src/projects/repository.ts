import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest, type PageRequest } from "../pagination";
import type { Project, ProjectCreate, ProjectGoalSummary, ProjectPage, ProjectStatus, ProjectSummary, ProjectUpdate } from "./types";

export interface ProjectsPageRepositoryRequest extends PageRequest { status?: ProjectStatus; }

export interface ProjectsRepositoryPort {
  insert(input: ProjectCreate): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<Project | null>;
  findByClientKey(memberId: string, clientKey: string): Promise<Project | null>;
  listOwned(memberId: string, request: ProjectsPageRepositoryRequest): Promise<ProjectPage>;
  update(memberId: string, id: string, input: ProjectUpdate): Promise<Project | null>;
  updateStatus(memberId: string, id: string, status: ProjectStatus, updatedAt: number): Promise<Project | null>;
  linkGoal(memberId: string, projectId: string, goalId: string, createdAt: number): Promise<boolean>;
  unlinkGoal(memberId: string, projectId: string, goalId: string): Promise<boolean>;
  linkTask(memberId: string, projectId: string, taskId: string, createdAt: number): Promise<boolean>;
  unlinkTask(memberId: string, projectId: string, taskId: string): Promise<boolean>;
  summary(memberId: string, projectId: string): Promise<ProjectSummary>;
}

type ProjectRow = {
  id: string; member_id: string; client_key: string; title: string; description: string | null;
  status: ProjectStatus; progress: number; target_at: number | null; created_at: number; updated_at: number;
};
type GoalSummaryRow = { id: string; title: string };
type CountRow = { total: number };

const columns = "id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at";

export class ProjectsRepository implements ProjectsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: ProjectCreate): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO projects
       (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)`,
    ).bind(input.id, input.memberId, input.clientKey, input.title, input.description, input.progress, input.targetAt, input.createdAt, input.updatedAt).run();
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, id: string): Promise<Project | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM projects WHERE member_id = ? AND id = ? LIMIT 1`).bind(memberId, id).first<ProjectRow>());
  }

  async findByClientKey(memberId: string, clientKey: string): Promise<Project | null> {
    return mapRow(await this.db.prepare(`SELECT ${columns} FROM projects WHERE member_id = ? AND client_key = ? LIMIT 1`).bind(memberId, clientKey).first<ProjectRow>());
  }

  async listOwned(memberId: string, request: ProjectsPageRepositoryRequest): Promise<ProjectPage> {
    const parsed = parsePageRequest(request.limit, request.cursor);
    const cursor = parsed.cursor ? decodeCursor(parsed.cursor, memberId, request.status) : undefined;
    const filters = ["member_id = ?"];
    const values: unknown[] = [memberId];
    if (request.status) { filters.push("status = ?"); values.push(request.status); }
    if (cursor) { filters.push("(updated_at < ? OR (updated_at = ? AND id < ?))"); values.push(cursor.sort, cursor.sort, cursor.id); }
    const rows = await this.db.prepare(
      `SELECT ${columns} FROM projects WHERE ${filters.join(" AND ")}
       ORDER BY updated_at DESC, id DESC LIMIT ?`,
    ).bind(...values, parsed.limit + 1).all<ProjectRow>();
    const items = rows.results.slice(0, parsed.limit).map(mapRow).filter((item): item is Project => item !== null);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > parsed.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, memberId, status: request.status ?? null, sort: Date.parse(last.updatedAt), id: last.id }),
      } : {}),
    };
  }

  async update(memberId: string, id: string, input: ProjectUpdate): Promise<Project | null> {
    await this.db.prepare(
      "UPDATE projects SET title = ?, description = ?, progress = ?, target_at = ?, updated_at = ? WHERE member_id = ? AND id = ?",
    ).bind(input.title, input.description, input.progress, input.targetAt, input.updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }

  async updateStatus(memberId: string, id: string, status: ProjectStatus, updatedAt: number): Promise<Project | null> {
    await this.db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE member_id = ? AND id = ?")
      .bind(status, updatedAt, memberId, id).run();
    return this.findOwned(memberId, id);
  }

  async linkGoal(memberId: string, projectId: string, goalId: string, createdAt: number): Promise<boolean> {
    const result = await this.db.prepare("INSERT OR IGNORE INTO project_goals (project_id, member_id, goal_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(projectId, memberId, goalId, createdAt).run();
    return result.meta.changes === 1;
  }

  async unlinkGoal(memberId: string, projectId: string, goalId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM project_goals WHERE project_id = ? AND member_id = ? AND goal_id = ?")
      .bind(projectId, memberId, goalId).run();
    return result.meta.changes === 1;
  }

  async linkTask(memberId: string, projectId: string, taskId: string, createdAt: number): Promise<boolean> {
    const result = await this.db.prepare("INSERT OR IGNORE INTO project_tasks (project_id, member_id, task_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(projectId, memberId, taskId, createdAt).run();
    return result.meta.changes === 1;
  }

  async unlinkTask(memberId: string, projectId: string, taskId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM project_tasks WHERE project_id = ? AND member_id = ? AND task_id = ?")
      .bind(projectId, memberId, taskId).run();
    return result.meta.changes === 1;
  }

  async summary(memberId: string, projectId: string): Promise<ProjectSummary> {
    const [goalCount, taskCount, completedTaskCount, goals] = await this.db.batch<CountRow | GoalSummaryRow>([
      this.db.prepare("SELECT count(*) AS total FROM project_goals WHERE member_id = ? AND project_id = ?").bind(memberId, projectId),
      this.db.prepare("SELECT count(*) AS total FROM project_tasks WHERE member_id = ? AND project_id = ?").bind(memberId, projectId),
      this.db.prepare("SELECT count(*) AS total FROM project_tasks pt JOIN tasks t ON t.id = pt.task_id AND t.member_id = pt.member_id WHERE pt.member_id = ? AND pt.project_id = ? AND t.status = 'done'").bind(memberId, projectId),
      this.db.prepare("SELECT g.id, g.title FROM project_goals pg JOIN goals g ON g.id = pg.goal_id AND g.member_id = pg.member_id WHERE pg.member_id = ? AND pg.project_id = ? ORDER BY pg.created_at ASC, pg.goal_id ASC LIMIT 10").bind(memberId, projectId),
    ]);
    const count = (result: D1Result<CountRow | GoalSummaryRow>): number => {
      const row = result.results[0] as CountRow | undefined;
      return row && typeof row.total === "number" ? row.total : 0;
    };
    const goalRows = (goals.results || []).filter((row): row is GoalSummaryRow => typeof (row as GoalSummaryRow).id === "string" && typeof (row as GoalSummaryRow).title === "string");
    return { goalCount: count(goalCount), taskCount: count(taskCount), completedTaskCount: count(completedTaskCount), goals: goalRows.map((row) => ({ id: row.id, title: row.title })) };
  }
}

function decodeCursor(cursor: string, memberId: string, status?: ProjectStatus): { sort: number; id: string } {
  const value = decodeOpaqueCursor(cursor);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidCursor();
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || record.memberId !== memberId || (record.status ?? null) !== (status ?? null)
    || typeof record.sort !== "number" || !Number.isSafeInteger(record.sort) || record.sort < 0
    || typeof record.id !== "string" || !record.id) throw invalidCursor();
  return { sort: record.sort, id: record.id };
}

function invalidCursor(): AppError { return new AppError("PROJECT_PAGE_INVALID", "Project page cursor is invalid", 400); }

function mapRow(row: ProjectRow | null): Project | null {
  if (!row) return null;
  return {
    id: row.id, memberId: row.member_id, clientKey: row.client_key, title: row.title,
    description: row.description, status: row.status, progress: row.progress,
    targetAt: row.target_at === null ? null : new Date(row.target_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
