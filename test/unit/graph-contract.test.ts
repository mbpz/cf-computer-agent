import { describe, expect, it } from "vitest";
import {
  GRAPH_DEFAULT_DEPTH,
  GRAPH_DEFAULT_LIMIT,
  GRAPH_MAX_DEPTH,
  GRAPH_MAX_EDGE_LIMIT,
  GRAPH_MAX_NODE_LIMIT,
  GRAPH_MIN_LIMIT,
} from "../../src/graph/limits";
import {
  normalizeGraphSnapshot,
  parseGraphQuery,
  type GraphEdge,
  type GraphNode,
  type GraphQuery,
} from "../../src/graph/types";

const node = (id: string, overrides: Partial<GraphNode> = {}): GraphNode => ({
  id,
  kind: "knowledge",
  label: `Node ${id}`,
  status: null,
  href: null,
  metadata: {},
  ...overrides,
});

const edge = (id: string, source: string, target: string, overrides: Partial<GraphEdge> = {}): GraphEdge => ({
  id,
  source,
  target,
  kind: "related",
  label: "Related",
  weight: 1,
  citationIds: [],
  ...overrides,
});

const query: GraphQuery = {
  scope: "workspace",
  rootId: null,
  depth: 2,
  types: [],
  limit: GRAPH_MAX_NODE_LIMIT,
  cursor: null,
};

describe("personal work graph contract", () => {
  it("parses defaults and accepts the bounded query contract", () => {
    expect(parseGraphQuery(new URLSearchParams())).toEqual({
      scope: "workspace",
      rootId: null,
      depth: GRAPH_DEFAULT_DEPTH,
      types: [],
      limit: GRAPH_DEFAULT_LIMIT,
      cursor: null,
    });
    expect(parseGraphQuery(new URLSearchParams("scope=knowledge&rootId=k-1&depth=2&types=knowledge,task&limit=100&cursor=next"))).toEqual({
      scope: "knowledge",
      rootId: "k-1",
      depth: 2,
      types: ["knowledge", "task"],
      limit: 100,
      cursor: "next",
    });
  });

  it("rejects depth above two and limits nodes/edges", () => {
    expect(() => parseGraphQuery(new URLSearchParams("depth=3"))).toThrow("GRAPH_QUERY_INVALID");
    const nodes = Array.from({ length: GRAPH_MAX_NODE_LIMIT + 1 }, (_, index) => node(`n-${index}`));
    const edges = Array.from({ length: GRAPH_MAX_EDGE_LIMIT + 1 }, (_, index) => edge(`e-${index}`, "n-0", "n-1"));
    expect(normalizeGraphSnapshot(nodes, edges, query).truncated).toBe(true);
    expect(normalizeGraphSnapshot(nodes, edges, query).nodes).toHaveLength(GRAPH_MAX_NODE_LIMIT);
    expect(normalizeGraphSnapshot(nodes, edges, query).edges).toHaveLength(GRAPH_MAX_EDGE_LIMIT);
  });

  it("rejects invalid scope, types, duplicate parameters, and limit boundaries", () => {
    expect(() => parseGraphQuery(new URLSearchParams("scope=other"))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams("types=knowledge,other"))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams("types=knowledge&types=task"))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams("limit=0"))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams(`limit=${GRAPH_MAX_NODE_LIMIT + 1}`))).toThrow("GRAPH_QUERY_INVALID");
    expect(parseGraphQuery(new URLSearchParams(`limit=${GRAPH_MIN_LIMIT}`)).limit).toBe(GRAPH_MIN_LIMIT);
    expect(parseGraphQuery(new URLSearchParams(`limit=${GRAPH_MAX_NODE_LIMIT}`)).limit).toBe(GRAPH_MAX_NODE_LIMIT);
  });

  it("rejects unknown query fields and invalid root or cursor values", () => {
    expect(() => parseGraphQuery(new URLSearchParams("unexpected=value"))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams("rootId="))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams("cursor="))).toThrow("GRAPH_QUERY_INVALID");
  });

  it("parses bounded temporal ranges and change kinds", () => {
    expect(parseGraphQuery(new URLSearchParams("from=2026-09-13T00:00:00.000Z&to=2026-09-20T00:00:00.000Z&changeKind=completed"))).toMatchObject({
      from: "2026-09-13T00:00:00.000Z",
      to: "2026-09-20T00:00:00.000Z",
      changeKind: "completed",
    });
    expect(() => parseGraphQuery(new URLSearchParams("from=2026-09-20T00:00:00.000Z&to=2026-09-13T00:00:00.000Z"))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams("from=2026-01-01T00:00:00.000Z&to=2026-09-20T00:00:00.000Z"))).toThrow("GRAPH_QUERY_INVALID");
    expect(() => parseGraphQuery(new URLSearchParams("changeKind=unknown"))).toThrow("GRAPH_QUERY_INVALID");
  });

  it("sorts IDs stably, deduplicates nodes, filters invalid endpoints, and drops unknown fields", () => {
    const rawNodes = [
      { ...node("b"), extra: "ignored" },
      node("a", { label: "first a", metadata: { memberId: "member-a", visible: "yes" } }),
      node("b", { label: "duplicate b" }),
      { ...node("x"), kind: "unknown" },
    ] as unknown as GraphNode[];
    const rawEdges = [
      { ...edge("e-2", "b", "a"), extra: true },
      edge("e-1", "a", "b"),
      edge("e-hidden", "a", "missing"),
      { ...edge("e-invalid", "a", "b"), kind: "unknown" },
    ] as unknown as GraphEdge[];

    const result = normalizeGraphSnapshot(rawNodes, rawEdges, { ...query, limit: 10 });
    expect(result.nodes.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(result.nodes.find(({ id }) => id === "b")).toMatchObject({ label: "Node b" });
    expect(result.nodes.find(({ id }) => id === "a")?.metadata).toEqual({ visible: "yes" });
    expect(result.edges.map(({ id }) => id)).toEqual(["e-1", "e-2"]);
    expect(result.edges.every(({ source, target }) => ["a", "b"].includes(source) && ["a", "b"].includes(target))).toBe(true);
    expect(result).not.toHaveProperty("extra");
    expect(result.nodes[0]).not.toHaveProperty("extra");
    expect(result.edges[0]).not.toHaveProperty("extra");
  });

  it("preserves query root and depth while reporting truncation only after valid projection", () => {
    const result = normalizeGraphSnapshot(
      [node("root"), node("leaf")],
      [edge("valid", "root", "leaf"), edge("invalid", "root", "gone")],
      { ...query, rootId: "root", depth: 1, limit: 1 },
    );
    expect(result.rootId).toBe("root");
    expect(result.depth).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe("root");
    expect(result.edges).toHaveLength(0);
  });
});
