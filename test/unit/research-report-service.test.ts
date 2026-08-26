import { describe, expect, it } from "vitest";
import { ResearchReportService } from "../../src/ai/research-report-service";

const scope = { memberId: "member-1", role: "contributor" as const };
const run = { id: "run-1", ownerMemberId: "member-1", knowledgeItemId: "k-1", goal: "比较落地方案", plan: { spaceIds: [], collectionIds: [], knowledgeItemIds: [], completion: ["形成有引用结论"], steps: ["读取来源"], subquestions: [{ id: "q1", question: "成本约束是什么？", scope: { spaceIds: [], collectionIds: [], knowledgeItemIds: [] }, status: "pending" as const }] }, status: "running" as const };
const sources = [{
  citationId: "c-1", knowledgeItemId: "k-1", revisionId: "r-1", chunkId: "ch-1", title: "设计文档", headingPath: ["方案"], startLine: 1, endLine: 4,
  body: "方案甲强调低成本。", publishedAt: "2026-01-01T00:00:00.000Z",
}];

function repository() {
  return {
    createRun: async (input: any) => ({ ...run, ...input, status: "draft" }),
    approveRun: async () => ({ ...run, status: "running" as const }),
    pauseRun: async () => ({ ...run, status: "paused" as const }),
    cancelRun: async () => ({ ...run, status: "cancelled" as const }),
    recordQuery: async (input: any) => input,
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

  it("rejects query writes after a research run is cancelled", async () => {
    const cancelledRepo = {
      ...repository(),
      findRun: async () => ({ ...run, status: "cancelled" as const }),
    };
    await expect(new ResearchReportService(cancelledRepo, ai({})).recordQuery(scope, {
      researchRunId: "run-1",
      subquestionId: "q1",
      query: "成本约束",
      resultIds: ["c-1"],
      rationale: "结果直接回答子问题",
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_NOT_FOUND", status: 404 });
  });

  it("increments the report version instead of replacing the prior artifact", async () => {
    const saved: any[] = [];
    const repo = { ...repository(), nextVersion: async () => 2, saveReport: async (input: any) => { saved.push(input); return { id: "report-2", version: input.version }; } };
    const result = await new ResearchReportService(repo, ai({ title: "第二版", sections: [{ heading: "结论", body: "仍有依据。", citationIds: ["c-1"] }], insufficientEvidence: false })).generate(scope, "run-1", sources);
    expect(result.version).toBe(2);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.version).toBe(2);
  });

  it("keeps research generation to one bounded AI call and wall clock", async () => {
    let calls = 0;
    const result = await new ResearchReportService(repository(), { run: async () => { calls += 1; return { response: JSON.stringify({ title: "报告", sections: [{ heading: "结论", body: "有依据。", citationIds: ["c-1"] }], insufficientEvidence: false }) }; } }).generate(scope, "run-1", sources);
    expect(result.sections).toHaveLength(1);
    expect(calls).toBe(1);
    await expect(new ResearchReportService(repository(), { run: async () => new Promise(() => undefined) }, 1).generate(scope, "run-1", sources)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
});
