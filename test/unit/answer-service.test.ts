import { describe, expect, it } from "vitest";
import type { SearchHit } from "../../src/knowledge/types";
import { AnswerService, type AnswerAi, type AnswerAiInput } from "../../src/ai/answer-service";

const firstHit: SearchHit = {
  id: "launch-review",
  title: "发布复盘",
  tags: ["项目", "复盘"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  path: "/workspace/notes/launch-review.md",
  excerpt: "需求确认不足，测试窗口被压缩。",
  score: 8,
};

const secondHit: SearchHit = {
  ...firstHit,
  id: "learning-plan",
  title: "学习计划",
  path: "/workspace/notes/learning-plan.md",
  excerpt: "每周五回顾知识库中尚未形成链接的笔记。",
};

class FakeAi implements AnswerAi {
  readonly calls: Array<{ model: string; input: AnswerAiInput }> = [];
  result: unknown = "基于资料的回答";
  error: unknown;

  async run(model: string, input: AnswerAiInput): Promise<unknown> {
    this.calls.push({ model, input });
    if (this.error) throw this.error;
    return this.result;
  }
}

describe("AnswerService.answer", () => {
  it("does not call AI without sources", async () => {
    const ai = new FakeAi();
    const service = new AnswerService(ai);

    const result = await service.answer("问题", []);

    expect(result).toEqual({
      answer: "知识库中没有足够依据回答这个问题。请先添加相关笔记。",
      sources: [],
    });
    expect(ai.calls).toHaveLength(0);
  });

  it("numbers sources and bounds excerpts in the model context", async () => {
    const ai = new FakeAi();
    const service = new AnswerService(ai);
    const oversizedSources = Array.from({ length: 10 }, (_, index) => ({
      ...secondHit,
      id: `source-${index + 2}`,
      title: `资料 ${index + 2}`,
      excerpt: "x".repeat(2_000),
    }));

    await service.answer("共同问题是什么？", [firstHit, ...oversizedSources]);

    const call = ai.calls[0];
    const context = call.input.messages[1].content.split("资料：\n")[1];
    expect(call.model).toBe("@cf/meta/llama-3.1-8b-instruct-fp8-fast");
    expect(call.input.max_tokens).toBe(700);
    expect(context).toContain("[1] 发布复盘");
    expect(context).toContain("[2] 资料 2");
    expect(context).not.toContain("x".repeat(1_201));
    expect(context.length).toBeLessThanOrEqual(8_000);
  });

  it("normalizes a string result", async () => {
    const ai = new FakeAi();
    ai.result = "  根据 [1] 的回答  ";
    const service = new AnswerService(ai);

    await expect(service.answer("问题", [firstHit])).resolves.toMatchObject({
      answer: "根据 [1] 的回答",
      sources: [firstHit],
    });
  });

  it("normalizes a response object result", async () => {
    const ai = new FakeAi();
    ai.result = { response: "根据 [1] 的回答" };
    const service = new AnswerService(ai);

    await expect(service.answer("问题", [firstHit])).resolves.toMatchObject({
      answer: "根据 [1] 的回答",
    });
  });

  it.each(["", "   ", {}, { response: "" }])("uses a fallback for an empty AI result", async (result) => {
    const ai = new FakeAi();
    ai.result = result;
    const service = new AnswerService(ai);

    await expect(service.answer("问题", [firstHit])).resolves.toMatchObject({
      answer: "模型没有返回文本。",
    });
  });

  it("rejects blank and oversized questions before calling AI", async () => {
    const ai = new FakeAi();
    const service = new AnswerService(ai);

    await expect(service.answer(" ", [firstHit])).rejects.toMatchObject({ code: "QUESTION_INVALID", status: 400 });
    await expect(service.answer("x".repeat(4_001), [firstHit])).rejects.toMatchObject({ code: "QUESTION_TOO_LONG", status: 413 });
    expect(ai.calls).toHaveLength(0);
  });

  it("maps Workers AI failures to a retryable stable error", async () => {
    const ai = new FakeAi();
    ai.error = new Error("upstream details must not escape");
    const service = new AnswerService(ai);

    await expect(service.answer("问题", [firstHit])).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      status: 503,
      retryable: true,
    });
  });
});
