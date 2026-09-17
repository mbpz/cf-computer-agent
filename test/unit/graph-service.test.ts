/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { GraphProjectionService } from "../../src/graph/service";
import { GraphProjectionRepository } from "../../src/graph/repository";
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
} from "../../src/graph/repository";
import type { GraphQuery } from "../../src/graph/types";
import { MIGRATIONS } from "../fixtures/d1";

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

  it("loads allowed neighbors for canonical roots at depth one and two", async () => {
    const repository = new FakeGraphRepository({
      knowledge: [knowledge("knowledge-a", "member-a")],
      projects: [project("project-a", "member-a")],
      tasks: [task("task-a", "member-a")],
      timeline: [
        { id: "meeting-a", projectId: "project-a", kind: "meeting", title: "Kickoff", status: "open", updatedAt: "2026-09-17T00:00:00.000Z" },
      ],
      relations: [
        relation("project", "project-a", "task", "task-a", "belongs_to"),
        relation("task", "task-a", "knowledge", "knowledge-a", "references"),
        relation("meeting", "meeting-a", "project", "project-a", "belongs_to"),
      ],
    });
    const service = new GraphProjectionService(repository);

    const taskDepthOne = await service.get("member-a", { ...query, rootId: "task:task-a", depth: 1 });
    expect(taskDepthOne.nodes.map((node) => node.id)).toEqual(["task:task-a", "knowledge:knowledge-a", "project:project-a"]);

    const taskDepthTwo = await service.get("member-a", { ...query, rootId: "task:task-a", depth: 2 });
    expect(taskDepthTwo.nodes.map((node) => node.id)).toEqual(["task:task-a", "knowledge:knowledge-a", "meeting:meeting-a", "project:project-a"]);

    const projectDepthOne = await service.get("member-a", { ...query, rootId: "project:project-a", depth: 1 });
    expect(projectDepthOne.nodes.map((node) => node.id)).toEqual(["project:project-a", "meeting:meeting-a", "task:task-a"]);

    const projectDepthTwo = await service.get("member-a", { ...query, rootId: "project:project-a", depth: 2 });
    expect(projectDepthTwo.nodes.map((node) => node.id)).toEqual(["project:project-a", "knowledge:knowledge-a", "meeting:meeting-a", "task:task-a"]);

    const knowledgeDepthOne = await service.get("member-a", { ...query, rootId: "knowledge:knowledge-a", depth: 1 });
    expect(knowledgeDepthOne.nodes.map((node) => node.id)).toEqual(["knowledge:knowledge-a", "task:task-a"]);

    const knowledgeDepthTwo = await service.get("member-a", { ...query, rootId: "knowledge:knowledge-a", depth: 2 });
    expect(knowledgeDepthTwo.nodes.map((node) => node.id)).toEqual(["knowledge:knowledge-a", "project:project-a", "task:task-a"]);
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

  it("projects timeline item kinds and their owned project relation", async () => {
    const repository = new FakeGraphRepository({
      projects: [project("project-a", "member-a")],
      timeline: [
        { id: "meeting-a", projectId: "project-a", kind: "meeting", title: "Kickoff", status: "open", updatedAt: "2026-09-17T00:00:00.000Z" },
        { id: "decision-a", projectId: "project-a", kind: "decision", title: "Decision", status: "open", updatedAt: "2026-09-17T00:00:00.000Z" },
        { id: "action-a", projectId: "project-a", kind: "action_item", title: "Ship", status: "open", updatedAt: "2026-09-17T00:00:00.000Z" },
      ],
      relations: [
        relation("meeting", "meeting-a", "project", "project-a", "belongs_to"),
        relation("decision", "decision-a", "project", "project-a", "belongs_to"),
        relation("action_item", "action-a", "project", "project-a", "belongs_to"),
      ],
    });
    const result = await new GraphProjectionService(repository).get("member-a", { ...query, types: ["meeting", "decision", "action_item", "project"] });
    expect(result.nodes.map((node) => node.id)).toEqual(["action_item:action-a", "decision:decision-a", "meeting:meeting-a", "project:project-a"]);
    expect(result.edges).toHaveLength(3);
  });
});

