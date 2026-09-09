import { describe, expect, it, vi } from "vitest";
import { routeGoalsApi } from "../../src/routes/goals";
import type { GoalsService } from "../../src/goals/service";
import type { Principal } from "../../src/identity/principal";

const principal: Principal = { kind: "member", memberId: "member-a", identitySubject: "subject-a", email: "a@example.test", role: "contributor" };
const context = { requestId: "req-goal" };

describe("Goals API route", () => {
  it("derives owner from the principal and rejects memberId injection", async () => {
    const goals = { create: vi.fn() } as unknown as GoalsService;
    const request = new Request("https://example.test/api/goals", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "goal-1", clientKey: "goal-1", title: "Launch", memberId: "member-b" }),
    });
    await expect(routeGoalsApi(request, new URL(request.url), context, principal, { goals })).rejects.toMatchObject({ code: "GOAL_INVALID", status: 400 });
    expect(goals.create).not.toHaveBeenCalled();
  });

  it("passes only the authenticated member to list", async () => {
    const goals = { list: vi.fn(async (memberId: string) => ({ memberId, items: [] })) } as unknown as GoalsService;
    const request = new Request("https://example.test/api/goals?limit=20&status=active");
    const response = await routeGoalsApi(request, new URL(request.url), context, principal, { goals });
    expect(response?.status).toBe(200);
    expect(goals.list).toHaveBeenCalledWith("member-a", { status: "active" }, { limit: 20 });
  });

  it("maps delete to an owner-scoped archive and status mutation", async () => {
    const goals = { setStatus: vi.fn(async () => ({ id: "goal-1", status: "archived" })) } as unknown as GoalsService;
    const request = new Request("https://example.test/api/goals/goal-1", { method: "DELETE" });
    const response = await routeGoalsApi(request, new URL(request.url), context, principal, { goals });
    expect(response?.status).toBe(200);
    expect(goals.setStatus).toHaveBeenCalledWith("member-a", "goal-1", "archived");
  });
});
