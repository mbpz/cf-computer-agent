import { describe, expect, it } from "vitest";
import { ResearchReportService } from "../../src/ai/research-report-service";

const scope = { memberId: "member-1", role: "contributor" as const };
const run = { id: "run-1", ownerMemberId: "member-1", knowledgeItemId: "k-1", goal: "比较落地方案", status: "draft" as const };
const sources = [{
  citationId: "c-1", knowledgeItemId: "k-1", revisionId: "r-1", chunkId: "ch-1", title: "设计文档", headingPath: ["方案"], startLine: 1, endLine: 4,
  body: "方案甲强调低成本。", publishedAt: "2026-01-01T00:00:00.000Z",
}];

function repository() {
  return {
    createRun: async (input: any) => ({ ...run, ...input }),
    findRun: async () => run,
    nextVersion: async () => 1,
    saveReport: async (input: any) => ({ ...input, id: "report-1" }),
  };
}
function ai(response: unknown) { return { run: async () => ({ response: JSON.stringify(response) }) }; }

describe("ResearchReportService", () => {
  it("generates a versioned report with immutable source snapshots", async () => {
    const result = await new ResearchReportService(repository(), ai({
      title: "落地方案研究报告",
      sections: [{ heading: "结论", body: "方案甲适合当前约束。", citationIds: ["c-1"] }],
      insufficientEvidence: false,
    })).generate(scope, "run-1", sources);
    expect(result.reportId).toBe("report-1");
    expect(result.version).toBe(1);
    expect(result.sourceSnapshots).toEqual([expect.objectContaining({ citationId: "c-1", revisionId: "r-1", chunkId: "ch-1", publishedAt: sources[0]!.publishedAt })]);
    expect(result.sections[0]?.citations[0]?.citationId).toBe("c-1");
  });

  it("rejects a run owned by another member and ungrounded sections", async () => {
    const forbiddenRepo = { ...repository(), findRun: async () => ({ ...run, ownerMemberId: "other" }) };
    await expect(new ResearchReportService(forbiddenRepo, ai({})).generate(scope, "run-1", sources)).rejects.toMatchObject({ code: "RESEARCH_RUN_NOT_FOUND", status: 404 });
    await expect(new ResearchReportService(repository(), ai({ title: "x", sections: [{ heading: "结论", body: "无依据", citationIds: ["c-9"] }], insufficientEvidence: false })).generate(scope, "run-1", sources)).rejects.toMatchObject({ code: "RESEARCH_REPORT_UNGROUNDED", status: 422 });
  });

  it("returns a gap for insufficient evidence and maps provider failure", async () => {
    const gap = await new ResearchReportService(repository(), ai({ title: "证据不足", sections: [], insufficientEvidence: true })).generate(scope, "run-1", sources);
    expect(gap.messageKey).toBe("KNOWLEDGE_EVIDENCE_INSUFFICIENT");
    await expect(new ResearchReportService(repository(), { run: async () => { throw new Error("upstream"); } }).generate(scope, "run-1", sources)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
});