describe("GraphProjectionRepository D1 authorization contract", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    const now = "2026-09-17T00:00:00.000Z";
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('graph-a', 'graph-a', 'graph-a@example.test', 'contributor', 'active', ?, ?), ('graph-b', 'graph-b', 'graph-b@example.test', 'contributor', 'active', ?, ?), ('graph-admin', 'graph-admin', 'graph-admin@example.test', 'admin', 'active', ?, ?), ('graph-disabled', 'graph-disabled', 'graph-disabled@example.test', 'contributor', 'disabled', ?, ?)").bind(now, now, now, now, now, now, now, now).run();
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES ('graph-project-a', 'graph-a', 'pa', 'A', '', 'active', 0, NULL, ?, ?), ('graph-project-b', 'graph-b', 'pb', 'B', '', 'active', 0, NULL, ?, ?)").bind(Date.parse(now), Date.parse(now), Date.parse(now), Date.parse(now)).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at) VALUES ('graph-task-a', 'graph-a', 'A', '', 'todo', 0, 'medium', NULL, ?, ?), ('graph-task-b', 'graph-b', 'B', '', 'todo', 0, 'medium', NULL, ?, ?)").bind(Date.parse(now), Date.parse(now), Date.parse(now), Date.parse(now)).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at) VALUES ('graph-task-disabled', 'graph-disabled', 'Disabled', '', 'todo', 0, 'medium', NULL, ?, ?)").bind(Date.parse(now), Date.parse(now)).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at) VALUES ('graph-task-a-2', 'graph-a', 'A2', '', 'todo', 0, 'medium', NULL, ?, ?), ('graph-task-a-3', 'graph-a', 'A3', '', 'todo', 0, 'medium', NULL, ?, ?), ('graph-task-a-4', 'graph-a', 'A4', '', 'todo', 0, 'medium', NULL, ?, ?)").bind(Date.parse(now), Date.parse(now), Date.parse(now), Date.parse(now), Date.parse(now), Date.parse(now)).run();
    await env.DB.prepare("INSERT INTO project_tasks (project_id, member_id, task_id, created_at) VALUES ('graph-project-a', 'graph-a', 'graph-task-a', ?), ('graph-project-b', 'graph-b', 'graph-task-b', ?), ('graph-project-a', 'graph-a', 'graph-task-b', ?)").bind(Date.parse(now), Date.parse(now), Date.parse(now)).run();
    await env.DB.prepare("INSERT INTO project_timeline_items (id, member_id, project_id, client_key, kind, title, body, status, starts_at, due_at, created_at, updated_at) VALUES ('graph-meeting-a', 'graph-a', 'graph-project-a', 'meeting-a', 'meeting', 'A meeting', '', 'open', NULL, NULL, ?, ?), ('graph-meeting-b', 'graph-b', 'graph-project-b', 'meeting-b', 'meeting', 'B meeting', '', 'open', NULL, NULL, ?, ?)").bind(Date.parse(now), Date.parse(now), Date.parse(now), Date.parse(now)).run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES ('graph-sub-a', 'graph-a', 'default', 'markdown', 'published', 'Shared', '# Shared', NULL, ?, ?), ('graph-sub-b', 'graph-b', 'default', 'markdown', 'published', 'Admin only', '# Admin', NULL, ?, ?)").bind(now, now, now, now),
      env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('graph-source-a', 'graph-a', 'default', 'markdown', 'Shared', ?, ?), ('graph-source-b', 'graph-b', 'default', 'markdown', 'Admin only', ?, ?)").bind(now, now, now, now),
      env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('graph-sv-a', 'graph-source-a', 'graph-sub-a', 1, '# Shared', 'sha-a', 'm1', ?), ('graph-sv-b', 'graph-source-b', 'graph-sub-b', 1, '# Admin', 'sha-b', 'm1', ?)").bind(now, now),
      env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('graph-knowledge-a', 'default', NULL, 'active', 'indexed', ?, ?), ('graph-knowledge-b', 'default', NULL, 'active', 'indexed', ?, ?)").bind(now, now, now, now),
      env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('graph-revision-a', 'graph-knowledge-a', 'graph-sv-a', '/graph-a.md', 'sha-a', 'Shared', '[]', 'shared', 'graph-a', ?), ('graph-revision-b', 'graph-knowledge-b', 'graph-sv-b', '/graph-b.md', 'sha-b', 'Admin only', '[]', 'admin_only', 'graph-b', ?)").bind(now, now),
    ]);
    await env.DB.batch([
      env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'graph-revision-a' WHERE id = 'graph-knowledge-a'"),
      env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'graph-revision-b' WHERE id = 'graph-knowledge-b'"),
    ]);
  });

  it("enforces active-member/private-table predicates and both-endpoint owner joins against real D1", async () => {
    const repository = new GraphProjectionRepository(env.DB);
    expect((await repository.listTasks("graph-a", 50)).map((item) => item.id)).toEqual(["graph-task-a", "graph-task-a-2", "graph-task-a-3", "graph-task-a-4"]);
    expect((await repository.listTasks("graph-a", 2)).map((item) => item.id)).toEqual(["graph-task-a", "graph-task-a-2", "graph-task-a-3"]);
    expect((await repository.listProjects("graph-a", 50)).map((item) => item.id)).toEqual(["graph-project-a"]);
    expect((await repository.listTimeline("graph-a", 50)).map((item) => item.id)).toEqual(["graph-meeting-a"]);
    const relations = await repository.listRelations("graph-a");
    expect(relations).toEqual([expect.objectContaining({ sourceKind: "project", sourceId: "graph-project-a", targetKind: "task", targetId: "graph-task-a" }), expect.objectContaining({ sourceKind: "meeting", sourceId: "graph-meeting-a", targetKind: "project", targetId: "graph-project-a" })]);
    expect(await repository.listTasks("graph-disabled", 50)).toEqual([]);
    expect((await repository.listKnowledge("graph-a", 50)).map((item) => item.id)).toEqual(["graph-knowledge-a"]);
    expect((await repository.listKnowledge("graph-admin", 50)).map((item) => item.id)).toEqual(["graph-knowledge-a", "graph-knowledge-b"]);
  });
});

