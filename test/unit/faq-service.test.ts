import { describe, expect, it } from "vitest";
import { FaqService, type FaqAi } from "../../src/ai/faq-service";
import type { CitationSource, LibraryScope } from "../../src/library/types";

const scope: LibraryScope = { memberId: "member-1", role: "contributor" };
const source: CitationSource = {
  citationId: "citation-1",
  knowledgeItemId: "knowledge-1",
  revisionId: "revision-1",
  chunkId: "chunk-1",
  title: "Workers overview",
  headingPath: ["Overview"],
  startLine: 1,
  endLine: 2,
  body: "Workers run at the edge.",
  publishedAt: "2026-08-01T00:00:00.000Z",
};

function ai(response: unknown): FaqAi {
  return { run: async () => ({ response: JSON.stringify(response) }) };
}

describe("FaqService", () => {
  it("requires a citation for every answered FAQ item", async () => {
    const service = new FaqService(ai({
      items: [{ question: "Where do Workers run?", answer: "At the edge.", citationIds: ["citation-1"], insufficientEvidence: false }],
    }));

    await expect(service.generate(scope, "knowledge-1", [source])).resolves.toEqual({
      items: [{
        question: "Where do Workers run?",
        answer: "At the edge.",
        citations: [{ citationId: "citation-1", title: "Workers overview", headingPath: ["Overview"], startLine: 1, endLine: 2 }],
        gap: false,
      }],
    });
  });

  it("marks an unanswered FAQ item as an evidence gap", async () => {
    const service = new FaqService(ai({
      items: [{ question: "What is unknown?", answer: "", citationIds: [], insufficientEvidence: true }],
    }));

    await expect(service.generate(scope, "knowledge-1", [source])).resolves.toEqual({
      items: [{ question: "What is unknown?", answer: null, citations: [], gap: true }],
    });
  });

  it("rejects an answered item without citations or with an unselected citation", async () => {
    const missing = new FaqService(ai({ items: [{ question: "Q", answer: "A", citationIds: [], insufficientEvidence: false }] }));
    await expect(missing.generate(scope, "knowledge-1", [source])).rejects.toMatchObject({ code: "FAQ_UNGROUNDED", status: 422 });

    const forged = new FaqService(ai({ items: [{ question: "Q", answer: "A", citationIds: ["other"], insufficientEvidence: false }] }));
    await expect(forged.generate(scope, "knowledge-1", [source])).rejects.toMatchObject({ code: "FAQ_UNGROUNDED", status: 422 });
  });

  it("maps provider failure to a retryable AI error", async () => {
    const service = new FaqService({ run: async () => { throw new Error("provider down"); } });
    await expect(service.generate(scope, "knowledge-1", [source])).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503, retryable: true });
  });
});
