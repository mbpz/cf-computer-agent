import { describe, expect, it } from "vitest";
import { GraphProjectionService } from "../../src/graph/service";
import type { GraphProjectionRepositoryPort, GraphTaskRecord } from "../../src/graph/repository";
import type { GraphQuery } from "../../src/graph/types";

const baseQuery: GraphQuery = { scope: "workspace", rootId: null, depth: 1, types: [], limit: 50, cursor: null };
const NOW = new Date("2026-09-20T12:00:00.000Z");

describe("temporal graph projection", () => {
  it("uses a default seven-day window when only to is supplied", async () => {
    const repository = new FakeRepository([
      task("recent", "2026-09-18T12:00:00.000Z", "todo"),
      task("old", "2026-09-01T12:00:00.000Z", "todo"),
    ]);
    const result = await new GraphProjectionService(repository, { now: () => NOW }).get("member-a", { ...baseQuery, to: NOW.toISOString() });
    expect(result.nodes.map((node) => node.id)).toEqual(["task:recent"]);
    expect(result.nodes[0]?.metadata.changeKind).toBe("added");
  });

  it("filters completed changes and preserves member ownership", async () => {
    const repository = new FakeRepository([
      task("done", "2026-09-19T12:00:00.000Z", "done", "member-a"),
      task("other", "2026-09-19T12:00:00.000Z", "done", "member-b"),
    ]);
    const result = await new GraphProjectionService(repository, { now: () => NOW }).get("member-a", {
      ...baseQuery,
      from: "2026-09-19T00:00:00.000Z",
      to: NOW.toISOString(),
      changeKind: "completed",
    });
    expect(result.nodes.map((node) => node.id)).toEqual(["task:done"]);
  });

  it("rejects ranges longer than ninety days", async () => {
    const repository = new FakeRepository([task("task", NOW.toISOString(), "todo")]);
    await expect(new GraphProjectionService(repository, { now: () => NOW }).get("member-a", {
      ...baseQuery,
      from: "2026-01-01T00:00:00.000Z",
      to: NOW.toISOString(),
    })).rejects.toMatchObject({ code: "GRAPH_QUERY_INVALID", status: 400 });
  });
});

class FakeRepository implements GraphProjectionRepositoryPort {
  constructor(private readonly tasks: Array<GraphTaskRecord & { memberId?: string }>) {}
  async listKnowledge() { return []; }
  async listTasks(memberId: string) { return this.tasks.filter((task) => !task.memberId || task.memberId === memberId).map(({ memberId: _memberId, ...task }) => task); }
  async listProjects() { return []; }
  async listGoals() { return []; }
  async listInbox() { return []; }
  async listCalendar() { return []; }
  async listTimeline() { return []; }
  async listRelations() { return []; }
}

function task(id: string, updatedAt: string, status: string, memberId = "member-a"): GraphTaskRecord & { memberId: string } {
  return { id, title: id, status, updatedAt, priority: "medium", progress: status === "done" ? 100 : 0, memberId };
}
