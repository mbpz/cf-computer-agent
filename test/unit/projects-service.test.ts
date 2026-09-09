import { describe, expect, it } from "vitest";
import { ProjectsService } from "../../src/projects/service";
import type { ProjectsRepositoryPort } from "../../src/projects/repository";
import type { Project, ProjectPage, ProjectSummary } from "../../src/projects/types";

const NOW = new Date("2026-09-09T00:00:00.000Z");
const summary: ProjectSummary = { goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] };

describe("ProjectsService", () => {
  it("keeps project creation idempotent and owner scoped", async () => {
    const repository = new FakeProjectsRepository();
    const service = new ProjectsService(repository, { now: () => NOW, id: () => "project-1" });
    const first = await service.create("member-a", { id: "project-1", clientKey: "project-1", title: "Launch" });
    const replay = await service.create("member-a", { id: "ignored", clientKey: "project-1", title: "Different" });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.project.id).toBe("project-1");
    await expect(service.get("member-b", "project-1")).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND", status: 404 });
  });

  it("requires an owned Goal or Task before linking and makes replays safe", async () => {
    const repository = new FakeProjectsRepository();
    const service = new ProjectsService(repository, {
      now: () => NOW, id: () => "project-1",
      goals: { findOwned: async (memberId, id) => memberId === "member-a" && id === "goal-1" ? {} as never : null },
      tasks: { findOwned: async (memberId, id) => memberId === "member-a" && id === "task-1" ? {} as never : null },
    });
    await service.create("member-a", { id: "project-1", clientKey: "project-1", title: "Launch" });
    await expect(service.linkGoal("member-a", "project-1", "goal-other")).rejects.toMatchObject({ code: "PROJECT_GOAL_NOT_FOUND", status: 404 });
    await expect(service.linkTask("member-a", "project-1", "task-other")).rejects.toMatchObject({ code: "PROJECT_TASK_NOT_FOUND", status: 404 });
    await expect(service.linkGoal("member-a", "project-1", "goal-1")).resolves.toMatchObject({ linked: true });
    await expect(service.linkGoal("member-a", "project-1", "goal-1")).resolves.toMatchObject({ linked: false });
    await expect(service.linkTask("member-a", "project-1", "task-1")).resolves.toMatchObject({ linked: true });
  });

  it("validates status, progress and owner before mutation", async () => {
    const repository = new FakeProjectsRepository();
    const service = new ProjectsService(repository);
    await expect(service.setStatus("member-a", "project-1", "done")).rejects.toMatchObject({ code: "PROJECT_INVALID", status: 400 });
    await expect(service.update("member-a", "project-1", { progress: 101 })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND", status: 404 });
  });
});

class FakeProjectsRepository implements ProjectsRepositoryPort {
  readonly projects: Project[] = [];
  readonly goals = new Set<string>();
  readonly tasks = new Set<string>();
  async insert(input: Parameters<ProjectsRepositoryPort["insert"]>[0]) {
    if (this.projects.some((project) => project.memberId === input.memberId && project.clientKey === input.clientKey)) return false;
    this.projects.push({ id: input.id, memberId: input.memberId, clientKey: input.clientKey, title: input.title, description: input.description, status: "planned", progress: input.progress, targetAt: input.targetAt === null ? null : new Date(input.targetAt).toISOString(), createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString() });
    return true;
  }
  async findOwned(memberId: string, id: string) { return this.projects.find((project) => project.memberId === memberId && project.id === id) ?? null; }
  async findByClientKey(memberId: string, key: string) { return this.projects.find((project) => project.memberId === memberId && project.clientKey === key) ?? null; }
  async listOwned(memberId: string, _request: Parameters<ProjectsRepositoryPort["listOwned"]>[1]): Promise<ProjectPage> { return { items: this.projects.filter((project) => project.memberId === memberId) }; }
  async update(memberId: string, id: string, input: Parameters<ProjectsRepositoryPort["update"]>[2]) { const project = await this.findOwned(memberId, id); if (!project) return null; Object.assign(project, { title: input.title, description: input.description, progress: input.progress, targetAt: input.targetAt === null ? null : new Date(input.targetAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString() }); return project; }
  async updateStatus(memberId: string, id: string, status: Parameters<ProjectsRepositoryPort["updateStatus"]>[2], updatedAt: number) { const project = await this.findOwned(memberId, id); if (!project) return null; project.status = status; project.updatedAt = new Date(updatedAt).toISOString(); return project; }
  async linkGoal(_memberId: string, _projectId: string, goalId: string, _createdAt: number) { if (this.goals.has(goalId)) return false; this.goals.add(goalId); return true; }
  async unlinkGoal(_memberId: string, _projectId: string, goalId: string) { return this.goals.delete(goalId); }
  async linkTask(_memberId: string, _projectId: string, taskId: string, _createdAt: number) { if (this.tasks.has(taskId)) return false; this.tasks.add(taskId); return true; }
  async unlinkTask(_memberId: string, _projectId: string, taskId: string) { return this.tasks.delete(taskId); }
  async summary(_memberId: string, _projectId: string) { return { ...summary, goalCount: this.goals.size, taskCount: this.tasks.size }; }
}
