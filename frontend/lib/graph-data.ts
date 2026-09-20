import { apiFetch, type Fetcher } from "./api";
import {
  GRAPH_DEFAULT_DEPTH,
  GRAPH_DEFAULT_LIMIT,
  GRAPH_MAX_EDGE_LIMIT,
  GRAPH_MAX_DEPTH,
  GRAPH_MAX_NODE_LIMIT,
  GRAPH_MAX_LIMIT,
  GRAPH_MIN_LIMIT,
} from "../../src/graph/limits";
import {
  GRAPH_EDGE_KINDS,
  GRAPH_NODE_KINDS,
  GRAPH_SCOPES,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphChangeKind,
  type GraphNode,
  type GraphNodeKind,
  type GraphScope,
  type GraphSnapshot,
} from "../../src/graph/types";

export type { GraphEdge, GraphNode, GraphSnapshot };

export interface GraphQueryInput {
  scope?: GraphScope;
  rootId?: string | null;
  depth?: 1 | 2;
  types?: GraphNodeKind[];
  limit?: number;
  cursor?: string | null;
  from?: string;
  to?: string;
  changeKind?: GraphChangeKind;
}

const MEMBER_ID_KEYS = new Set(["memberId", "member_id"]);

export async function loadGraph(
  query: GraphQueryInput = {},
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<GraphSnapshot> {
  const params = encodeGraphQuery(query);
  const value = await apiFetch<unknown>(`/api/graph?${params.toString()}`, { requester, signal });
  return normalizeGraphSnapshot(value);
}

export function normalizeGraphSnapshot(value: unknown): GraphSnapshot {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)
    || !isRootId(value.rootId) || (value.depth !== 1 && value.depth !== 2)
    || typeof value.truncated !== "boolean"
    || value.nodes.length > GRAPH_MAX_NODE_LIMIT
    || value.edges.length > GRAPH_MAX_EDGE_LIMIT) {
    throw invalidResponse();
  }

  const nodes: GraphNode[] = [];
  const nodeIds = new Set<string>();
  for (const candidate of value.nodes) {
    const node = normalizeGraphNode(candidate);
    if (nodeIds.has(node.id)) throw invalidResponse();
    nodeIds.add(node.id);
    nodes.push(node);
  }

  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  for (const candidate of value.edges) {
    const edge = normalizeGraphEdge(candidate);
    if (edgeIds.has(edge.id) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw invalidResponse();
    edgeIds.add(edge.id);
    edges.push(edge);
  }

  if (value.rootId !== null && !nodes.some((node) => node.id === value.rootId || node.id.endsWith(`:${value.rootId}`))) {
    throw invalidResponse();
  }

  return {
    nodes,
    edges,
    rootId: value.rootId,
    depth: value.depth,
    truncated: value.truncated,
  };
}

export function normalizeGraphNode(value: unknown): GraphNode {
  if (!isRecord(value)
    || typeof value.id !== "string" || value.id.length === 0
    || !isGraphNodeKind(value.kind)
    || typeof value.label !== "string"
    || !isNullableString(value.status)
    || !isNullableString(value.href)
    || !isRecord(value.metadata)) {
    throw invalidResponse();
  }

  const metadata: Record<string, string | number | null> = {};
  for (const [key, metadataValue] of Object.entries(value.metadata)) {
    if (MEMBER_ID_KEYS.has(key)) continue;
    if (metadataValue !== null
      && typeof metadataValue !== "string"
      && (typeof metadataValue !== "number" || !Number.isFinite(metadataValue))) {
      throw invalidResponse();
    }
    metadata[key] = metadataValue as string | number | null;
  }

  return {
    id: value.id,
    kind: value.kind,
    label: value.label,
    status: value.status,
    href: value.href,
    metadata,
  };
}

export function normalizeGraphEdge(value: unknown): GraphEdge {
  if (!isRecord(value)
    || typeof value.id !== "string" || value.id.length === 0
    || typeof value.source !== "string" || value.source.length === 0
    || typeof value.target !== "string" || value.target.length === 0
    || !isGraphEdgeKind(value.kind)
    || typeof value.label !== "string"
    || typeof value.weight !== "number" || !Number.isFinite(value.weight)
    || !Array.isArray(value.citationIds)
    || value.citationIds.some((citationId) => typeof citationId !== "string")) {
    throw invalidResponse();
  }

  return {
    id: value.id,
    source: value.source,
    target: value.target,
    kind: value.kind,
    label: value.label,
    weight: value.weight,
    citationIds: [...new Set(value.citationIds as string[])],
  };
}

function encodeGraphQuery(query: GraphQueryInput): URLSearchParams {
  if (!query || typeof query !== "object" || Array.isArray(query)) throw invalidQuery();
  const scope = query.scope ?? "workspace";
  const depth = query.depth ?? GRAPH_DEFAULT_DEPTH;
  const limit = query.limit ?? GRAPH_DEFAULT_LIMIT;
  const types = query.types ?? [];

  if (!isGraphScope(scope) || (query.rootId !== undefined && query.rootId !== null && (!isNonEmptyString(query.rootId)))
    || (depth !== 1 && depth !== 2) || depth > GRAPH_MAX_DEPTH
    || !Number.isSafeInteger(limit) || limit < GRAPH_MIN_LIMIT || limit > GRAPH_MAX_LIMIT
    || !Array.isArray(types) || types.some((type) => !isGraphNodeKind(type)) || new Set(types).size !== types.length
    || (query.cursor !== undefined && query.cursor !== null && !isNonEmptyString(query.cursor))
    || (query.from !== undefined && !isNonEmptyString(query.from))
    || (query.to !== undefined && !isNonEmptyString(query.to))
    || (query.changeKind !== undefined && !["added", "updated", "completed", "archived"].includes(query.changeKind))) {
    throw invalidQuery();
  }

  const params = new URLSearchParams();
  params.set("scope", scope);
  if (query.rootId !== undefined && query.rootId !== null) params.set("rootId", query.rootId);
  params.set("depth", String(depth));
  if (types.length > 0) params.set("types", types.join(","));
  params.set("limit", String(limit));
  if (query.cursor !== undefined && query.cursor !== null) params.set("cursor", query.cursor);
  if (query.from !== undefined) params.set("from", query.from);
  if (query.to !== undefined) params.set("to", query.to);
  if (query.changeKind !== undefined) params.set("changeKind", query.changeKind);
  return params;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRootId(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isGraphScope(value: unknown): value is GraphScope {
  return typeof value === "string" && (GRAPH_SCOPES as readonly string[]).includes(value);
}

function isGraphNodeKind(value: unknown): value is GraphNodeKind {
  return typeof value === "string" && (GRAPH_NODE_KINDS as readonly string[]).includes(value);
}

function isGraphEdgeKind(value: unknown): value is GraphEdgeKind {
  return typeof value === "string" && (GRAPH_EDGE_KINDS as readonly string[]).includes(value);
}

function invalidQuery(): Error {
  return new Error("GRAPH_QUERY_INVALID");
}

function invalidResponse(): Error {
  return new Error("GRAPH_RESPONSE_INVALID");
}
