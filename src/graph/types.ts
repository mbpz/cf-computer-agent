import { AppError } from "../http";
import {
  GRAPH_DEFAULT_DEPTH,
  GRAPH_DEFAULT_LIMIT,
  GRAPH_MAX_DEPTH,
  GRAPH_MAX_EDGE_LIMIT,
  GRAPH_MAX_LIMIT,
  GRAPH_MAX_NODE_LIMIT,
  GRAPH_MIN_LIMIT,
} from "./limits";

export const GRAPH_SCOPES = ["knowledge", "project", "workspace"] as const;
export type GraphScope = typeof GRAPH_SCOPES[number];

export const GRAPH_NODE_KINDS = [
  "knowledge", "task", "project", "goal", "meeting", "decision", "action_item", "inbox", "calendar", "focus",
] as const;
export type GraphNodeKind = typeof GRAPH_NODE_KINDS[number];

export const GRAPH_EDGE_KINDS = [
  "related", "backlink", "references", "belongs_to", "depends_on", "blocks", "decided_in", "creates", "scheduled_for", "reviewed_in", "derived",
] as const;
export type GraphEdgeKind = typeof GRAPH_EDGE_KINDS[number];

export const GRAPH_CHANGE_KINDS = ["added", "updated", "completed", "archived"] as const;
export type GraphChangeKind = typeof GRAPH_CHANGE_KINDS[number];
export const GRAPH_MAX_TEMPORAL_DAYS = 90;

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  status: string | null;
  href: string | null;
  metadata: Record<string, string | number | null>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label: string;
  weight: number;
  citationIds: string[];
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootId: string | null;
  depth: 1 | 2;
  truncated: boolean;
}

export interface GraphQuery {
  scope: GraphScope;
  rootId: string | null;
  depth: 1 | 2;
  types: GraphNodeKind[];
  limit: number;
  cursor?: string | null;
  from?: string;
  to?: string;
  changeKind?: GraphChangeKind;
}

const QUERY_KEYS = new Set(["scope", "rootId", "depth", "types", "limit", "cursor", "from", "to", "changeKind"]);
const MEMBER_ID_KEYS = new Set(["memberId", "member_id"]);

export function parseGraphQuery(input: URLSearchParams): GraphQuery {
  for (const key of input.keys()) {
    if (!QUERY_KEYS.has(key) || input.getAll(key).length !== 1) throw invalidQuery();
  }

  const scopeValue = input.get("scope");
  const scope = scopeValue === null ? "workspace" : parseEnum(scopeValue, GRAPH_SCOPES, "scope");
  const rootRaw = input.get("rootId");
  const rootId = rootRaw === null ? null : nonEmpty(rootRaw, "rootId");

  const depth = parseInteger(input.get("depth"), GRAPH_DEFAULT_DEPTH, 1, GRAPH_MAX_DEPTH) as 1 | 2;
  const limit = parseInteger(input.get("limit"), GRAPH_DEFAULT_LIMIT, GRAPH_MIN_LIMIT, GRAPH_MAX_LIMIT);
  const types = parseTypes(input.get("types"));
  const cursorRaw = input.get("cursor");
  const cursor = cursorRaw === null ? null : nonEmpty(cursorRaw, "cursor");

  const fromRaw = input.get("from");
  const toRaw = input.get("to");
  const from = fromRaw === null ? undefined : parseTimestamp(fromRaw);
  const to = toRaw === null ? undefined : parseTimestamp(toRaw);
  if (from && to && Date.parse(to) < Date.parse(from)) throw invalidQuery();
  if (from && to && Date.parse(to) - Date.parse(from) > GRAPH_MAX_TEMPORAL_DAYS * 86_400_000) throw invalidQuery();
  const changeKindRaw = input.get("changeKind");
  const changeKind = changeKindRaw === null ? undefined : parseEnum(changeKindRaw, GRAPH_CHANGE_KINDS, "changeKind");

  return { scope, rootId, depth, types, limit, cursor, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(changeKind ? { changeKind } : {}) };
}

function parseTimestamp(value: string): string {
  if (!value.trim()) throw invalidQuery();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw invalidQuery();
  return new Date(parsed).toISOString();
}

