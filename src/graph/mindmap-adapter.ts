import type { MindmapResult } from "../ai/mindmap-service";
import type { GraphEdge, GraphNode } from "./types";

export interface MindmapEvidenceGap {
  from: string;
  to: string;
  relation: string;
  reason: "missing_citation" | "unauthorized_citation" | "unknown_endpoint";
  citationIds: string[];
}

export interface MindmapGraphAdapterOptions {
  knowledgeItemId: string;
  authorizedCitationIds?: readonly string[];
}

export interface MindmapGraphAdapterResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidenceGaps: MindmapEvidenceGap[];
}

/**
 * Converts a grounded MindmapResult into the public Graph DTO without trusting
 * provider ids as global identifiers. Only citation ids authorized by the
 * caller may become factual GraphEdge citations.
 */
export function adaptMindmapToGraph(result: MindmapResult, options: MindmapGraphAdapterOptions): MindmapGraphAdapterResult {
  if (!result || !Array.isArray(result.nodes) || !Array.isArray(result.edges) || !options?.knowledgeItemId) {
    throw new Error("GRAPH_MINDMAP_INVALID");
  }
  const allowed = options.authorizedCitationIds ? new Set(options.authorizedCitationIds) : null;
  const nodeIds = new Set<string>();
  const nodes: GraphNode[] = [];
  for (const item of result.nodes) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.label !== "string" || !item.label.trim()) continue;
    const id = mindmapNodeId(options.knowledgeItemId, item.id);
    if (nodeIds.has(id)) continue;
    nodeIds.add(id);
    const citationIds = citationIdsFor(item.citations, allowed);
    nodes.push({
      id,
      kind: "knowledge",
      label: item.label.trim(),
      status: null,
      href: `/knowledge/${encodeURIComponent(options.knowledgeItemId)}/mindmap/${encodeURIComponent(item.id)}`,
      metadata: {
        knowledgeItemId: options.knowledgeItemId,
        citationCount: citationIds.length,
        evidenceGap: citationIds.length === 0 ? "missing_citation" : null,
      },
    });
  }

  const edges: GraphEdge[] = [];
  const evidenceGaps: MindmapEvidenceGap[] = [];
  for (const item of result.edges) {
    if (!item || typeof item.from !== "string" || typeof item.to !== "string" || typeof item.relation !== "string") continue;
    const source = mindmapNodeId(options.knowledgeItemId, item.from);
    const target = mindmapNodeId(options.knowledgeItemId, item.to);
    const citationIds = citationIdsFor(item.citations, allowed);
    const base = { from: source, to: target, relation: item.relation.trim(), citationIds };
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      evidenceGaps.push({ ...base, reason: "unknown_endpoint" });
      continue;
    }
    if (citationIds.length === 0) {
      evidenceGaps.push({ ...base, reason: allowed ? "unauthorized_citation" : "missing_citation" });
      continue;
    }
    edges.push({
      id: `derived:${source}:${target}:${stablePart(item.relation)}`,
      source,
      target,
      kind: "derived",
      label: item.relation.trim() || "derived",
      weight: 1,
      citationIds,
    });
  }
  return { nodes, edges, evidenceGaps };
}

function citationIdsFor(citations: MindmapResult["nodes"][number]["citations"], allowed: Set<string> | null): string[] {
  return [...new Set(citations.filter((citation) => citation && typeof citation.citationId === "string").map((citation) => citation.citationId).filter((id) => !allowed || allowed.has(id)))];
}

function mindmapNodeId(knowledgeItemId: string, providerId: string): string {
  return `knowledge:${stablePart(knowledgeItemId)}:mindmap:${stablePart(providerId)}`;
}

function stablePart(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%/gu, "_");
}
