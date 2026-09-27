import { describe, expect, it } from "vitest";
import { loadProjectRelations, setProjectRelation } from "../../frontend/lib/project-relations-data";
const page = { projectId: "p", kind: "goals", items: [{ id: "g", title: "Goal", linked: false }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
describe("project relation response contracts", () => {
  it.each([{ projectId: "foreign" }, { kind: "tasks" }, { items: [{ id: "g", title: "Goal", linked: 1 }] }, { items: [{ id: "", title: "Goal", linked: false }] }, { pagination: { page: 2, pageSize: 20, total: 1, totalPages: 1 } }, { items: [{ id: "g", title: "A", linked: true }, { id: "g", title: "B", linked: false }], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } }])("rejects mismatched or malformed data %j", async patch => {
    await expect(loadProjectRelations("p", "goals", { page: 1, pageSize: 20 }, async () => Response.json({ ...page, ...patch }))).rejects.toThrow();
  });
  it("accepts exact page and refuses invalid write receipts", async () => {
    await expect(loadProjectRelations("p", "goals", { page: 1, pageSize: 20 }, async () => Response.json(page))).resolves.toEqual(page);
    await expect(setProjectRelation("p", "goals", "g", true, async () => Response.json({ linked: true }))).rejects.toThrow();
    await expect(setProjectRelation("p", "tasks", "t", false, async () => new Response(null, { status: 204 }))).rejects.toThrow();
  });
});
