import { describe, expect, it } from "vitest";
import {
  dispatchGraphAction,
  type GraphActionRequest,
  type GraphActionResult,
} from "../../frontend/lib/graph-actions";
import type { GraphNode } from "../../src/graph/types";

function node(kind: GraphNode["kind"], id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: `${kind}:${id}`,
    kind,
    label: `${kind} label`,
    status: null,
    href: `/${kind}/${id}`,
    metadata: {},
    ...overrides,
  };
}

function requesterFor(
  responses: unknown[] = [{ task: { id: "task-1" }, created: true }],
  calls: Array<{ url: string; init?: RequestInit }> = [],
): typeof fetch {
  let index = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const payload = responses[Math.min(index++, responses.length - 1)];
    return Response.json(payload, { status: 201 });
  }) as unknown as typeof fetch;
}

function request(nodeValue: GraphNode, clientKey = "graph-action-1"): GraphActionRequest {
  return { node: nodeValue, clientKey };
}

describe("graph action dispatcher", () => {
  it("maps a knowledge node to an idempotent task create without member scope input", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await dispatchGraphAction(
      request(node("knowledge", "knowledge-1", { label: "Review launch brief" })),
      requesterFor(undefined, calls),
    );

    expect(result).toMatchObject({ status: "completed", action: "create_task", clientKey: "graph-action-1" });
    expect(calls[0]?.url).toBe("/api/tasks");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ title: "Review launch brief", knowledgeItemId: "knowledge-1" });
    expect(typeof body.id).toBe("string");
    expect(body).not.toHaveProperty("clientKey");
    expect(body).not.toHaveProperty("memberId");
  });

  it("maps a decision node to a project action item with the caller key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await dispatchGraphAction(
      request(node("decision", "decision-1", {
        label: "Choose the launch date",
        href: "/projects/project-1/timeline/decision-1",
      }), "decision-key"),
      requesterFor([{ item: { id: "timeline-1" }, created: true }], calls),
    );

    expect(result).toMatchObject({ status: "completed", action: "create_action_item", clientKey: "decision-key" });
    expect(calls[0]?.url).toBe("/api/projects/project-1/timeline");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      clientKey: "decision-key",
      kind: "action_item",
      title: "Choose the launch date",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).not.toHaveProperty("memberId");
  });

  it("maps a task node to focus start and keeps the key stable for retries", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const taskRequest = request(node("task", "task-1", { label: "Write release notes" }), "focus-key");
    const requester = requesterFor([{ session: { id: "focus-1" }, created: true }], calls);
    const first = await dispatchGraphAction(taskRequest, requester);
    const second = await dispatchGraphAction(taskRequest, requester);

    expect(first).toMatchObject({ status: "completed", action: "start_focus", clientKey: "focus-key" });
    expect(second).toMatchObject({ status: "completed", action: "start_focus", clientKey: "focus-key" });
    expect(calls).toHaveLength(2);
    const firstBody = JSON.parse(String(calls[0]?.init?.body));
    const secondBody = JSON.parse(String(calls[1]?.init?.body));
    expect(firstBody).toEqual(secondBody);
    expect(firstBody).toMatchObject({ clientKey: "focus-key", taskId: "task-1", title: "Write release notes" });
    expect(firstBody).not.toHaveProperty("memberId");
  });

  it("maps a project node to a timeline item", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await dispatchGraphAction(
      { ...request(node("project", "project-1", { label: "Q4 launch" }), "project-key"), timelineKind: "milestone" },
      requesterFor([{ item: { id: "timeline-1" }, created: true }], calls),
    );

    expect(result).toMatchObject({ status: "completed", action: "append_timeline", clientKey: "project-key" });
    expect(calls[0]?.url).toBe("/api/projects/project-1/timeline");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      clientKey: "project-key",
      kind: "milestone",
      title: "Q4 launch",
    });
  });

  it("returns deferred for node kinds without a supported action", async () => {
    let requests = 0;
    const requester = (async () => {
      requests += 1;
      return Response.json({});
    }) as unknown as typeof fetch;

    const result = await dispatchGraphAction(request(node("goal", "goal-1")), requester);

    expect(result).toEqual<GraphActionResult>({
      status: "deferred",
      action: null,
      clientKey: "graph-action-1",
      reason: "unsupported",
    });
    expect(requests).toBe(0);
  });

  it("rejects a blank caller key instead of inventing retry identity", async () => {
    await expect(dispatchGraphAction(request(node("task", "task-1"), "   "))).rejects.toThrow("GRAPH_ACTION_CLIENT_KEY_REQUIRED");
  });
});
