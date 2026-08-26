import { describe, expect, it, vi } from "vitest";
import type { Member } from "../../src/members/types";
import { AgentToolRunner, type AgentToolDefinition } from "../../src/agent/tool-runner";
import { createReadSourceTool, createSearchKnowledgeTool } from "../../src/agent/tools";

const activeMember: Member = {
  id: "member-agent",
  identitySubject: "github:700",
  email: "agent@example.test",
  role: "contributor",
  status: "active",
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
  lastSeenAt: null,
};

function repository(initial: Member = activeMember) {
  let current = initial;
  return {
    findById: vi.fn(async (id: string) => current.id === id ? current : null),
    setStatus(status: Member["status"]) { current = { ...current, status }; },
  };
}

const echoTool: AgentToolDefinition<{ text: string }, { echoed: string }> = {
  name: "echo",
  parse(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof (input as Record<string, unknown>).text !== "string") {
      throw new Error("invalid args");
    }
    return { text: (input as { text: string }).text };
  },
  execute: async ({ member }, args) => ({ echoed: `${member.id}:${args.text}` }),
};

describe("AgentToolRunner", () => {
  it("reloads the member before every tool call", async () => {
    const members = repository();
    const runner = new AgentToolRunner(members, [echoTool]);

    await expect(runner.run("member-agent", "echo", { text: "one" })).resolves.toEqual({ echoed: "member-agent:one" });
    members.setStatus("disabled");
    await expect(runner.run("member-agent", "echo", { text: "two" }))
      .rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
    expect(members.findById).toHaveBeenCalledTimes(2);
  });

  it("does not invoke a tool for a missing member or unknown tool", async () => {
    const members = repository();
    const execute = vi.fn(echoTool.execute);
    const runner = new AgentToolRunner(members, [{ ...echoTool, execute }]);

    await expect(runner.run("missing-member", "echo", { text: "x" }))
      .rejects.toMatchObject({ code: "MEMBER_NOT_FOUND", status: 404 });
    await expect(runner.run("member-agent", "unknown", {}))
      .rejects.toMatchObject({ code: "AGENT_TOOL_NOT_FOUND", status: 404 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("bounds searchKnowledge and derives the library scope from the reloaded member", async () => {
    const members = repository();
    const search = vi.fn(async () => ({ items: [{ citationId: "citation-1" }], degraded: false, nextCursor: "never-expose" }));
    const tool = createSearchKnowledgeTool({ search } as never);
    const runner = new AgentToolRunner(members, [tool]);

    await expect(runner.run("member-agent", "searchKnowledge", {
      query: "  durable objects  ", spaceId: "space-1",
    })).resolves.toEqual({ items: [{ citationId: "citation-1" }], degraded: false });
    expect(search).toHaveBeenCalledWith(
      { memberId: "member-agent", role: "contributor" },
      { query: "  durable objects  ", spaceId: "space-1", limit: 8 },
    );
    await expect(runner.run("member-agent", "searchKnowledge", { query: "x", extra: true }))
      .rejects.toMatchObject({ code: "AGENT_TOOL_ARGUMENTS_INVALID", status: 400 });
  });

  it("reads a stable source revision through the authorization-scoped library", async () => {
    const members = repository();
    const revision = {
      id: "revision-1",
      knowledgeItemId: "knowledge-1",
      sourceVersionId: "source-version-1",
      title: "Source",
      markdown: "# Source",
      chunks: [{ id: "chunk-1", citationId: "citation-1", ordinal: 0, headingPath: ["Source"], startLine: 1, endLine: 1, location: { kind: "pdf", page: 3 } }],
    };
    const read = vi.fn(async () => revision);
    const runner = new AgentToolRunner(members, [createReadSourceTool({ revision: read } as never)]);

    await expect(runner.run("member-agent", "readSource", { knowledgeItemId: "knowledge-1", revisionId: "revision-1" }))
      .resolves.toEqual(revision);
    expect(read).toHaveBeenCalledWith(
      { memberId: "member-agent", role: "contributor" },
      "knowledge-1",
      "revision-1",
    );
    await expect(runner.run("member-agent", "readSource", { knowledgeItemId: "knowledge-1" }))
      .rejects.toMatchObject({ code: "AGENT_TOOL_ARGUMENTS_INVALID", status: 400 });
  });
});