class FakeGraphRepository implements GraphProjectionRepositoryPort {
  readonly requestedMembers: string[] = [];
  private readonly data: {
    knowledge: Owned<GraphKnowledgeRecord>[];
    tasks: Owned<GraphTaskRecord>[];
    projects: Owned<GraphProjectRecord>[];
    timeline: GraphTimelineRecord[];
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
      timeline: input.timeline ?? [],
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
  async listTimeline(memberId: string) { this.requestedMembers.push(memberId); return this.data.timeline; }
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
  timeline?: GraphTimelineRecord[];
  relations?: GraphProjectionRelation[];
};
function stripMember<T extends { memberId?: string }>(record: T): Omit<T, "memberId"> { const { memberId: _memberId, ...rest } = record; return rest; }
function base(id: string, title = id) { return { id, title, status: "active", updatedAt: "2026-09-17T00:00:00.000Z" }; }
function task(id: string, memberId?: string): GraphTaskRecord & { memberId?: string } { return { ...base(id), priority: "medium", progress: 0, memberId }; }
function project(id: string, memberId?: string): GraphProjectRecord & { memberId?: string } { return { ...base(id), progress: 0, memberId }; }
function knowledge(id: string, _memberId?: string, citationIds: string[] = []): GraphKnowledgeRecord & { memberId?: string } { return { ...base(id), citationIds, memberId: _memberId }; }
function relation(sourceKind: GraphProjectionRelation["sourceKind"], sourceId: string, targetKind: GraphProjectionRelation["targetKind"], targetId: string, kind: GraphProjectionRelation["kind"], citationIds: string[] = []): GraphProjectionRelation { return { sourceKind, sourceId, targetKind, targetId, kind, label: kind, weight: 1, citationIds }; }
