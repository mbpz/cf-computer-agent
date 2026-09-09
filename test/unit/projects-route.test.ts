import { describe, expect, it, vi } from "vitest";
import { routeProjectsApi } from "../../src/routes/projects";
import type { ProjectsService } from "../../src/projects/service";
import type { Principal } from "../../src/identity/principal";

const principal: Principal = { kind: "member", memberId: "member-a", identitySubject: "subject-a", email: "a@example.test", role: "contributor" };
const context = { requestId: "req-project" };

describe("Projects API route", () => {
  it("derives owner from the principal and rejects memberId injection", async () => {
    const projects = { create: vi.fn() } as unknown as ProjectsService;
    const request = new Request("https://example.test/api/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "project-1", clientKey: "project-1", title: "Launch", memberId: "member-b" }),
    });
    await expect(routeProjectsApi(request, new URL(request.url), context, principal, { projects })).rejects.toMatchObject({ code: "PROJECT_INVALID", status: 400 });
    expect(projects.create).not.toHaveBeenCalled();
  });

  it("passes only the authenticated member to list", async () => {
    const projects = { list: vi.fn(async (memberId: string) => ({ memberId, items: [] })) } as unknown as ProjectsService;
    const request = new Request("https://example.test/api/projects?limit=20&status=active");
    const response = await routeProjectsApi(request, new URL(request.url), context, principal, { projects });
    expect(response?.status).toBe(200);
    expect(projects.list).toHaveBeenCalledWith("member-a", { status: "active" }, { limit: 20 });
  });

  it("uses explicit relation endpoints and owner-scoped summary", async () => {
    const projects = {
      linkGoal: vi.fn(async () => ({ linked: true, project: {} })),
      unlinkTask: vi.fn(async () => ({})),
      summary: vi.fn(async () => ({ goalCount: 1, taskCount: 2, completedTaskCount: 1, goals: [] })),
    } as unknown as ProjectsService;
    const linkRequest = new Request("https://example.test/api/projects/project-1/goals", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goalId: "goal-1" }),
    });
    const linkResponse = await routeProjectsApi(linkRequest, new URL(linkRequest.url), context, principal, { projects });
    expect(linkResponse?.status).toBe(200);
    expect(projects.linkGoal).toHaveBeenCalledWith("member-a", "project-1", "goal-1");

    const summaryRequest = new Request("https://example.test/api/projects/project-1/summary");
    const summaryResponse = await routeProjectsApi(summaryRequest, new URL(summaryRequest.url), context, principal, { projects });
    expect(summaryResponse?.status).toBe(200);
    expect(projects.summary).toHaveBeenCalledWith("member-a", "project-1");

    const unlinkRequest = new Request("https://example.test/api/projects/project-1/tasks/task-1", { method: "DELETE" });
    await routeProjectsApi(unlinkRequest, new URL(unlinkRequest.url), context, principal, { projects });
    expect(projects.unlinkTask).toHaveBeenCalledWith("member-a", "project-1", "task-1");
  });
});
