import { AppError } from "../http";
import type { LibraryScope } from "../library/types";
import { decodeOpaqueCursor, encodeOpaqueCursor, type PageRequest } from "../pagination";
import type { ResearchCheckpoint, ResearchReportRepository, ResearchReportRecord, ResearchReportSaveInput, ResearchRun, ResearchRunListItem, ResearchRunPage, ResearchRunPlan, ResearchQuery } from "../ai/research-report-service";

type RunRow = { id: string; owner_member_id: string; knowledge_item_id: string; goal: string; scope_json: string; completion_json: string; steps_json: string; subquestions_json: string; status: string; quota_state: string; quota_deferred_until: string | null; checkpoint_json: string; created_at: string; updated_at: string };
type ReportRow = { id: string; research_run_id: string; knowledge_item_id: string; version: number; title: string; sections_json: string; source_snapshots_json: string; model: string; prompt_version: string; created_at: string };
type ResearchCursor = { v: 1; updatedAt: string; id: string };

export class ResearchRepository implements ResearchReportRepository {
  constructor(private readonly db: D1Database) {}

  async createRun(input: { id: string; ownerMemberId: string; knowledgeItemId: string; goal: string; plan: ResearchRunPlan; createdAt: string }): Promise<ResearchRun> {
    await this.db.prepare(
      `INSERT INTO research_runs (id, owner_member_id, knowledge_item_id, goal, scope_json, completion_json, steps_json, subquestions_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    ).bind(input.id, input.ownerMemberId, input.knowledgeItemId, input.goal, JSON.stringify({ spaceIds: input.plan.spaceIds, collectionIds: input.plan.collectionIds, knowledgeItemIds: input.plan.knowledgeItemIds }), JSON.stringify(input.plan.completion), JSON.stringify(input.plan.steps), JSON.stringify(input.plan.subquestions), input.createdAt, input.createdAt).run();
    return { id: input.id, ownerMemberId: input.ownerMemberId, knowledgeItemId: input.knowledgeItemId, goal: input.goal, plan: input.plan, status: "draft", quotaState: "available", quotaDeferredUntil: null, checkpoint: { nextStep: 0, completedSubquestionIds: [] } };
  }

  async findRun(scope: LibraryScope, id: string): Promise<ResearchRun | null> {
    const row = await this.db.prepare(
      `SELECT id, owner_member_id, knowledge_item_id, goal, scope_json, completion_json, steps_json, subquestions_json, status, quota_state, quota_deferred_until, checkpoint_json, created_at, updated_at
       FROM research_runs WHERE id = ? AND owner_member_id = ? LIMIT 1`,
    ).bind(id, scope.memberId).first<RunRow>();
    if (!row) return null;
    return parseRun(row);
  }

  async listRuns(scope: LibraryScope, request: PageRequest): Promise<ResearchRunPage> {
    const cursor = request.cursor === undefined ? undefined : decodeResearchCursor(request.cursor);
    const cursorSql = cursor ? "AND (updated_at < ? OR (updated_at = ? AND id < ?))" : "";
    const rows = await this.db.prepare(
      `SELECT id, owner_member_id, knowledge_item_id, goal, scope_json, completion_json, steps_json, subquestions_json, status, quota_state, quota_deferred_until, checkpoint_json, created_at, updated_at
       FROM research_runs
       WHERE owner_member_id = ? ${cursorSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    ).bind(
      scope.memberId,
      ...(cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : []),
      request.limit + 1,
    ).all<RunRow>();
    const items = rows.results.slice(0, request.limit).map((row) => toListItem(parseRun(row)));
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodeOpaqueCursor({ v: 1, updatedAt: last.updatedAt, id: last.id }),
      } : {}),
    };
  }

  async findReport(scope: LibraryScope, researchRunId: string, reportId: string): Promise<ResearchReportRecord | null> {
    const row = await this.db.prepare(
      `SELECT report.id, report.research_run_id, run.knowledge_item_id, report.version, report.title,
              report.sections_json, report.source_snapshots_json, report.model, report.prompt_version, report.created_at
       FROM research_reports AS report
       JOIN research_runs AS run ON run.id = report.research_run_id
       WHERE report.id = ? AND report.research_run_id = ? AND run.owner_member_id = ? LIMIT 1`,
    ).bind(reportId, researchRunId, scope.memberId).first<ReportRow>();
    if (!row) return null;
    try {
      const sections = JSON.parse(row.sections_json) as unknown;
      const sourceSnapshots = JSON.parse(row.source_snapshots_json) as unknown;
      if (!Array.isArray(sections) || !Array.isArray(sourceSnapshots)) throw new Error("invalid");
      return {
        id: row.id,
        researchRunId: row.research_run_id,
        knowledgeItemId: row.knowledge_item_id,
        version: row.version,
        title: row.title,
        sections: sections as ResearchReportRecord["sections"],
        sourceSnapshots: sourceSnapshots as ResearchReportRecord["sourceSnapshots"],
        model: row.model,
        promptVersion: row.prompt_version,
        createdAt: row.created_at,
      };
    } catch {
      throw new AppError("RESEARCH_REPORT_CORRUPT", "Research report is unavailable", 503, true);
    }
  }

  async approveRun(scope: LibraryScope, id: string): Promise<ResearchRun> {
    const result = await this.db.prepare("UPDATE research_runs SET status = 'running', updated_at = ? WHERE id = ? AND owner_member_id = ? AND status IN ('draft', 'paused')").bind(new Date().toISOString(), id, scope.memberId).run();
    if (!result.meta.changes) throw new AppError("RESEARCH_RUN_NOT_FOUND", "Research run was not found", 404);
    const run = await this.findRun(scope, id);
    if (!run) throw new AppError("RESEARCH_RUN_UNAVAILABLE", "Research run is unavailable", 503, true);
    return run;
  }

  async pauseRun(scope: LibraryScope, id: string): Promise<ResearchRun> {
    const result = await this.db.prepare("UPDATE research_runs SET status = 'paused', updated_at = ? WHERE id = ? AND owner_member_id = ? AND status IN ('draft', 'running')").bind(new Date().toISOString(), id, scope.memberId).run();
    if (!result.meta.changes) throw new AppError("RESEARCH_RUN_NOT_FOUND", "Research run was not found", 404);
    const run = await this.findRun(scope, id);
    if (!run) throw new AppError("RESEARCH_RUN_UNAVAILABLE", "Research run is unavailable", 503, true);
    return run;
  }

  async cancelRun(scope: LibraryScope, id: string): Promise<ResearchRun> {
    const result = await this.db.prepare("UPDATE research_runs SET status = 'cancelled', updated_at = ? WHERE id = ? AND owner_member_id = ? AND status IN ('draft', 'running', 'paused')").bind(new Date().toISOString(), id, scope.memberId).run();
    if (!result.meta.changes) throw new AppError("RESEARCH_RUN_NOT_FOUND", "Research run was not found", 404);
    const run = await this.findRun(scope, id);
    if (!run) throw new AppError("RESEARCH_RUN_UNAVAILABLE", "Research run is unavailable", 503, true);
    return run;
  }

  async deferQuota(scope: LibraryScope, id: string, deferredUntil: string, checkpoint: ResearchCheckpoint): Promise<ResearchRun> {
    const result = await this.db.prepare(
      "UPDATE research_runs SET quota_state = 'deferred_quota', quota_deferred_until = ?, checkpoint_json = ?, updated_at = ? WHERE id = ? AND owner_member_id = ? AND status = 'running'",
    ).bind(deferredUntil, JSON.stringify(checkpoint), new Date().toISOString(), id, scope.memberId).run();
    if (!result.meta.changes) throw new AppError("RESEARCH_RUN_NOT_FOUND", "Research run was not found", 404);
    const run = await this.findRun(scope, id);
    if (!run) throw new AppError("RESEARCH_RUN_UNAVAILABLE", "Research run is unavailable", 503, true);
    return run;
  }

  async resumeQuota(scope: LibraryScope, id: string, now: string): Promise<ResearchRun> {
    const result = await this.db.prepare(
      "UPDATE research_runs SET quota_state = 'available', quota_deferred_until = NULL, updated_at = ? WHERE id = ? AND owner_member_id = ? AND status = 'running' AND quota_state = 'deferred_quota' AND quota_deferred_until IS NOT NULL AND quota_deferred_until <= ?",
    ).bind(now, id, scope.memberId, now).run();
    if (!result.meta.changes) throw new AppError("RESEARCH_QUOTA_DEFERRED", "Research quota is still deferred", 429, true);
    const run = await this.findRun(scope, id);
    if (!run) throw new AppError("RESEARCH_RUN_UNAVAILABLE", "Research run is unavailable", 503, true);
    return run;
  }

  async recordQuery(input: ResearchQuery): Promise<ResearchQuery> {
    await this.db.prepare("INSERT INTO research_queries (id, research_run_id, subquestion_id, query, result_ids_json, rationale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(input.id, input.researchRunId, input.subquestionId, input.query, JSON.stringify(input.resultIds), input.rationale, input.createdAt).run();
    return input;
  }

  async nextVersion(researchRunId: string): Promise<number> {
    const row = await this.db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM research_reports WHERE research_run_id = ?").bind(researchRunId).first<{ next_version: number }>();
    if (!row || !Number.isSafeInteger(row.next_version) || row.next_version < 1) throw new AppError("RESEARCH_REPORT_UNAVAILABLE", "Research report is unavailable", 503, true);
    return row.next_version;
  }

  async saveReport(input: ResearchReportSaveInput): Promise<{ id: string; version: number }> {
    await this.db.prepare(
      `INSERT INTO research_reports (id, research_run_id, version, title, sections_json, source_snapshots_json, model, prompt_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(input.id, input.researchRunId, input.version, input.title, JSON.stringify(input.sections), JSON.stringify(input.sourceSnapshots), input.model, input.promptVersion, input.createdAt).run();
    return { id: input.id, version: input.version };
  }
}

function parseRun(row: RunRow): ResearchRun & { createdAt: string; updatedAt: string } {
  try {
    const scope = JSON.parse(row.scope_json) as { spaceIds?: unknown; collectionIds?: unknown; knowledgeItemIds?: unknown };
    const completion = JSON.parse(row.completion_json) as unknown;
    const steps = JSON.parse(row.steps_json) as unknown;
    const subquestions = JSON.parse(row.subquestions_json) as unknown;
    const checkpoint = JSON.parse(row.checkpoint_json) as Partial<ResearchCheckpoint>;
    if (!Array.isArray(scope.spaceIds) || !Array.isArray(scope.collectionIds) || !Array.isArray(scope.knowledgeItemIds) || !Array.isArray(completion) || !Array.isArray(steps) || !Array.isArray(subquestions)
      || !isResearchStatus(row.status) || !isQuotaState(row.quota_state)
      || typeof checkpoint.nextStep !== "number" || !Number.isSafeInteger(checkpoint.nextStep) || checkpoint.nextStep < 0
      || !Array.isArray(checkpoint.completedSubquestionIds) || !checkpoint.completedSubquestionIds.every((id) => typeof id === "string")) throw new Error("invalid");
    return {
      id: row.id,
      ownerMemberId: row.owner_member_id,
      knowledgeItemId: row.knowledge_item_id,
      goal: row.goal,
      plan: {
        spaceIds: scope.spaceIds as string[],
        collectionIds: scope.collectionIds as string[],
        knowledgeItemIds: scope.knowledgeItemIds as string[],
        completion: completion as string[],
        steps: steps as string[],
        subquestions: subquestions as ResearchRun["plan"]["subquestions"],
      },
      status: row.status,
      quotaState: row.quota_state,
      quotaDeferredUntil: row.quota_deferred_until,
      checkpoint: { nextStep: checkpoint.nextStep, completedSubquestionIds: checkpoint.completedSubquestionIds as string[] },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch { throw new AppError("RESEARCH_RUN_CORRUPT", "Research run is unavailable", 503, true); }
}

function toListItem(run: ResearchRun & { createdAt: string; updatedAt: string }): ResearchRunListItem {
  const { ownerMemberId: _ownerMemberId, ...item } = run;
  return item;
}

function decodeResearchCursor(value: string): ResearchCursor {
  try {
    const decoded = decodeOpaqueCursor(value);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.v !== 1 || typeof record.updatedAt !== "string" || !isIsoTimestamp(record.updatedAt)
      || typeof record.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.id)) throw new Error();
    return { v: 1, updatedAt: record.updatedAt, id: record.id };
  } catch { throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400); }
}

function isResearchStatus(value: string): value is ResearchRun["status"] {
  return value === "draft" || value === "running" || value === "paused" || value === "completed" || value === "cancelled";
}

function isQuotaState(value: string): value is ResearchRun["quotaState"] {
  return value === "available" || value === "deferred_quota";
}

function isIsoTimestamp(value: string): boolean { return value.length === 24 && !Number.isNaN(Date.parse(value)) && value.endsWith("Z"); }
