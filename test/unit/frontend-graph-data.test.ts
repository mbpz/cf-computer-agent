import { describe, expect, it, vi } from "vitest";
import { type Fetcher } from "../../frontend/lib/api";
import {
  loadGraph,
  normalizeGraphSnapshot,
  type GraphQueryInput,
} from "../../frontend/lib/graph-data";

const node = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  kind: "task",
  label: `Task ${id}`,
  status: null,
  href: null,
  metadata: {},
  ...overrides,
});

const edge = (id: string, source: string, target: string, overrides: Record<string, unknown> = {}) => ({
  id,
  source,
  target,
  kind: "depends_on",
  label: "Depends on",
  weight: 1,
  citationIds: [],
  ...overrides,
});

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  nodes: [node("task:t1"), node("project:p1", { kind: "project" })],
  edges: [edge("edge:1", "task:t1", "project:p1")],
  rootId: null,
  depth: 1,
  truncated: false,
  ...overrides,
});

function requesterReturning(body: unknown) {
  return vi.fn<Fetcher>(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
}

describe("frontend graph data client", () => {
  it("encodes bounded graph query values and never sends memberId", async () => {
    const requester = requesterReturning(snapshot());

    await loadGraph({
      scope: "knowledge",
      rootId: "task/a?x",
      depth: 2,
      types: ["task", "project"],
      limit: 25,
      cursor: "opaque+/=",
      memberId: "should-not-be-accepted",
    } as GraphQueryInput & { memberId: string }, requester);

    expect(requester).toHaveBeenCalledOnce();
    const [input] = requester.mock.calls[0]!;
    expect(String(input)).toBe("/api/graph?scope=knowledge&rootId=task%2Fa%3Fx&depth=2&types=task%2Cproject&limit=25&cursor=opaque%2B%2F%3D");
    expect(String(input)).not.toContain("memberId");
  });

  it("forwards the AbortSignal to the requester", async () => {
    const requester = requesterReturning(snapshot());
    const controller = new AbortController();

    await loadGraph({}, requester, controller.signal);

    expect(requester).toHaveBeenCalledWith("/api/graph?scope=workspace&depth=1&limit=50", {
      credentials: "same-origin",
      signal: controller.signal,
    });
  });

  it("encodes temporal range and change kind without accepting member scope", async () => {
    const requester = requesterReturning(snapshot());
    await loadGraph({ from: "2026-09-13T00:00:00.000Z", to: "2026-09-20T00:00:00.000Z", changeKind: "completed" }, requester);
    const [input] = requester.mock.calls[0]!;
    expect(String(input)).toContain("from=2026-09-13T00%3A00%3A00.000Z");
    expect(String(input)).toContain("to=2026-09-20T00%3A00%3A00.000Z");
    expect(String(input)).toContain("changeKind=completed");
    expect(String(input)).not.toContain("memberId");
  });

  it("strictly normalizes valid response fields and preserves root, depth, and truncation", async () => {
    const requester = requesterReturning(snapshot({
      nodes: [node("task:t1", { metadata: { priority: 2, memberId: "private" }, extra: "ignored" })],
      edges: [edge("edge:1", "task:t1", "task:t1", { citationIds: ["c1", "c1"], extra: "ignored" })],
      rootId: "task:t1",
      depth: 2,
      truncated: true,
      extra: "ignored",
    }));

    await expect(loadGraph({}, requester)).resolves.toEqual({
      nodes: [{
        id: "task:t1",
        kind: "task",
        label: "Task task:t1",
        status: null,
        href: null,
        metadata: { priority: 2 },
      }],
      edges: [{
        id: "edge:1",
        source: "task:t1",
        target: "task:t1",
        kind: "depends_on",
        label: "Depends on",
        weight: 1,
        citationIds: ["c1"],
      }],
      rootId: "task:t1",
      depth: 2,
      truncated: true,
    });
  });

  it.each([
    ["missing endpoint", snapshot({ edges: [edge("edge:1", "task:t1", "missing")] })],
    ["duplicate node", snapshot({ nodes: [node("task:t1"), node("task:t1")] })],
    ["duplicate edge", snapshot({ edges: [edge("edge:1", "task:t1", "project:p1"), edge("edge:1", "task:t1", "project:p1")] })],
    ["unknown node kind", snapshot({ nodes: [node("task:t1", { kind: "unknown" })] })],
    ["unknown edge kind", snapshot({ edges: [edge("edge:1", "task:t1", "project:p1", { kind: "unknown" })] })],
    ["malformed node", snapshot({ nodes: [node("task:t1", { metadata: { bad: [] } })] })],
    ["malformed edge", snapshot({ edges: [edge("edge:1", "task:t1", "project:p1", { weight: Number.NaN })] })],
    ["malformed snapshot fields", snapshot({ rootId: 42, depth: 3, truncated: "no" })],
    ["root without endpoint", snapshot({ rootId: "missing" })],
  ])("rejects %s as GRAPH_RESPONSE_INVALID", async (_name, body) => {
    await expect(loadGraph({}, requesterReturning(body))).rejects.toThrow("GRAPH_RESPONSE_INVALID");
  });

  it("exports a strict snapshot normalizer that rejects missing top-level arrays", () => {
    expect(() => normalizeGraphSnapshot({ nodes: [], rootId: null, depth: 1, truncated: false })).toThrow("GRAPH_RESPONSE_INVALID");
  });

  it.each([" ", "\t"])('rejects blank graph query value "%s"', async (value) => {
    await expect(loadGraph({ rootId: value }, requesterReturning(snapshot()))).rejects.toThrow("GRAPH_QUERY_INVALID");
    await expect(loadGraph({ cursor: value }, requesterReturning(snapshot()))).rejects.toThrow("GRAPH_QUERY_INVALID");
  });
});
