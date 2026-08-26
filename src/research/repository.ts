import { AppError } from "../http";
import type { LibraryScope } from "../library/types";
import type { ResearchReportRepository, ResearchReportSaveInput, ResearchRun } from "../ai/research-report-service";

type RunRow = { id: string; owner_member_id: string; knowledge_item_id: string; goal: string; status: ResearchRun["status"] };

export class ResearchRepository implements ResearchReportRepository {
  constructor(private readonly db: D1Database) {}

  async createRun(input: { id: string; ownerMemberId: string; knowledgeItemId: string; goal: string; createdAt: string }): Promise<ResearchRun> {
    await this.db.prepare(
      `INSERT INTO research_runs (id, owner_member_id, knowledge_item_id, goal, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
    ).bind(input.id, input.ownerMemberId, input.knowledgeItemId, input.goal, input.createdAt, input.createdAt).run();
    return { id: input.id, ownerMemberId: input.ownerMemberId, knowledgeItemId: input.knowledgeItemId, goal: input.goal, status: "draft" };
  }

  async findRun(scope: LibraryScope, id: string): Promise<ResearchRun | null> {
    const row = await this.db.prepare(
      `SELECT id, owner_member_id, knowledge_item_id, goal, status
       FROM research_runs WHERE id = ? AND owner_member_id = ? LIMIT 1`,
    ).bind(id, scope.memberId).first<RunRow>();
    return row ? { id: row.id, ownerMemberId: row.owner_member_id, knowledgeItemId: row.knowledge_item_id, goal: row.goal, status: row.status } : null;
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
