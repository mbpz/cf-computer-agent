import { describe, expect, it } from "vitest";
import { ComparisonService } from "../../src/ai/comparison-service";
import type { CitationSource } from "../../src/library/types";

const scope = { memberId: "member-1", role: "contributor" as const };
const sources: CitationSource[] = [
  { citationId: "c-1", knowledgeItemId: "k-1", revisionId: "r-1", chunkId: "ch-1", title: "设计文档", headingPath: ["方案"], startLine: 1, endLine: 4, body: "方案甲强调低成本。", publishedAt: "2026-01-01T00:00:00.000Z" },
  { citationId: "c-2", knowledgeItemId: "k-1", revisionId: "r-2", chunkId: "ch-2", title: "运行记录", headingPath: ["结果"], startLine: 8, endLine: 12, body: "运行记录显示方案乙更快。", publishedAt: "2026-01-02T00:00:00.000Z" },
];

function ai(response: unknown) {
  return { run: async () => ({ response: JSON.stringify(response) }) };
}

describe("ComparisonService", () => {
  it("returns source cells, consensus, and conflicts with citations", async () => {
    const result = await new ComparisonService(ai({
      rows: [{ topic: "主要取舍", cells: [
        { sourceId: "c-1", text: "优先低成本。", citationIds: ["c-1"] },
        { sourceId: "c-2", text: "优先吞吐量。", citationIds: ["c-2"] },
      ] }],
      consensus: [{ text: "两份材料都讨论部署取舍。", citationIds: ["c-1", "c-2"] }],
      conflicts: [{ text: "成本与速度的优先级不同。", citationIds: ["c-1", "c-2"] }],
      insufficientEvidence: false,
    })).compare(scope, "k-1", sources);

    expect(result.rows[0]?.cells[0]?.citations[0]?.citationId).toBe("c-1");
    expect(result.consensus[0]?.citations.map((citation) => citation.citationId)).toEqual(["c-1", "c-2"]);
    expect(result.conflicts[0]?.text).toContain("优先级");
  });

  it("rejects a cell whose citation is not selected", async () => {
    await expect(new ComparisonService(ai({
      rows: [{ topic: "取舍", cells: [{ sourceId: "c-1", text: "无依据", citationIds: ["c-9"] }] }],
      consensus: [], conflicts: [], insufficientEvidence: false,
    })).compare(scope, "k-1", sources)).rejects.toMatchObject({ code: "COMPARISON_UNGROUNDED", status: 422 });
  });

  it("returns an explicit gap for insufficient evidence and maps provider failure", async () => {
    const gap = await new ComparisonService(ai({ rows: [], consensus: [], conflicts: [], insufficientEvidence: true })).compare(scope, "k-1", sources);
    expect(gap).toEqual({ rows: [], consensus: [], conflicts: [], messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT" });
    await expect(new ComparisonService({ run: async () => { throw new Error("upstream"); } }).compare(scope, "k-1", sources)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
});
