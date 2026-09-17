import { normalizeGraphSnapshot } from "./types";
import type { GraphEdge, GraphNode, GraphNodeKind, GraphQuery, GraphSnapshot } from "./types";
import type {
  GraphCalendarRecord,
  GraphGoalRecord,
  GraphInboxRecord,
  GraphKnowledgeRecord,
  GraphProjectionRelation,
  GraphProjectionRepositoryPort,
  GraphProjectRecord,
  GraphTaskRecord,
  GraphTimelineRecord,
} from "./repository";

export class GraphProjectionService {
  constructor(private readonly repository: GraphProjectionRepositoryPort) {}

  async get(memberId: string, query: GraphQuery): Promise<GraphSnapshot> {
    const loaderLimit = Math.min(100, Math.max(1, query.limit));
    const [knowledge, tasks, projects, goals, inbox, calendar, timeline, relations] = await Promise.all([
      shouldLoad("knowledge", query) ? this.repository.listKnowledge(memberId, loaderLimit) : Promise.resolve([]),
      shouldLoad("task", query) ? this.repository.listTasks(memberId, loaderLimit) : Promise.resolve([]),
      shouldLoad("project", query) ? this.repository.listProjects(memberId, loaderLimit) : Promise.resolve([]),
      shouldLoad("goal", query) ? this.repository.listGoals(memberId, loaderLimit) : Promise.resolve([]),
      shouldLoad("inbox", query) ? this.repository.listInbox(memberId, loaderLimit) : Promise.resolve([]),
      shouldLoad("calendar", query) || shouldLoad("focus", query) ? this.repository.listCalendar(memberId, loaderLimit) : Promise.resolve([]),
      shouldLoad("meeting", query) || shouldLoad("decision", query) || shouldLoad("action_item", query) ? this.repository.listTimeline(memberId, loaderLimit) : Promise.resolve([]),
      this.repository.listRelations(memberId, loaderLimit),
    ]);

    const allNodes = [
      ...knowledge.map((record) => knowledgeNode(record)),
      ...tasks.map((record) => taskNode(record)),
      ...projects.map((record) => projectNode(record)),
      ...goals.map((record) => goalNode(record)),
      ...inbox.map((record) => inboxNode(record)),
      ...calendar.map((record) => calendarNode(record)),
      ...timeline.map((record) => timelineNode(record)),
    ];
    const allNodeById = new Map(allNodes.map((node) => [node.id, node]));
    const allEdges = relations
      .map((relation) => relationEdge(relation))
      .filter((edge): edge is GraphEdge => edge !== null)
      .filter((edge) => allNodeById.has(edge.source) && allNodeById.has(edge.target));

    const authorizedCitationIds = new Set(knowledge.flatMap((record) => record.citationIds));
    const authorizedEdges = allEdges.map((edge) => ({
      ...edge,
      citationIds: edge.citationIds.filter((citationId) => authorizedCitationIds.has(citationId)),
    }));

    const typeFiltered = query.types.length === 0
      ? allNodes
      : allNodes.filter((node) => query.types.includes(node.kind));
    const scopeSeeds = typeFiltered.filter((node) => {
      if (query.scope === "knowledge") return node.kind === "knowledge";
      if (query.scope === "project") return node.kind === "project";
      return true;
    });
    const selected = selectNeighborhood(scopeSeeds, typeFiltered, authorizedEdges, query.rootId, query.depth);
    const selectedIds = new Set(selected.map((node) => node.id));
    return normalizeGraphSnapshot(
      selected,
      authorizedEdges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)),
      query,
    );
  }
}

function knowledgeNode(record: GraphKnowledgeRecord): GraphNode {
  return node("knowledge", record.id, record.title, record.status, `/knowledge/${record.id}`, {
    updatedAt: record.updatedAt,
  });
}

function taskNode(record: GraphTaskRecord): GraphNode {
  return node("task", record.id, record.title, record.status, `/tasks/${record.id}`, {
    priority: record.priority,
    progress: record.progress,
    updatedAt: record.updatedAt,
  });
}

