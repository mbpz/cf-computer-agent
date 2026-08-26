import { AppError } from "../http";
import type { LibraryScope } from "../library/types";
import type { ResearchReportRepository, ResearchReportSaveInput, ResearchRun, ResearchRunPlan } from "../ai/research-report-service";

type RunRow = { id: string; owner_member_id: string; knowledge_item_id: string; goal: string; scope_json: string; completion_json: string; steps_json: string; status: ResearchRun["status"] };

export class ResearchRepository implements ResearchReportRepository {
  constructor(private readonly db: D1Database) {}

  async createRun(input: { id: string; ownerMemberId: string; knowledgeItemId: string; goal: string; plan: ResearchRunPlan; createdAt: string }): Promise<ResearchRun> {
    await this.db.prepare(
      `INSERT INTO research_runs (id, owner_member_id, knowledge_item_id, goal, scope_json, completion_json, steps_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    ).bind(input.id, input.ownerMemberId, input.knowledgeItemId, input.goal, JSON.stringify({ spaceIds: input.plan.spaceIds, collectionIds: input.plan.collectionIds, knowledgeItemIds: input.plan.knowledgeItemIds }), JSON.stringify(input.plan.completion), JSON.stringify(input.plan.steps), input.createdAt, input.createdAt).run();
    return { id: input.id, ownerMemberId: input.ownerMemberId, knowledgeItemId: input.knowledgeItemId, goal: input.goal, plan: input.plan, status: "draft" };
  }

  async findRun(scope: LibraryScope, id: string): Promise<ResearchRun | null> {
    const row = await this.db.prepare(
      `SELECT id, owner_member_id, knowledge_item_id, goal, scope_json, completion_json, steps_json, status
       FROM research_runs WHERE id = ? AND owner_member_id = ? LIMIT 1`,
    ).bind(id, scope.memberId).first<RunRow>();
    if (!row) return null;
    try {
      const scope = JSON.parse(row.scope_json) as { spaceIds?: unknown; collectionIds?: unknown; knowledgeItemIds?: unknown };
      const completion = JSON.parse(row.completion_json) as unknown;
      const steps = JSON.parse(row.steps_json) as unknown;
      if (!Array.isArray(scope.spaceIds) || !Array.isArray(scope.collectionIds) || !Array.isArray(scope.knowledgeItemIds) || !Array.isArray(completion) || !Array.isArray(steps)) throw new Error("invalid");
      return { id: row.id, ownerMemberId: row.owner_member_id, knowledgeItemId: row.knowledge_item_id, goal: row.goal, plan: { spaceIds: scope.spaceIds as string[], collectionIds: scope.collectionIds as string[], knowledgeItemIds: scope.knowledgeItemIds as string[], completion: completion as string[], steps: steps as string[] }, status: row.status };
    } catch { throw new AppError("RESEARCH_RUN_CORRUPT", "Research run is unavailable", 503, true); }
  }

  async approveRun(scope: LibraryScope, id: string): Promise<ResearchRun> {
    const result = await this.db.prepare("UPDATE research_runs SET status = 'running', updated_at = ? WHERE id = ? AND owner_member_id = ? AND status = 'draft'").bind(new Date().toISOString(), id, scope.memberId).run();
    if (!result.meta.changes) throw new AppError("RESEARCH_RUN_NOT_FOUND", "Research run was not found", 404);
    const run = await this.findRun(scope, id);
    if (!run) throw new AppError("RESEARCH_RUN_UNAVAILABLE", "Research run is unavailable", 503, true);
    return run;
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
