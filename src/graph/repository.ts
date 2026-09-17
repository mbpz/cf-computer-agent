import { encodeCitationId } from "../library/service";
import type { ProjectsRepositoryPort } from "../projects/repository";
import type { ProjectTimelineRepositoryPort } from "../project-timeline/repository";
import type { ProjectTimelineItem } from "../project-timeline/types";
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

export interface GraphTimelineRecord {
  id: string;
  projectId: string;
  kind: "meeting" | "decision" | "action_item";
  title: string;
  status: string | null;
  updatedAt: string;
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
  listKnowledge(memberId: string, limit?: number): Promise<GraphKnowledgeRecord[]>;
  listTasks(memberId: string, limit?: number): Promise<GraphTaskRecord[]>;
  listProjects(memberId: string, limit?: number): Promise<GraphProjectRecord[]>;
  listGoals(memberId: string, limit?: number): Promise<GraphGoalRecord[]>;
  listInbox(memberId: string, limit?: number): Promise<GraphInboxRecord[]>;
  listCalendar(memberId: string, limit?: number): Promise<GraphCalendarRecord[]>;
  listTimeline(memberId: string, limit?: number): Promise<GraphTimelineRecord[]>;
  listRelations(memberId: string, limit?: number): Promise<GraphProjectionRelation[]>;
}

