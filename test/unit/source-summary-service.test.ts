import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http";
import { SourceSummaryService, type SourceSummaryAi } from "../../src/ai/source-summary-service";
import type { CitationSource, LibraryScope } from "../../src/library/types";

const scope: LibraryScope = { memberId: "member-1", role: "contributor" };

function citation(id = "citation-1", body = "Cloudflare Workers run at the edge."): CitationSource {
  return {
    citationId: id,
    knowledgeItemId: "knowledge-1",
    revisionId: "revision-1",
    chunkId: id,
    title: "Workers overview",
    headingPath: ["Overview"],
    startLine: 1,
    endLine: 2,
    body,
    publishedAt: "2026-08-01T00:00:00.000Z",
  };
}

function aiWith(response: unknown): SourceSummaryAi {
  return { run: async () => ({ response: JSON.stringify(response) }) };
}

describe("SourceSummaryService", () => {
  it("summarizes only selected sources and preserves their citation bindings", async () => {
    const service = new SourceSummaryService(aiWith({
      claims: [{ text: "Workers run at the edge.", citationIds: ["citation-1"] }],
      insufficientEvidence: false,
    }));

    await expect(service.summarize(scope, "knowledge-1", [citation()])).resolves.toEqual({
      summary: "Workers run at the edge. [1]",
      citations: [{
        citationId: "citation-1",
        title: "Workers overview",
        headingPath: ["Overview"],
        startLine: 1,
        endLine: 2,
      }],
    });
  });

  it("rejects claims that cite a source outside the selected set", async () => {
    const service = new SourceSummaryService(aiWith({
      claims: [{ text: "Not grounded.", citationIds: ["not-selected"] }],
      insufficientEvidence: false,
    }));

    await expect(service.summarize(scope, "knowledge-1", [citation()])).rejects.toMatchObject({
      code: "SOURCE_SUMMARY_UNGROUNDED",
      status: 422,
    });
  });

  it("returns a stable insufficient-evidence result without calling it a success", async () => {
    const service = new SourceSummaryService(aiWith({ claims: [], insufficientEvidence: true }));

    await expect(service.summarize(scope, "knowledge-1", [citation()])).resolves.toEqual({
      summary: "知识库中没有足够依据总结这些来源。",
      citations: [],
      messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT",
    });
  });

  it("maps provider failures to a retryable AI error", async () => {
    const service = new SourceSummaryService({ run: async () => { throw new Error("provider down"); } });

    await expect(service.summarize(scope, "knowledge-1", [citation()])).rejects.toEqual(
      expect.objectContaining({ code: "AI_UNAVAILABLE", status: 503, retryable: true }),
    );
  });

  it("rejects an empty or cross-item source set before invoking AI", async () => {
    let calls = 0;
    const service = new SourceSummaryService({ run: async () => { calls += 1; return {}; } });

    await expect(service.summarize(scope, "knowledge-1", [])).rejects.toMatchObject({ code: "SOURCE_SUMMARY_INVALID", status: 400 });
    await expect(service.summarize(scope, "knowledge-1", [{ ...citation(), knowledgeItemId: "other" }])).rejects.toMatchObject({ code: "SOURCE_SUMMARY_INVALID", status: 400 });
    expect(calls).toBe(0);
  });
});
