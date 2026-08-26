import { describe, expect, it } from "vitest";
import { FlashcardService } from "../../src/ai/flashcard-service";

const scope = { memberId: "member-1", role: "contributor" as const };
const sources = [{ citationId: "c-1", knowledgeItemId: "k-1", revisionId: "r-1", chunkId: "ch-1", title: "文档", headingPath: ["方案"], startLine: 1, endLine: 4, body: "方案甲强调低成本。", publishedAt: "2026-01-01T00:00:00.000Z" }];
const ai = (value: unknown) => ({ run: async () => ({ response: JSON.stringify(value) }) });

describe("FlashcardService", () => {
  it("returns cited questions and answers", async () => {
    const result = await new FlashcardService(ai({ cards: [{ question: "方案甲强调什么？", answer: "低成本。", citationIds: ["c-1"] }], insufficientEvidence: false })).generate(scope, "k-1", sources);
    expect(result.cards[0]).toEqual(expect.objectContaining({ question: "方案甲强调什么?", answer: "低成本。" }));
    expect(result.cards[0]?.citations[0]?.citationId).toBe("c-1");
  });
  it("rejects ungrounded answers", async () => {
    await expect(new FlashcardService(ai({ cards: [{ question: "问题", answer: "无依据", citationIds: ["c-9"] }], insufficientEvidence: false })).generate(scope, "k-1", sources)).rejects.toMatchObject({ code: "FLASHCARD_UNGROUNDED", status: 422 });
  });
  it("returns a gap and maps provider failures", async () => {
    const gap = await new FlashcardService(ai({ cards: [], insufficientEvidence: true })).generate(scope, "k-1", sources);
    expect(gap.messageKey).toBe("KNOWLEDGE_EVIDENCE_INSUFFICIENT");
    await expect(new FlashcardService({ run: async () => { throw new Error("upstream"); } }).generate(scope, "k-1", sources)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
});