function projectNode(record: GraphProjectRecord): GraphNode {
  return node("project", record.id, record.title, record.status, `/projects/${record.id}`, {
    progress: record.progress,
    updatedAt: record.updatedAt,
  });
}

function goalNode(record: GraphGoalRecord): GraphNode {
  return node("goal", record.id, record.title, record.status, `/goals/${record.id}`, {
    progress: record.progress,
    updatedAt: record.updatedAt,
  });
}

function inboxNode(record: GraphInboxRecord): GraphNode {
  return node("inbox", record.id, record.title, record.status, `/inbox/${record.id}`, {
    updatedAt: record.updatedAt,
  });
}

function calendarNode(record: GraphCalendarRecord): GraphNode {
  const kind: GraphNodeKind = record.kind === "focus" ? "focus" : "calendar";
  const href = record.kind === "focus" ? `/focus/${record.id}` : `/calendar/${record.id}`;
  return node(kind, record.id, record.title, record.status, href, { updatedAt: record.updatedAt });
}

function timelineNode(record: GraphTimelineRecord): GraphNode {
  return node(record.kind, record.id, record.title, record.status, `/projects/${record.projectId}/timeline/${record.id}`, { updatedAt: record.updatedAt });
}

function node(
  kind: GraphNodeKind,
  id: string,
  label: string,
  status: string | null,
  href: string,
  metadata: Record<string, string | number | null>,
): GraphNode {
  return { id: `${kind}:${id}`, kind, label, status, href, metadata };
}

function relationEdge(relation: GraphProjectionRelation): GraphEdge | null {
  if (!relation.sourceId || !relation.targetId || !relation.kind || !relation.label) return null;
  return {
    id: `${relation.kind}:${relation.sourceKind}:${relation.sourceId}:${relation.targetKind}:${relation.targetId}`,
    source: `${relation.sourceKind}:${relation.sourceId}`,
    target: `${relation.targetKind}:${relation.targetId}`,
    kind: relation.kind,
    label: relation.label,
    weight: Number.isFinite(relation.weight) ? relation.weight : 1,
    citationIds: [...new Set(relation.citationIds)],
  };
}

function selectNeighborhood(
  scopeSeeds: GraphNode[],
  allNodes: GraphNode[],
  edges: GraphEdge[],
  rootId: string | null,
  depth: 1 | 2,
): GraphNode[] {
  const byId = new Map(allNodes.map((node) => [node.id, node]));
  const seeds = rootId === null
    ? scopeSeeds
    : scopeSeeds.filter((node) => node.id === rootId || node.id.endsWith(`:${rootId}`));
  if (seeds.length === 0) return [];
  const distances = new Map<string, number>();
  const queue: string[] = [];
  for (const seed of seeds) {
    if (!distances.has(seed.id)) {
      distances.set(seed.id, 0);
      queue.push(seed.id);
    }
  }
  const neighbors = new Map<string, string[]>();
  for (const edge of edges) {
    const source = neighbors.get(edge.source) ?? [];
    source.push(edge.target);
    neighbors.set(edge.source, source);
    const target = neighbors.get(edge.target) ?? [];
    target.push(edge.source);
    neighbors.set(edge.target, target);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const distance = distances.get(current)!;
    if (distance >= depth) continue;
    for (const neighbor of neighbors.get(current) ?? []) {
      if (byId.has(neighbor) && !distances.has(neighbor)) {
        distances.set(neighbor, distance + 1);
        queue.push(neighbor);
      }
    }
  }
  return allNodes.filter((node) => distances.has(node.id));
}

function shouldLoad(kind: GraphNodeKind, query: GraphQuery): boolean {
  if (query.types.length > 0 && !query.types.includes(kind)) {
    const scopeKind = query.scope === "knowledge" ? "knowledge" : query.scope === "project" ? "project" : null;
    if (scopeKind !== kind) return false;
  }
  if (!query.rootId) return true;
  if (!query.rootId.includes(":")) return true;
  return query.rootId.startsWith(`${kind}:`);
}
