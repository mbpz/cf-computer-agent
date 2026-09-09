import { describe, expect, it } from "vitest";
import { GoalsService } from "../../src/goals/service";
import type { Goal, GoalPage } from "../../src/goals/types";
import type { GoalsRepositoryPort } from "../../src/goals/repository";

const NOW = new Date("2026-09-09T00:00:00.000Z");

describe("GoalsService", () => {
  it("keeps create replay idempotent and owner scoped", async () => {
    const repository = new FakeGoalsRepository();
    const service = new GoalsService(repository, { now: () => NOW, id: () => "goal-1" });

    const first = await service.create("member-a", {
      id: "goal-1", clientKey: "goal-create-1", title: "Launch v2",
    });
    const replay = await service.create("member-a", {
      id: "goal-ignored", clientKey: "goal-create-1", title: "Different",
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.goal.id).toBe("goal-1");
    await expect(service.get("member-b", "goal-1")).rejects.toMatchObject({ code: "GOAL_NOT_FOUND", status: 404 });
  });

  it("rejects invalid fields before repository access", async () => {
    const repository = new FakeGoalsRepository();
    const service = new GoalsService(repository);
    await expect(service.create("member-a", { clientKey: "", title: "" })).rejects.toMatchObject({ code: "GOAL_INVALID", status: 400 });
    await expect(service.setProgress("member-a", "goal-1", 101)).rejects.toMatchObject({ code: "GOAL_INVALID", status: 400 });
    await expect(service.list("member-a", { status: "done" as never })).rejects.toMatchObject({ code: "GOAL_PAGE_INVALID", status: 400 });
    expect(repository.listCalls).toHaveLength(0);
  });

  it("supports pause, restore and completion without leaking ownership", async () => {
    const repository = new FakeGoalsRepository();
    const service = new GoalsService(repository, { now: () => NOW, id: () => "goal-1" });
    await service.create("member-a", { id: "goal-1", clientKey: "goal-1", title: "Launch v2" });
    await expect(service.setStatus("member-a", "goal-1", "paused")).resolves.toMatchObject({ status: "paused" });
    await expect(service.setStatus("member-a", "goal-1", "active")).resolves.toMatchObject({ status: "active" });
    await expect(service.setProgress("member-a", "goal-1", 100)).resolves.toMatchObject({ progress: 100 });
    await expect(service.setStatus("member-a", "goal-1", "completed")).resolves.toMatchObject({ status: "completed" });
    await expect(service.setStatus("member-b", "goal-1", "archived")).rejects.toMatchObject({ code: "GOAL_NOT_FOUND", status: 404 });
  });
});

class FakeGoalsRepository implements GoalsRepositoryPort {
  readonly goals: Goal[] = [];
  readonly listCalls: Array<{ memberId: string; request: unknown }> = [];

  async insert(input: Parameters<GoalsRepositoryPort["insert"]>[0]): Promise<boolean> {
    if (this.goals.some((goal) => goal.memberId === input.memberId && goal.clientKey === input.clientKey)) return false;
    this.goals.push({
      id: input.id, memberId: input.memberId, clientKey: input.clientKey, title: input.title,
      description: input.description, status: "active", progress: 0,
      targetAt: input.targetAt === null ? null : new Date(input.targetAt).toISOString(),
      createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString(),
    });
    return true;
  }
  async findOwned(memberId: string, id: string) { return this.goals.find((goal) => goal.memberId === memberId && goal.id === id) ?? null; }
  async findByClientKey(memberId: string, clientKey: string) { return this.goals.find((goal) => goal.memberId === memberId && goal.clientKey === clientKey) ?? null; }
  async listOwned(memberId: string, request: Parameters<GoalsRepositoryPort["listOwned"]>[1]): Promise<GoalPage> {
    this.listCalls.push({ memberId, request });
    return { items: this.goals.filter((goal) => goal.memberId === memberId), nextCursor: undefined };
  }
  async update(memberId: string, id: string, input: Parameters<GoalsRepositoryPort["update"]>[2]) {
    const goal = await this.findOwned(memberId, id);
    if (!goal) return null;
    Object.assign(goal, {
      title: input.title,
      description: input.description,
      targetAt: input.targetAt === null ? null : new Date(input.targetAt).toISOString(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    });
    return goal;
  }
  async updateStatus(memberId: string, id: string, status: Parameters<GoalsRepositoryPort["updateStatus"]>[2], updatedAt: number) {
    const goal = await this.findOwned(memberId, id);
    if (!goal) return null;
    goal.status = status; goal.updatedAt = new Date(updatedAt).toISOString(); return goal;
  }
  async updateProgress(memberId: string, id: string, progress: number, updatedAt: number) {
    const goal = await this.findOwned(memberId, id);
    if (!goal) return null;
    goal.progress = progress; goal.updatedAt = new Date(updatedAt).toISOString(); return goal;
  }
}
