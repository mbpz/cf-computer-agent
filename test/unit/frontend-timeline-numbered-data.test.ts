import { describe, expect, it } from "vitest";
import { loadNumberedProjectTimeline } from "../../frontend/lib/projects-data";
const stamp = "2026-09-27T00:00:00.000Z";
const item = { id: "row", projectId: "a", clientKey: "row", kind: "meeting", title: "Private", body: "Notes", status: "open", startsAt: null, dueAt: null, createdAt: stamp, updatedAt: stamp };
const valid = () => ({ items: [item], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
describe("strict numbered timeline data", () => {
  it("sends only numbered parameters and propagates cancellation", async () => {
    const controller = new AbortController();
    const result = await loadNumberedProjectTimeline("a", { page: 2, pageSize: 20 }, async (url, init) => {
      expect(String(url)).toBe("/api/projects/a/timeline?page=2&pageSize=20"); expect(init?.signal).toBe(controller.signal);
      return Response.json(valid());
    }, controller.signal);
    expect(result).toEqual(valid());
  });
  it.each([
    { ...valid(), items: [{ ...item, projectId: "other" }] },
    { ...valid(), items: [{ ...item, kind: "other" }] },
    { ...valid(), items: [{ ...item, status: "other" }] },
    { ...valid(), items: [] },
    { ...valid(), items: [item, item], pagination: { page: 2, pageSize: 20, total: 22, totalPages: 2 } },
    { ...valid(), pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
    { ...valid(), pagination: { page: 2, pageSize: 50, total: 51, totalPages: 2 } },
    { ...valid(), pagination: { page: 2, pageSize: 20, total: 21, totalPages: 3 } },
    { ...valid(), pagination: { page: 2, pageSize: 20, total: "21", totalPages: 2 } },
    { items: [item], nextCursor: "legacy" },
  ])("rejects wrong scope, duplicate rows or malformed/mismatched metadata %#", async value => {
    await expect(loadNumberedProjectTimeline("a", { page: 2, pageSize: 20 }, async () => Response.json(value))).rejects.toThrow();
  });
});