type KnowledgeRow = { id: string; title: string; status: string; updated_at: string; revision_id: string };
type CitationRow = { revision_id: string; chunk_id: string };
type TaskRow = { id: string; title: string; status: string; updated_at: number; priority: string; progress: number };
type ProjectRow = { id: string; title: string; status: string; updated_at: number; progress: number };
type GoalRow = { id: string; title: string; status: string; updated_at: number; progress: number };
type InboxRow = { id: string; content: string; status: string; updated_at: number; promoted_task_id: string | null };
type CalendarRow = { id: string; title: string; status: string; kind: "event" | "focus"; updated_at: number; task_id: string | null; project_id: string | null };
type TimelineRow = { id: string; project_id: string; kind: "meeting" | "decision" | "action_item" | "milestone"; title: string; status: string; updated_at: number };
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
  constructor(private readonly db: D1Database, private readonly adapters: { projects?: Pick<ProjectsRepositoryPort, "listOwned">; timeline?: Pick<ProjectTimelineRepositoryPort, "listOwned"> } = {}) {}

  async listKnowledge(memberId: string, limit = 100): Promise<GraphKnowledgeRecord[]> {
    const rows = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND status = 'active'
       )
       SELECT k.id, r.title, k.search_status AS status, k.updated_at, r.id AS revision_id
       FROM authorized_member am
       JOIN knowledge_items k ON k.status = 'active'
       JOIN revisions r ON r.id = k.current_revision_id AND r.knowledge_item_id = k.id
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       WHERE r.visibility = 'shared' OR am.role = 'admin'
       ORDER BY k.id ASC LIMIT ?`,
    ).bind(memberId, limitValue(limit)).all<KnowledgeRow>();
    const revisionIds = rows.results.map((row) => row.revision_id);
    const chunks = revisionIds.length === 0 ? { results: [] as CitationRow[] } : await this.db.prepare(
      `WITH authorized_member AS (SELECT role FROM members WHERE id = ? AND status = 'active')
       SELECT c.revision_id, c.id AS chunk_id
       FROM authorized_member am
       JOIN chunks c ON c.status = 'active' AND c.revision_id IN (${revisionIds.map(() => "?").join(",")})
       JOIN revisions r ON r.id = c.revision_id AND r.knowledge_item_id = (
         SELECT k.id FROM knowledge_items k WHERE k.current_revision_id = r.id AND k.status = 'active'
       )
       JOIN knowledge_items k ON k.id = r.knowledge_item_id
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       WHERE r.visibility = 'shared' OR am.role = 'admin'
       ORDER BY c.revision_id ASC, c.ordinal ASC LIMIT ?`,
    ).bind(memberId, ...revisionIds, 200).all<CitationRow>();
    const citations = new Map<string, string[]>();
    for (const chunk of chunks.results) (citations.get(chunk.revision_id) ?? (citations.set(chunk.revision_id, []), citations.get(chunk.revision_id)!)).push(encodeCitationId({ revisionId: chunk.revision_id, chunkId: chunk.chunk_id }));
    return rows.results.map((row) => ({ id: row.id, title: row.title, status: row.status, updatedAt: asIso(row.updated_at), citationIds: citations.get(row.revision_id) ?? [] }));
  }

  async listTasks(memberId: string, limit = 100): Promise<GraphTaskRecord[]> {
    const rows = await this.db.prepare(
      `SELECT t.id, t.title, t.status, t.updated_at, t.priority, t.progress
       FROM tasks t JOIN members m ON m.id = t.member_id AND m.status = 'active'
       WHERE t.member_id = ? ORDER BY t.id ASC LIMIT ?`,
    ).bind(memberId, limitValue(limit)).all<TaskRow>();
    return rows.results.map((row) => ({ ...row, updatedAt: asIso(row.updated_at), priority: row.priority, progress: row.progress }));
  }

  async listProjects(memberId: string, limit = 100): Promise<GraphProjectRecord[]> {
    if (this.adapters.projects) {
      const page = await this.adapters.projects.listOwned(memberId, { limit: limitValue(limit), cursor: undefined });
      return page.items.map((row) => ({ id: row.id, title: row.title, status: row.status, updatedAt: row.updatedAt, progress: row.progress }));
    }
    const rows = await this.db.prepare(
      `SELECT p.id, p.title, p.status, p.updated_at, p.progress
       FROM projects p JOIN members m ON m.id = p.member_id AND m.status = 'active'
       WHERE p.member_id = ? ORDER BY p.id ASC LIMIT ?`,
    ).bind(memberId, limitValue(limit)).all<ProjectRow>();
    return rows.results.map((row) => ({ ...row, updatedAt: asIso(row.updated_at), progress: row.progress }));
  }

  async listGoals(memberId: string, limit = 100): Promise<GraphGoalRecord[]> {
    const rows = await this.db.prepare(
      `SELECT g.id, g.title, g.status, g.updated_at, g.progress
       FROM goals g JOIN members m ON m.id = g.member_id AND m.status = 'active'
       WHERE g.member_id = ? ORDER BY g.id ASC LIMIT ?`,
    ).bind(memberId, limitValue(limit)).all<GoalRow>();
    return rows.results.map((row) => ({ ...row, updatedAt: asIso(row.updated_at), progress: row.progress }));
  }

  async listInbox(memberId: string, limit = 100): Promise<GraphInboxRecord[]> {
    const rows = await this.db.prepare(
      `SELECT i.id, i.content, i.status, i.updated_at, i.promoted_task_id
       FROM inbox_items i JOIN members m ON m.id = i.member_id AND m.status = 'active'
       WHERE i.member_id = ? ORDER BY i.id ASC LIMIT ?`,
    ).bind(memberId, limitValue(limit)).all<InboxRow>();
    return rows.results.map((row) => ({
      id: row.id,
      title: row.content.slice(0, 200),
      status: row.status,
      updatedAt: asIso(row.updated_at),
      promotedTaskId: row.promoted_task_id,
    }));
  }

  async listCalendar(memberId: string, limit = 100): Promise<GraphCalendarRecord[]> {
    const rows = await this.db.prepare(
      `SELECT c.id, c.title, c.status, c.kind, c.updated_at, c.task_id, c.project_id
       FROM calendar_events c JOIN members m ON m.id = c.member_id AND m.status = 'active'
       WHERE c.member_id = ? ORDER BY c.id ASC LIMIT ?`,
    ).bind(memberId, limitValue(limit)).all<CalendarRow>();
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

  async listTimeline(memberId: string, limit = 100): Promise<GraphTimelineRecord[]> {
    if (this.adapters.timeline && this.adapters.projects) {
      const projects = await this.adapters.projects.listOwned(memberId, { limit: limitValue(limit), cursor: undefined });
      const pages = await Promise.all(projects.items.map((project) => this.adapters.timeline!.listOwned(memberId, { projectId: project.id, limit: limitValue(limit), cursor: undefined })));
      return pages.flatMap((page) => page.items).filter((item): item is ProjectTimelineItem & { kind: "meeting" | "decision" | "action_item" } => item.kind !== "milestone").slice(0, limitValue(limit)).map((item) => ({ id: item.id, projectId: item.projectId, kind: item.kind, title: item.title, status: item.status, updatedAt: item.updatedAt }));
    }
    const rows = await this.db.prepare(`SELECT pti.id, pti.project_id, pti.kind, pti.title, pti.status, pti.updated_at
      FROM project_timeline_items pti
      JOIN projects p ON p.id = pti.project_id AND p.member_id = pti.member_id
      JOIN members m ON m.id = pti.member_id AND m.status = 'active'
      WHERE pti.member_id = ? AND pti.kind IN ('meeting', 'decision', 'action_item')
      ORDER BY pti.id ASC LIMIT ?`).bind(memberId, limitValue(limit)).all<TimelineRow>();
    return rows.results.filter((row): row is TimelineRow & { kind: "meeting" | "decision" | "action_item" } => row.kind !== "milestone").map((row) => ({ id: row.id, projectId: row.project_id, kind: row.kind, title: row.title, status: row.status, updatedAt: asIso(row.updated_at) }));
  }

  async listRelations(memberId: string, limit = 100): Promise<GraphProjectionRelation[]> {
    const [taskLinks, dependencies, projectGoals, projectTasks, calendar, inbox, timeline] = await Promise.all([
      this.db.prepare(
        `SELECT 'task' AS source_kind, tl.task_id AS source_id, 'knowledge' AS target_kind,
                tl.knowledge_item_id AS target_id, 'references' AS kind, 'References' AS label
         FROM task_links tl JOIN tasks t ON t.id = tl.task_id AND t.member_id = tl.member_id
         JOIN members m ON m.id = tl.member_id AND m.status = 'active'
         WHERE tl.member_id = ? ORDER BY tl.task_id ASC, tl.knowledge_item_id ASC LIMIT ?`,
      ).bind(memberId, limitValue(limit)).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'task' AS source_kind, td.task_id AS source_id, 'task' AS target_kind,
                td.depends_on_task_id AS target_id, 'depends_on' AS kind, 'Depends on' AS label
         FROM task_dependencies td
         JOIN tasks source ON source.id = td.task_id AND source.member_id = td.member_id
         JOIN tasks target ON target.id = td.depends_on_task_id AND target.member_id = td.member_id
         JOIN members m ON m.id = td.member_id AND m.status = 'active'
         WHERE td.member_id = ? ORDER BY td.task_id ASC, td.depends_on_task_id ASC LIMIT ?`,
      ).bind(memberId, limitValue(limit)).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'project' AS source_kind, pg.project_id AS source_id, 'goal' AS target_kind,
                pg.goal_id AS target_id, 'belongs_to' AS kind, 'Contains goal' AS label
         FROM project_goals pg
         JOIN projects p ON p.id = pg.project_id AND p.member_id = pg.member_id
         JOIN goals g ON g.id = pg.goal_id AND g.member_id = pg.member_id
         JOIN members m ON m.id = pg.member_id AND m.status = 'active'
         WHERE pg.member_id = ? ORDER BY pg.project_id ASC, pg.goal_id ASC LIMIT ?`,
      ).bind(memberId, limitValue(limit)).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'project' AS source_kind, pt.project_id AS source_id, 'task' AS target_kind,
                pt.task_id AS target_id, 'belongs_to' AS kind, 'Contains task' AS label
         FROM project_tasks pt
         JOIN projects p ON p.id = pt.project_id AND p.member_id = pt.member_id
         JOIN tasks t ON t.id = pt.task_id AND t.member_id = pt.member_id
         JOIN members m ON m.id = pt.member_id AND m.status = 'active'
         WHERE pt.member_id = ? ORDER BY pt.project_id ASC, pt.task_id ASC LIMIT ?`,
      ).bind(memberId, limitValue(limit)).all<RelationRow>(),
      this.db.prepare(
        `SELECT CASE WHEN c.kind = 'focus' THEN 'focus' ELSE 'calendar' END AS source_kind,
                c.id AS source_id,
                CASE WHEN c.task_id IS NOT NULL THEN 'task' WHEN c.project_id IS NOT NULL THEN 'project' ELSE NULL END AS target_kind,
                COALESCE(c.task_id, c.project_id) AS target_id,
                CASE WHEN c.task_id IS NOT NULL THEN 'scheduled_for' WHEN c.project_id IS NOT NULL THEN 'scheduled_for' ELSE NULL END AS kind,
                'Scheduled for' AS label
         FROM calendar_events c JOIN members m ON m.id = c.member_id AND m.status = 'active'
         WHERE c.member_id = ? AND (c.task_id IS NOT NULL OR c.project_id IS NOT NULL)
         ORDER BY c.id ASC LIMIT ?`,
      ).bind(memberId, limitValue(limit)).all<RelationRow>(),
      this.db.prepare(
        `SELECT 'inbox' AS source_kind, i.id AS source_id, 'task' AS target_kind,
                i.promoted_task_id AS target_id, 'creates' AS kind, 'Promoted to task' AS label
         FROM inbox_items i JOIN members m ON m.id = i.member_id AND m.status = 'active'
         WHERE i.member_id = ? AND i.promoted_task_id IS NOT NULL ORDER BY i.id ASC LIMIT ?`,
      ).bind(memberId, limitValue(limit)).all<RelationRow>(),
      this.db.prepare(
        `SELECT pti.kind AS source_kind, pti.id AS source_id, 'project' AS target_kind,
                pti.project_id AS target_id, 'belongs_to' AS kind, 'Belongs to project' AS label
         FROM project_timeline_items pti
         JOIN projects p ON p.id = pti.project_id AND p.member_id = pti.member_id
         JOIN members m ON m.id = pti.member_id AND m.status = 'active'
         WHERE pti.member_id = ? AND pti.kind IN ('meeting', 'decision', 'action_item')
         ORDER BY pti.id ASC LIMIT ?`,
      ).bind(memberId, limitValue(limit)).all<RelationRow>(),
    ]);
    return [...taskLinks.results, ...dependencies.results, ...projectGoals.results, ...projectTasks.results, ...calendar.results, ...inbox.results, ...timeline.results]
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

function limitValue(value: number): number {
  return Math.min(101, Math.max(1, Math.floor(value) + 1));
}
