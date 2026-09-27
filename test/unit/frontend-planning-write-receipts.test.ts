// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadGoal, setGoalProgress, setGoalStatus } from "../../frontend/lib/goals-data";
import { setProjectStatus } from "../../frontend/lib/projects-data";
import type { Fetcher } from "../../frontend/lib/api";
const old = "2026-09-27T00:00:00.000Z", next = "2026-09-27T00:00:00.001Z";
const entity = { id: "row", clientKey: "row", title: "Current", description: null, status: "completed", progress: 75, targetAt: null, createdAt: old, updatedAt: next };
const cases = [
  { name: "goal status", path: "/api/goals/row/status", body: { status: "completed", expectedUpdatedAt: old }, call: (fetcher: Fetcher) => setGoalStatus("row", "completed", old, fetcher), wrong: { status: "active" } },
  { name: "goal progress", path: "/api/goals/row/progress", body: { progress: 75, expectedUpdatedAt: old }, call: (fetcher: Fetcher) => setGoalProgress("row", 75, old, fetcher), wrong: { progress: 74 } },
  { name: "project status", path: "/api/projects/row/status", body: { status: "completed", expectedUpdatedAt: old }, call: (fetcher: Fetcher) => setProjectStatus("row", "completed", old, fetcher), wrong: { status: "active" } },
];
for (const c of cases) describe(c.name, () => {
  it("sends the conditional write and accepts only a matching advanced receipt", async () => {
    const calls: unknown[] = [];
    const result = await c.call(async (path, init) => { calls.push({ path, method: init?.method, body: JSON.parse(String(init?.body)), credentials: init?.credentials }); return Response.json(entity); });
    expect(calls).toEqual([{ path: c.path, method: "POST", body: c.body, credentials: "same-origin" }]); expect(result).toEqual(entity);
  });
  it.each([null, {}, { ...entity, id: "other" }, { ...entity, updatedAt: old }, { ...entity, updatedAt: "invalid" }, { ...entity, updatedAt: "2026-09-26T00:00:00.000Z" }])("rejects missing, mismatched or stale receipts %#", async body => {
    await expect(c.call(async () => Response.json(body))).rejects.toThrow();
  });
  it("rejects a receipt for a different desired value and an empty success", async () => {
    await expect(c.call(async () => Response.json({ ...entity, ...c.wrong }))).rejects.toThrow();
    await expect(c.call(async () => new Response(null, { status: 204 }))).rejects.toThrow();
  });
});
it("validates the goal target identity for recovery and uses GET with cancellation", async () => {
  const controller = new AbortController(); const calls: unknown[] = [];
  expect(await loadGoal("row", async (path, init) => { calls.push({ path, method: init?.method, signal: init?.signal }); return Response.json(entity); }, controller.signal)).toEqual(entity);
  expect(calls).toEqual([{ path: "/api/goals/row", method: undefined, signal: controller.signal }]);
  await expect(loadGoal("row", async () => Response.json({ ...entity, id: "other" }))).rejects.toThrow();
  await expect(loadGoal("row", async () => Response.json({}))).rejects.toThrow();
});
