import { describe, expect, it } from "vitest";
import { BriefService, type BriefAi } from "../../src/ai/brief-service";
import type { CitationSource, LibraryScope } from "../../src/library/types";

const scope: LibraryScope = { memberId: "member-1", role: "contributor" };
const source: CitationSource = {
  citationId: "citation-1", knowledgeItemId: "knowledge-1", revisionId: "revision-1", chunkId: "chunk-1",
  title: "Plan", headingPath: ["Overview"], startLine: 1, endLine: 3,
  body: "Launch at the edge with a small private team.", publishedAt: "2026-08-01T00:00:00.000Z",
};
function ai(response: unknown): BriefAi { return { run: async () => ({ response: JSON.stringify(response) }) }; }

describe("BriefService", () => {
  it("returns goal, points, risks, and open questions with citations", async () => {
    const service = new BriefService(ai({
      goal: { text: "Launch a private edge knowledge base.", citationIds: ["citation-1"] },
      keyPoints: [{ text: "Keep the team small.", citationIds: ["citation-1"] }],
      risks: [{ text: "Capacity may be limited.", citationIds: ["citation-1"] }],
      openQuestions: [{ text: "Which edge region is preferred?", citationIds: ["citation-1"] }],
      insufficientEvidence: false,
    }));
    await expect(service.generate(scope, "knowledge-1", [source])).resolves.toMatchObject({
      goal: { text: "Launch a private edge knowledge base.", citations: [expect.objectContaining({ citationId: "citation-1" })] },
      keyPoints: [expect.objectContaining({ text: "Keep the team small." })],
      risks: [expect.objectContaining({ text: "Capacity may be limited." })],
      openQuestions: [expect.objectContaining({ text: "Which edge region is preferred?" })],
    });
  });

  it("rejects any section item without a selected citation", async () => {
    const service = new BriefService(ai({
      goal: { text: "Goal", citationIds: [] }, keyPoints: [], risks: [], openQuestions: [], insufficientEvidence: false,
    }));
    await expect(service.generate(scope, "knowledge-1", [source])).rejects.toMatchObject({ code: "BRIEF_UNGROUNDED", status: 422 });
  });

  it("returns an explicit evidence gap and maps provider failure", async () => {
    const empty = new BriefService(ai({ goal: null, keyPoints: [], risks: [], openQuestions: [], insufficientEvidence: true }));
    await expect(empty.generate(scope, "knowledge-1", [source])).resolves.toEqual({
      goal: null, keyPoints: [], risks: [], openQuestions: [], messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT",
    });
    const failure = new BriefService({ run: async () => { throw new Error("provider down"); } });
    await expect(failure.generate(scope, "knowledge-1", [source])).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503, retryable: true });
  });
});
