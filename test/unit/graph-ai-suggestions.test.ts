import { describe, expect, it } from "vitest";
import { GraphSuggestionService } from "../../src/graph/ai-suggestions";
import type { GraphSnapshot } from "../../src/graph/types";

const snapshot: GraphSnapshot = {
  rootId: null,
  depth: 2,
  truncated: false,
  nodes: [
    { id: "meeting:m-1", kind: "meeting", label: "产品评审", status: "done", href: null, metadata: {} },
    { id: "decision:d-1", kind: "decision", label: "采用边缘部署", status: "done", href: null, metadata: {} },
    { id: "action_item:a-1", kind: "action_item", label: "准备迁移清单", status: "todo", href: null, metadata: {} },
    { id: "task:t-1", kind: "task", label: "复核安全策略", status: "todo", href: null, metadata: {} },
    { id: "knowledge:k-1", kind: "knowledge", label: "安全策略", status: "active", href: null, metadata: {} },
  ],
  edges: [
    { id: "e-1", source: "meeting:m-1", target: "decision:d-1", kind: "decided_in", label: "形成决策", weight: 1, citationIds: ["cite-1"] },
    { id: "e-2", source: "decision:d-1", target: "action_item:a-1", kind: "creates", label: "产生行动项", weight: 1, citationIds: ["cite-2"] },
    { id: "e-3", source: "task:t-1", target: "knowledge:k-1", kind: "references", label: "引用知识", weight: 1, citationIds: ["cite-3"] },
  ],
};

const ai = (value: unknown) => ({ run: async () => ({ response: JSON.stringify(value) }) });

describe("GraphSuggestionService", () => {
  it("returns typed meeting, decision and task suggestions with promotion guard", async () => {
    const result = await new GraphSuggestionService(ai({ suggestions: [
      { id: "s-1", kind: "meeting_to_decision", title: "补充决策记录", rationale: "会议已经形成决策，但需要补充归档说明。", sourceNodeIds: ["meeting:m-1"], targetNodeIds: ["decision:d-1"], citationIds: ["cite-1"], evidenceGap: false },
      { id: "s-2", kind: "decision_to_action_item", title: "跟进行动项", rationale: "该决策已有行动项，可继续追踪。", sourceNodeIds: ["decision:d-1"], targetNodeIds: ["action_item:a-1"], citationIds: ["cite-2"], evidenceGap: false },
      { id: "s-3", kind: "task_to_knowledge", title: "关联知识", rationale: "任务引用了相关知识，可建立工作链接。", sourceNodeIds: ["task:t-1"], targetNodeIds: ["knowledge:k-1"], citationIds: ["cite-3"], evidenceGap: false },
    ], insufficientEvidence: false })).suggest(snapshot);

    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0]).toEqual(expect.objectContaining({ kind: "meeting_to_decision", promotionRequired: true, evidenceGap: false, citationIds: ["cite-1"] }));
  });

  it("marks citationless suggestions as an evidence gap and rejects unknown citations", async () => {
    const result = await new GraphSuggestionService(ai({ suggestions: [
      { id: "gap-1", kind: "task_to_knowledge", title: "补充关联", rationale: "关系存在，但当前没有可用引用。", sourceNodeIds: ["task:t-1"], targetNodeIds: ["knowledge:k-1"], citationIds: [], evidenceGap: true },
    ], insufficientEvidence: false })).suggest(snapshot);
    expect(result.suggestions[0]).toEqual(expect.objectContaining({ evidenceGap: true, citationIds: [], promotionRequired: true }));

    await expect(new GraphSuggestionService(ai({ suggestions: [
      { id: "bad", kind: "task_to_knowledge", title: "越权引用", rationale: "该建议使用了未授权的引用。", sourceNodeIds: ["task:t-1"], targetNodeIds: ["knowledge:k-1"], citationIds: ["not-authorized"], evidenceGap: false },
    ], insufficientEvidence: false })).suggest(snapshot)).rejects.toMatchObject({ code: "GRAPH_SUGGESTIONS_UNGROUNDED", status: 422 });
  });

  it("maps malformed and unavailable AI responses to retryable AI_UNAVAILABLE", async () => {
    await expect(new GraphSuggestionService(ai({ malformed: true })).suggest(snapshot)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
    await expect(new GraphSuggestionService({ run: async () => { throw new Error("upstream"); } }).suggest(snapshot)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
});
