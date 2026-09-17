import { encodeCitationId } from "../library/service";
import type { GraphEdgeKind, GraphNodeKind } from "./types";

export interface GraphKnowledgeRecord {
  id: string;
  title: string;
  status: string | null;
  updatedAt: string;
  citationIds: string[];
}

export interface GraphTaskRecord {
  id: string;
  title: string;
  status: string | null;
  updatedAt: string;
  priority: string | null;
  progress: number | null;
}

export interface GraphProjectRecord {
  id: string;
  title: string;
  status: string | null;
  updatedAt: string;
  progress: number | null;
}

export interface GraphGoalRecord {
  id: string;
  title: string;
  status: string | null;
  updatedAt: string;
  progress: number | null;
}

export interface GraphInboxRecord {
  id: string;
  title: string;
  status: string | null;
  updatedAt: string;
  promotedTaskId: string | null;
}

export interface GraphCalendarRecord {
  id: string;
  title: string;
  status: string | null;
  updatedAt: string;
  kind: "event" | "focus";
  taskId: string | null;
  projectId: string | null;
}

export interface GraphProjectionRelation {
  sourceKind: GraphNodeKind;
  sourceId: string;
  targetKind: GraphNodeKind;
  targetId: string;
  kind: GraphEdgeKind;
  label: string;
  weight: number;
  citationIds: string[];
}

export interface GraphProjectionRepositoryPort {
  listKnowledge(memberId: string): Promise<GraphKnowledgeRecord[]>;
  listTasks(memberId: string): Promise<GraphTaskRecord[]>;
  listProjects(memberId: string): Promise<GraphProjectRecord[]>;
  listGoals(memberId: string): Promise<GraphGoalRecord[]>;
  listInbox(memberId: string): Promise<GraphInboxRecord[]>;
  listCalendar(memberId: string): Promise<GraphCalendarRecord[]>;
  listRelations(memberId: string): Promise<GraphProjectionRelation[]>;
}

type KnowledgeRow = { id: string; title: string; status: string; updated_at: string; revision_id: string };
type CitationRow = { revision_id: string; chunk_id: string };
type TaskRow = { id: string; title: string; status: string; updated_at: number; priority: string; progress: number };
type ProjectRow = { id: string; title: string; status: string; updated_at: number; progress: number };
type GoalRow = { id: string; title: string; status: string; updated_at: number; progress: number };
type InboxRow = { id: string; content: string; status: string; updated_at: number; promoted_task_id: string | null };
type CalendarRow = { id: string; title: string; status: string; kind: "event" | "focus"; updated_at: number; task_id: string | null; project_id: string | null };
type RelationRow = {
  source_kind: GraphNodeKind;
  source_id: string;
  target_kind: GraphNodeKind;
  target_id: string;
  kind: GraphEdgeKind;
  label: string;
  citation_ids?: string | null;
};