export function normalizeGraphSnapshot(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  query: GraphQuery,
): GraphSnapshot {
  assertQuery(query);

  const uniqueNodes = new Map<string, GraphNode>();
  for (const candidate of nodes) {
    const normalized = normalizeNode(candidate);
    if (normalized && !uniqueNodes.has(normalized.id)) uniqueNodes.set(normalized.id, normalized);
  }
  const sortedNodes = [...uniqueNodes.values()].sort(byId);
  const nodeLimit = query.limit;
  const nodesTruncated = sortedNodes.length > nodeLimit;
  const rootId = query.rootId;
  const rootNode = rootId === null
    ? undefined
    : sortedNodes.find((node) => graphNodeMatchesRoot(node.id, rootId));
  const visibleNodes = rootNode === undefined
    ? sortedNodes.slice(0, nodeLimit)
    : [rootNode, ...sortedNodes.filter((node) => node.id !== rootNode.id).slice(0, nodeLimit - 1)];
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

  const uniqueEdges = new Map<string, GraphEdge>();
  for (const candidate of edges) {
    const normalized = normalizeEdge(candidate);
    if (!normalized || !uniqueNodes.has(normalized.source) || !uniqueNodes.has(normalized.target)) continue;
    if (!uniqueEdges.has(normalized.id)) uniqueEdges.set(normalized.id, normalized);
  }
  const sortedEdges = [...uniqueEdges.values()]
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .sort(byId);
  const edgeLimit = Math.min(query.limit * 2, GRAPH_MAX_EDGE_LIMIT);
  const edgesTruncated = sortedEdges.length > edgeLimit;

  return {
    nodes: visibleNodes,
    edges: sortedEdges.slice(0, edgeLimit),
    rootId: query.rootId,
    depth: query.depth,
    truncated: nodesTruncated || edgesTruncated,
  };
}

export function graphNodeMatchesRoot(nodeId: string, rootId: string): boolean {
  return nodeId === rootId || nodeId.endsWith(`:${rootId}`);
}

function normalizeNode(candidate: GraphNode): GraphNode | null {
  if (!candidate || typeof candidate !== "object"
    || typeof candidate.id !== "string" || !candidate.id
    || !isMemberOf(candidate.kind, GRAPH_NODE_KINDS)
    || typeof candidate.label !== "string"
    || (candidate.status !== null && typeof candidate.status !== "string")
    || (candidate.href !== null && typeof candidate.href !== "string")
    || !candidate.metadata || typeof candidate.metadata !== "object" || Array.isArray(candidate.metadata)) return null;

  const metadata: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(candidate.metadata)) {
    if (MEMBER_ID_KEYS.has(key)) continue;
    if ((typeof value === "string" || value === null) || (typeof value === "number" && Number.isFinite(value))) metadata[key] = value;
  }
  return {
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    status: candidate.status,
    href: candidate.href,
    metadata,
  };
}

function normalizeEdge(candidate: GraphEdge): GraphEdge | null {
  if (!candidate || typeof candidate !== "object"
    || typeof candidate.id !== "string" || !candidate.id
    || typeof candidate.source !== "string" || !candidate.source
    || typeof candidate.target !== "string" || !candidate.target
    || !isMemberOf(candidate.kind, GRAPH_EDGE_KINDS)
    || typeof candidate.label !== "string"
    || typeof candidate.weight !== "number" || !Number.isFinite(candidate.weight)
    || !Array.isArray(candidate.citationIds)
    || candidate.citationIds.some((citationId) => typeof citationId !== "string")) return null;
  return {
    id: candidate.id,
    source: candidate.source,
    target: candidate.target,
    kind: candidate.kind,
    label: candidate.label,
    weight: candidate.weight,
    citationIds: [...new Set(candidate.citationIds)],
  };
}

function parseTypes(raw: string | null): GraphNodeKind[] {
  if (raw === null) return [];
  if (!raw) throw invalidQuery();
  const values = raw.split(",");
  if (values.some((value) => !value) || new Set(values).size !== values.length) throw invalidQuery();
  return values.map((value) => parseEnum(value, GRAPH_NODE_KINDS, "types"));
}

function parseInteger(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw invalidQuery();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw invalidQuery();
  return value;
}

function parseEnum<T extends string>(raw: string, allowed: readonly T[], _field: string): T {
  if (!isMemberOf(raw, allowed)) throw invalidQuery();
  return raw;
}

function nonEmpty(value: string, _field: string): string {
  if (!value.trim()) throw invalidQuery();
  return value;
}

function assertQuery(query: GraphQuery): void {
  if (!query || !isMemberOf(query.scope, GRAPH_SCOPES)
    || (query.rootId !== null && (typeof query.rootId !== "string" || !query.rootId))
    || (query.depth !== 1 && query.depth !== 2)
    || !Array.isArray(query.types)
    || query.types.some((type) => !isMemberOf(type, GRAPH_NODE_KINDS))
    || !Number.isSafeInteger(query.limit) || query.limit < GRAPH_MIN_LIMIT || query.limit > GRAPH_MAX_LIMIT) throw invalidQuery();
}

function isMemberOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function invalidQuery(): AppError {
  return new AppError("GRAPH_QUERY_INVALID", "GRAPH_QUERY_INVALID", 400);
}
