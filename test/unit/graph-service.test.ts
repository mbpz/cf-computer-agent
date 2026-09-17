import { describe, expect, it } from "vitest";
import { GraphProjectionService } from "../../src/graph/service";
import type {
  GraphCalendarRecord,
  GraphGoalRecord,
  GraphInboxRecord,
  GraphKnowledgeRecord,
  GraphProjectionRelation,
  GraphProjectionRepositoryPort,
  GraphProjectRecord,
  GraphTaskRecord,
} from "../../src/graph/repository";
import type { GraphQuery } from "../../src/graph/types";

const query: GraphQuery = { scope: "workspace", rootId: null, depth: 1, types: [], limit: 50, cursor: null };

describe("GraphProjectionService", () => {
  it("projects only member-owned objects and removes edges to hidden nodes", async () => {
    const repository = new FakeGraphRepository({
      tasks: [task("task-a", "member-a"), task("task-b", "member-b")],
      relations: [relation("task", "task-a", "task", "task-b", "depends_on")],
    });
    const service = new GraphProjectionService(repository);
    const result = await service.get("member-a", query);
    expect(result.nodes.map((node) => node.id)).toEqual(["task:task-a"]);
    expect(result.edges).toEqual([]);
    expect(repository.requestedMembers.every((memberId) => memberId === "member-a")).toBe(true);
  });

  it("uses stable kind:id IDs and deterministic node and edge ordering", async () => {
    const repository = new FakeGraphRepository({
      tasks: [task("task-z", "member-a"), task("task-a", "member-a")],
      projects: [project("project-a", "member-a")],
      relations: [
        relation("project", "project-a", "task", "task-z", "belongs_to"),
        relation("project", "project-a", "task", "task-a", "belongs_to"),
      ],
    });
    const result = await new GraphProjectionService(repository).get("member-a", query);
    expect(result.nodes.map((node) => node.id)).toEqual(["project:project-a", "task:task-a", "task:task-z"]);
    expect(result.edges.map((edge) => edge.id)).toEqual([
      "belongs_to:project:project-a:task:task-a",
      "belongs_to:project:project-a:task:task-z",
    ]);
    expect(result.nodes.every((node) => !("memberId" in node.metadata) && !("member_id" in node.metadata))).toBe(true);
  });

  it("applies scope, type, root, and depth filters", async () => {
    const repository = new FakeGraphRepository({
      knowledge: [knowledge("knowledge-a", "member-a")],
      projects: [project("project-a", "member-a"), project("project-b", "member-a")],
      tasks: [task("task-a", "member-a")],
      relations: [
        relation("project", "project-a", "task", "task-a", "belongs_to"),
        relation("task", "task-a", "knowledge", "knowledge-a", "references"),
      ],
    });
    const service = new GraphProjectionService(repository);
    const result = await service.get("member-a", { ...query, scope: "project", rootId: "project-a", depth: 1, types: ["project", "task"] });
    expect(result.nodes.map((node) => node.id)).toEqual(["project:project-a", "task:task-a"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.kind).toBe("belongs_to");
  });

  it("keeps citation IDs only when they belong to an authorized knowledge source", async () => {
    const repository = new FakeGraphRepository({
      knowledge: [knowledge("knowledge-a", "member-a", ["citation-authorized"])],
      tasks: [task("task-a", "member-a")],
      relations: [relation("task", "task-a", "knowledge", "knowledge-a", "references", ["citation-authorized", "citation-member-b"])],
    });
    const result = await new GraphProjectionService(repository).get("member-a", query);
    expect(result.edges[0]?.citationIds).toEqual(["citation-authorized"]);
  });
});

class FakeGraphRepository implements GraphProjectionRepositoryPort {
  readonly requestedMembers: string[] = [];
  private readonly data: {
    knowledge: Owned<GraphKnowledgeRecord>[];
    tasks: Owned<GraphTaskRecord>[];
    projects: Owned<GraphProjectRecord>[];
    goals: GraphGoalRecord[];
    inbox: GraphInboxRecord[];
    calendar: GraphCalendarRecord[];
    relations: GraphProjectionRelation[];
  };

  constructor(input: FakeGraphInput) {
    this.data = {
      knowledge: input.knowledge ?? [],
      tasks: input.tasks ?? [],
      projects: input.projects ?? [],
      goals: input.goals ?? [],
      inbox: input.inbox ?? [],
      calendar: input.calendar ?? [],
      relations: input.relations ?? [],
    };
  }

  async listKnowledge(memberId: string) { this.requestedMembers.push(memberId); return this.data.knowledge.filter((record) => !record.memberId || record.memberId === memberId).map(stripMember); }
  async listTasks(memberId: string) { this.requestedMembers.push(memberId); return this.data.tasks.filter((record) => !record.memberId || record.memberId === memberId).map(stripMember); }
  async listProjects(memberId: string) { this.requestedMembers.push(memberId); return this.data.projects.filter((record) => !record.memberId || record.memberId === memberId).map(stripMember); }
  async listGoals(memberId: string) { this.requestedMembers.push(memberId); return this.data.goals; }
  async listInbox(memberId: string) { this.requestedMembers.push(memberId); return this.data.inbox; }
  async listCalendar(memberId: string) { this.requestedMembers.push(memberId); return this.data.calendar; }
  async listRelations(memberId: string) { this.requestedMembers.push(memberId); return this.data.relations; }
}

type Owned<T> = T & { memberId?: string };
type FakeGraphInput = {
  knowledge?: Owned<GraphKnowledgeRecord>[];
  tasks?: Owned<GraphTaskRecord>[];
  projects?: Owned<GraphProjectRecord>[];
  goals?: GraphGoalRecord[];
  inbox?: GraphInboxRecord[];
  calendar?: GraphCalendarRecord[];
  relations?: GraphProjectionRelation[];
};
function stripMember<T extends { memberId?: string }>(record: T): Omit<T, "memberId"> { const { memberId: _memberId, ...rest } = record; return rest; }
function base(id: string, title = id) { return { id, title, status: "active", updatedAt: "2026-09-17T00:00:00.000Z" }; }
function task(id: string, memberId?: string): GraphTaskRecord & { memberId?: string } { return { ...base(id), priority: "medium", progress: 0, memberId }; }
function project(id: string, memberId?: string): GraphProjectRecord & { memberId?: string } { return { ...base(id), progress: 0, memberId }; }
function knowledge(id: string, _memberId?: string, citationIds: string[] = []): GraphKnowledgeRecord & { memberId?: string } { return { ...base(id), citationIds, memberId: _memberId }; }
function relation(sourceKind: GraphProjectionRelation["sourceKind"], sourceId: string, targetKind: GraphProjectionRelation["targetKind"], targetId: string, kind: GraphProjectionRelation["kind"], citationIds: string[] = []): GraphProjectionRelation { return { sourceKind, sourceId, targetKind, targetId, kind, label: kind, weight: 1, citationIds }; }
