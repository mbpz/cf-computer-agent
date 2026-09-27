import { describe, expect, it } from "vitest";
import { loadGoalTasks, setGoalTask } from "../../frontend/lib/goal-tasks-data";
const V0 = "2026-09-01T00:00:00.000Z", V1 = "2026-09-01T00:00:00.001Z";
const page = { goalId: "g", expectedUpdatedAt: V0, summary: { taskCount: 1, completedTaskCount: 0 }, items: [{ id: "t", title: "Task", linked: true }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
describe("goal task response contracts", () => {
  it("loads the requested page and sends conditional link/unlink requests", async () => {
    const requests: Array<{ path: string; method: string; body: unknown }> = [];
    const fetcher: typeof fetch = async (input, init) => { requests.push({ path: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null }); return Response.json(init?.method ? { goalId: "g", taskId: "t", linked: init.method === "POST", changed: true, updatedAt: V1 } : page); };
    expect(await loadGoalTasks("g", { page: 1, pageSize: 20 }, fetcher)).toEqual(page);
    expect(await setGoalTask("g", "t", true, V0, fetcher)).toBe(V1); await setGoalTask("g", "t", false, V0, fetcher);
    expect(requests).toEqual([{ path: "/api/goals/g/tasks?page=1&pageSize=20", method: "GET", body: null }, { path: "/api/goals/g/tasks", method: "POST", body: { taskId: "t", expectedUpdatedAt: V0 } }, { path: "/api/goals/g/tasks/t", method: "DELETE", body: { expectedUpdatedAt: V0 } }]);
  });
  it.each([{ goalId: "foreign" }, { expectedUpdatedAt: "bad" }, { summary: { taskCount: -1, completedTaskCount: 0 } }, { summary: { taskCount: 1, completedTaskCount: 2 } }, { summary: { taskCount: 2, completedTaskCount: 0 } }, { items: [{ id: "t", title: "T", linked: "yes" }] }, { items: [{ id: "t", title: "", linked: true }] }, { pagination: { page: 2, pageSize: 20, total: 1, totalPages: 1 } }])("rejects invalid page %j", async patch => { await expect(loadGoalTasks("g", { page: 1, pageSize: 20 }, async () => Response.json({ ...page, ...patch }))).rejects.toThrow(); });
  it.each([{ goalId: "foreign" }, { taskId: "other" }, { linked: false }, { changed: "yes" }, { updatedAt: V0 }, { updatedAt: "bad" }, { updatedAt: "2026-08-01T00:00:00.000Z" }])("rejects malformed write receipt %j", async patch => { await expect(setGoalTask("g", "t", true, V0, async () => Response.json({ goalId: "g", taskId: "t", linked: true, changed: true, updatedAt: V1, ...patch }))).rejects.toThrow(); });
});
