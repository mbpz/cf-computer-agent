/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { describe, expect, it } from "vitest";
import { adaptMindmapToGraph } from "../../src/graph/mindmap-adapter";
import type { MindmapResult } from "../../src/ai/mindmap-service";

const citation = (citationId: string) => ({ citationId, title: "Authorized source", headingPath: [], startLine: 1, endLine: 1 });

describe("mindmap graph worker authorization fixture", () => {
  it("keeps the member citation allow-list at the adapter boundary", () => {
    const mindmap: MindmapResult = {
      nodes: [{ id: "a", label: "A", citations: [citation("member-a-citation")] }, { id: "b", label: "B", citations: [citation("member-b-citation")] }],
      edges: [{ from: "a", to: "b", relation: "links", citations: [citation("member-b-citation")] }],
    };
    const memberA = adaptMindmapToGraph(mindmap, { knowledgeItemId: "knowledge-a", authorizedCitationIds: ["member-a-citation"] });
    const memberB = adaptMindmapToGraph(mindmap, { knowledgeItemId: "knowledge-a", authorizedCitationIds: ["member-b-citation"] });
    expect(memberA.edges).toEqual([]);
    expect(memberA.evidenceGaps[0]?.reason).toBe("unauthorized_citation");
    expect(memberB.edges).toHaveLength(1);
    expect(memberB.edges[0]?.citationIds).toEqual(["member-b-citation"]);
  });
});
