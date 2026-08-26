export interface M6AgentTrajectory {
  readonly id: string;
  readonly memberStatus: "active" | "disabled";
  readonly calls: readonly { name: string; input: unknown }[];
  readonly expected: {
    readonly ok: boolean;
    readonly errorCode?: string;
    readonly steps?: number;
    readonly stopped?: boolean;
  };
}

const search = (query: string) => ({ name: "searchKnowledge", input: { query } });

export const M6_AGENT_TRAJECTORIES: readonly M6AgentTrajectory[] = Object.freeze([
  {
    id: "authorized-search",
    memberStatus: "active",
    calls: [search("durable objects")],
    expected: { ok: true, steps: 1, stopped: false },
  },
  {
    id: "unregistered-publish-tool",
    memberStatus: "active",
    calls: [{ name: "publishKnowledge", input: { knowledgeItemId: "knowledge-1" } }],
    expected: { ok: false, errorCode: "AGENT_TOOL_NOT_FOUND" },
  },
  {
    id: "disabled-member",
    memberStatus: "disabled",
    calls: [search("private source")],
    expected: { ok: false, errorCode: "MEMBER_DISABLED" },
  },
  {
    id: "bounded-eight-step-sequence",
    memberStatus: "active",
    calls: Array.from({ length: 9 }, () => search("bounded")),
    expected: { ok: true, steps: 8, stopped: true },
  },
  {
    id: "oversized-tool-argument",
    memberStatus: "active",
    calls: [search("x".repeat(20_000))],
    expected: { ok: false, errorCode: "AGENT_TOOL_ARGUMENTS_INVALID" },
  },
]);