/** Read-only projection adapter over the existing authoritative D1 tables. */
export class GraphProjectionRepository implements GraphProjectionRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async listKnowledge(memberId: string): Promise<GraphKnowledgeRecord[]> {
    const rows = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND status = 'active'
       )
       SELECT k.id, r.title, k.search_status AS status, k.updated_at, r.id AS revision_id
       FROM authorized_member am
       JOIN knowledge_items k ON k.status = 'active'
       JOIN revisions r ON r.id = k.current_revision_id
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       WHERE r.visibility = 'shared' OR am.role = 'admin'
       ORDER BY k.id ASC`,
    ).bind(memberId).all<KnowledgeRow>();
    const result = await Promise.all(rows.results.map(async (row) => {
      const chunks = await this.db.prepare(
        `WITH authorized_member AS (
           SELECT role FROM members WHERE id = ? AND status = 'active'
         )
         SELECT c.revision_id, c.id AS chunk_id
         FROM authorized_member am
         JOIN revisions r ON r.id = ?
         JOIN knowledge_items k ON k.id = r.knowledge_item_id AND k.status = 'active'
         JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
         JOIN chunks c ON c.revision_id = r.id AND c.status = 'active'
         WHERE r.visibility = 'shared' OR am.role = 'admin'
         ORDER BY c.ordinal ASC`,
      ).bind(memberId, row.revision_id).all<CitationRow>();
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        updatedAt: asIso(row.updated_at),
        citationIds: chunks.results.map((chunk) => encodeCitationId({ revisionId: chunk.revision_id, chunkId: chunk.chunk_id })),
      };
    }));
    return result;
  }

  async listTasks(memberId: string): Promise<GraphTaskRecord[]> {
    const rows = await this.db.prepare(
      `SELECT id, title, status, updated_at, priority, progress
       FROM tasks WHERE member_id = ? ORDER BY id ASC`,
    ).bind(memberId).all<TaskRow>();
    return rows.results.map((row) => ({ ...row, updatedAt: asIso(row.updated_at), priority: row.priority, progress: row.progress }));
  }

  async listProjects(memberId: string): Promise<GraphProjectRecord[]> {
    const rows = await this.db.prepare(
      `SELECT id, title, status, updated_at, progress
       FROM projects WHERE member_id = ? ORDER BY id ASC`,
    ).bind(memberId).all<ProjectRow>();
    return rows.results.map((row) => ({ ...row, updatedAt: asIso(row.updated_at), progress: row.progress }));
  }

  async listGoals(memberId: string): Promise<GraphGoalRecord[]> {
    const rows = await this.db.prepare(
      `SELECT id, title, status, updated_at, progress
       FROM goals WHERE member_id = ? ORDER BY id ASC`,
    ).bind(memberId).all<GoalRow>();
    return rows.results.map((row) => ({ ...row, updatedAt: asIso(row.updated_at), progress: row.progress }));
  }

  async listInbox(memberId: string): Promise<GraphInboxRecord[]> {
    const rows = await this.db.prepare(
      `SELECT id, content, status, updated_at, promoted_task_id
       FROM inbox_items WHERE member_id = ? ORDER BY id ASC`,
    ).bind(memberId).all<InboxRow>();
    return rows.results.map((row) => ({
      id: row.id,
      title: row.content.slice(0, 200),
      status: row.status,
      updatedAt: asIso(row.updated_at),
      promotedTaskId: row.promoted_task_id,
    }));
  }

  async listCalendar(memberId: string): Promise<GraphCalendarRecord[]> {
    const rows = await this.db.prepare(
      `SELECT id, title, status, kind, updated_at, task_id, project_id
       FROM calendar_events WHERE member_id = ? ORDER BY id ASC`,
    ).bind(memberId).all<CalendarRow>();
    return rows.results.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      kind: row.kind,
      updatedAt: asIso(row.updated_at),
      taskId: row.task_id,
      projectId: row.project_id,
    }));
  }

  async listRelations(memberId: string): Promise<GraphProjectionRelation[]> {
    const [taskLinks, dependencies, projectGoals, projectTasks, calendar, inbox] = await Promise.all([
      this.db.prepare(
        `SELECT 'task' AS source_kind, tl.task_id AS source_id, 'knowledge' AS target_kind,
                tl.knowledge_item_id AS target_id, 'references' AS kind, 'References' AS label
         FROM task_links tl JOIN tasks t ON t.id = tl.task_id AND t.member_id = tl.member_id
         WHERE tl.member_id = ? ORDER BY tl.task_id ASC, tl.knowledge_item_id ASC`,
      ).bind(memberId).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'task' AS source_kind, td.task_id AS source_id, 'task' AS target_kind,
                td.depends_on_task_id AS target_id, 'depends_on' AS kind, 'Depends on' AS label
         FROM task_dependencies td
         JOIN tasks source ON source.id = td.task_id AND source.member_id = td.member_id
         JOIN tasks target ON target.id = td.depends_on_task_id AND target.member_id = td.member_id
         WHERE td.member_id = ? ORDER BY td.task_id ASC, td.depends_on_task_id ASC`,
      ).bind(memberId).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'project' AS source_kind, pg.project_id AS source_id, 'goal' AS target_kind,
                pg.goal_id AS target_id, 'belongs_to' AS kind, 'Contains goal' AS label
         FROM project_goals pg
         JOIN projects p ON p.id = pg.project_id AND p.member_id = pg.member_id
         JOIN goals g ON g.id = pg.goal_id AND g.member_id = pg.member_id
         WHERE pg.member_id = ? ORDER BY pg.project_id ASC, pg.goal_id ASC`,
      ).bind(memberId).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'project' AS source_kind, pt.project_id AS source_id, 'task' AS target_kind,
                pt.task_id AS target_id, 'belongs_to' AS kind, 'Contains task' AS label
         FROM project_tasks pt
         JOIN projects p ON p.id = pt.project_id AND p.member_id = pt.member_id
         JOIN tasks t ON t.id = pt.task_id AND t.member_id = pt.member_id
         WHERE pt.member_id = ? ORDER BY pt.project_id ASC, pt.task_id ASC`,
      ).bind(memberId).all<RelationRow>(),
      this.db.prepare(
        `SELECT CASE WHEN kind = 'focus' THEN 'focus' ELSE 'calendar' END AS source_kind,
                id AS source_id,
                CASE WHEN task_id IS NOT NULL THEN 'task' WHEN project_id IS NOT NULL THEN 'project' ELSE NULL END AS target_kind,
                COALESCE(task_id, project_id) AS target_id,
                CASE WHEN task_id IS NOT NULL THEN 'scheduled_for' WHEN project_id IS NOT NULL THEN 'scheduled_for' ELSE NULL END AS kind,
                'Scheduled for' AS label
         FROM calendar_events WHERE member_id = ? AND (task_id IS NOT NULL OR project_id IS NOT NULL)
         ORDER BY id ASC`,
      ).bind(memberId).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'inbox' AS source_kind, id AS source_id, 'task' AS target_kind,
                promoted_task_id AS target_id, 'creates' AS kind, 'Promoted to task' AS label
         FROM inbox_items WHERE member_id = ? AND promoted_task_id IS NOT NULL ORDER BY id ASC`,
      ).bind(memberId).all<RelationRow>(),
    ]);
    return [...taskLinks.results, ...dependencies.results, ...projectGoals.results, ...projectTasks.results, ...calendar.results, ...inbox.results]
      .filter((row) => row.target_kind !== null && row.target_id !== null)
      .map((row) => ({
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        targetKind: row.target_kind!,
        targetId: row.target_id!,
        kind: row.kind,
        label: row.label,
        weight: 1,
        citationIds: parseCitationIds(row.citation_ids),
      }));
  }
}

function asIso(value: string | number): string {
  return typeof value === "number" ? new Date(value).toISOString() : new Date(value).toISOString();
}

function parseCitationIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}
