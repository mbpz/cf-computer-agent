import { describe, expect, it } from "vitest";
import { adaptMindmapToGraph } from "../../src/graph/mindmap-adapter";
import type { MindmapResult } from "../../src/ai/mindmap-service";

const citation = (citationId: string) => ({ citationId, title: "Source", headingPath: ["Section"], startLine: 1, endLine: 2 });

function result(overrides: Partial<MindmapResult> = {}): MindmapResult {
  return {
    nodes: [{ id: "root", label: "Root", citations: [citation("cite-a")] }, { id: "child", label: "Child", citations: [citation("cite-a")] }],
    edges: [{ from: "root", to: "child", relation: "contains", citations: [citation("cite-a")] }],
    ...overrides,
  };
}

describe("mindmap graph adapter", () => {
  it("maps grounded concepts to knowledge nodes and cited derived edges", () => {
    const adapted = adaptMindmapToGraph(result(), { knowledgeItemId: "knowledge-a", authorizedCitationIds: ["cite-a"] });
    expect(adapted.nodes.map((node) => node.kind)).toEqual(["knowledge", "knowledge"]);
    expect(adapted.edges).toMatchObject([{ kind: "derived", citationIds: ["cite-a"] }]);
    expect(adapted.evidenceGaps).toEqual([]);
    expect(JSON.stringify(adapted)).not.toContain("memberId");
  });

  it("turns unknown endpoints and citationless relations into evidence gaps", () => {
    const adapted = adaptMindmapToGraph(result({ edges: [
      { from: "root", to: "missing", relation: "unknown", citations: [citation("cite-a")] },
      { from: "root", to: "child", relation: "unsupported", citations: [] },
    ] }), { knowledgeItemId: "knowledge-a" });
    expect(adapted.edges).toEqual([]);
    expect(adapted.evidenceGaps).toEqual([
      expect.objectContaining({ reason: "unknown_endpoint" }),
      expect.objectContaining({ reason: "missing_citation" }),
    ]);
  });

  it("does not promote citations outside the authorized member projection", () => {
    const adapted = adaptMindmapToGraph(result({ edges: [{ from: "root", to: "child", relation: "private", citations: [citation("cite-b")] }] }), {
      knowledgeItemId: "knowledge-a",
      authorizedCitationIds: ["cite-a"],
    });
    expect(adapted.edges).toEqual([]);
    expect(adapted.evidenceGaps[0]).toMatchObject({ reason: "unauthorized_citation", citationIds: [] });
  });
});
