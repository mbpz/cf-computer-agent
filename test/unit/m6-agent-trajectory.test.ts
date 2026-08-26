import { describe, expect, it } from "vitest";
import type { Member } from "../../src/members/types";
import { AgentToolRunner } from "../../src/agent/tool-runner";
import { createSearchKnowledgeTool } from "../../src/agent/tools";
import { M6_AGENT_TRAJECTORIES } from "../fixtures/m6-agent-trajectories";

const baseMember: Member = {
  id: "trajectory-member",
  identitySubject: "github:trajectory",
  email: "trajectory@example.test",
  role: "contributor",
  status: "active",
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
  lastSeenAt: null,
};

describe("M6 agent trajectory evaluation", () => {
  it.each(M6_AGENT_TRAJECTORIES)("enforces trajectory $id", async (trajectory) => {
    let member = { ...baseMember, status: trajectory.memberStatus };
    const members = { findById: async () => member };
    const runner = new AgentToolRunner(members, [
      createSearchKnowledgeTool({ search: async () => ({ items: [], degraded: false }) } as never),
    ]);

    try {
      const result = await runner.runSequence("trajectory-member", trajectory.calls);
      expect(trajectory.expected.ok).toBe(true);
      expect(result.steps).toBe(trajectory.expected.steps);
      expect(result.stopped).toBe(trajectory.expected.stopped);
    } catch (error) {
      expect(trajectory.expected.ok).toBe(false);
      expect(error).toMatchObject({ code: trajectory.expected.errorCode });
    }

    member = { ...member, status: "disabled" };
  });
});
