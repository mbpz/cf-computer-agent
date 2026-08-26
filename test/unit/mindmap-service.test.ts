import { describe, expect, it } from "vitest";
import { MindmapService } from "../../src/ai/mindmap-service";

const scope = { memberId: "member-1", role: "contributor" as const };
const sources = [{ citationId: "c-1", knowledgeItemId: "k-1", revisionId: "r-1", chunkId: "ch-1", title: "文档", headingPath: ["方案"], startLine: 1, endLine: 4, body: "成本与速度。", publishedAt: "2026-01-01T00:00:00.000Z" }];
const ai = (value: unknown) => ({ run: async () => ({ response: JSON.stringify(value) }) });

describe("MindmapService", () => {
  it("returns cited nodes and readable edges", async () => {
    const result = await new MindmapService(ai({ nodes: [{ id: "root", label: "方案", citationIds: ["c-1"] }, { id: "cost", label: "成本", citationIds: ["c-1"] }], edges: [{ from: "root", to: "cost", relation: "包含", citationIds: ["c-1"] }], insufficientEvidence: false })).generate(scope, "k-1", sources);
    expect(result.nodes[0]?.citations[0]?.citationId).toBe("c-1");
    expect(result.edges[0]).toEqual(expect.objectContaining({ from: "root", to: "cost", relation: "包含" }));
  });
  it("rejects dangling or ungrounded graph links", async () => {
    await expect(new MindmapService(ai({ nodes: [{ id: "root", label: "方案", citationIds: ["c-1"] }], edges: [{ from: "root", to: "missing", relation: "包含", citationIds: ["c-1"] }], insufficientEvidence: false })).generate(scope, "k-1", sources)).rejects.toMatchObject({ code: "MINDMAP_UNGROUNDED", status: 422 });
  });
  it("returns a gap and maps provider failures", async () => {
    const gap = await new MindmapService(ai({ nodes: [], edges: [], insufficientEvidence: true })).generate(scope, "k-1", sources);
    expect(gap.messageKey).toBe("KNOWLEDGE_EVIDENCE_INSUFFICIENT");
    await expect(new MindmapService({ run: async () => { throw new Error("upstream"); } }).generate(scope, "k-1", sources)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
});
