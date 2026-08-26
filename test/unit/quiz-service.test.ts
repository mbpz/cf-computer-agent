import { describe, expect, it } from "vitest";
import { QuizService } from "../../src/ai/quiz-service";

const scope = { memberId: "member-1", role: "contributor" as const };
const sources = [{ citationId: "c-1", knowledgeItemId: "k-1", revisionId: "r-1", chunkId: "ch-1", title: "文档", headingPath: ["方案"], startLine: 1, endLine: 4, body: "方案甲强调低成本。", publishedAt: "2026-01-01T00:00:00.000Z" }];
const ai = (value: unknown) => ({ run: async () => ({ response: JSON.stringify(value) }) });

describe("QuizService", () => {
  it("returns a cited answer/explanation and a skippable question", async () => {
    const result = await new QuizService(ai({ questions: [
      { id: "q-1", prompt: "方案甲强调什么？", options: ["成本", "颜色"], answerIndex: 0, explanation: "文档明确强调低成本。", citationIds: ["c-1"] },
      { id: "q-2", prompt: "可跳过的问题", options: ["A", "B"], answerIndex: null, explanation: "", citationIds: ["c-1"] },
    ], insufficientEvidence: false })).generate(scope, "k-1", sources);
    expect(result.questions[0]?.answerIndex).toBe(0);
    expect(result.questions[0]?.explanationCitations[0]?.citationId).toBe("c-1");
    expect(result.questions[1]?.answerIndex).toBeNull();
  });
  it("rejects an answer with an unselected citation", async () => {
    await expect(new QuizService(ai({ questions: [{ id: "q-1", prompt: "问题", options: ["A", "B"], answerIndex: 0, explanation: "无依据", citationIds: ["c-9"] }], insufficientEvidence: false })).generate(scope, "k-1", sources)).rejects.toMatchObject({ code: "QUIZ_UNGROUNDED", status: 422 });
  });
  it("returns a gap and maps provider failures", async () => {
    const gap = await new QuizService(ai({ questions: [], insufficientEvidence: true })).generate(scope, "k-1", sources);
    expect(gap.messageKey).toBe("KNOWLEDGE_EVIDENCE_INSUFFICIENT");
    await expect(new QuizService({ run: async () => { throw new Error("upstream"); } }).generate(scope, "k-1", sources)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
});
