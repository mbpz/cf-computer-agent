import { describe, expect, it } from "vitest";
import { editProjectTimeline, type ProjectTimelineItem } from "../../frontend/lib/projects-data";
const original: ProjectTimelineItem = { id: "row", projectId: "project", clientKey: "intent", kind: "meeting", title: "Old", body: "", status: "open", startsAt: null, dueAt: null, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" };
const content = { kind: "decision" as const, title: " New ", body: "Details", startsAt: null, dueAt: null };
const receipt = { ...original, ...content, title: "New", updatedAt: "2026-09-27T00:00:00.001Z" };
describe("timeline edit strict receipt contract", () => {
  it("sends only editable fields and the displayed version in a PATCH", async () => {
    const result = await editProjectTimeline("project", original, content, async (url, init) => {
      expect(url).toBe("/api/projects/project/timeline/row"); expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ ...content, expectedUpdatedAt: original.updatedAt });
      return Response.json(receipt);
    }); expect(result).toEqual(receipt);
  });
  it.each([{ id: "other" }, { projectId: "other" }, { clientKey: "other" }, { status: "done" }, { kind: "milestone" }, { title: "Wrong" }, { body: "Wrong" }, { startsAt: "2026-09-27T00:00:00.000Z" }, { dueAt: "2026-09-27T00:00:00.000Z" }, { startsAt: 123 }, { dueAt: false }, { createdAt: "changed" }, { updatedAt: original.updatedAt }, { updatedAt: "2026-09-27T00:00:01Z" }])("rejects mismatched or malformed receipt %#", async patch => {
    await expect(editProjectTimeline("project", original, content, async () => Response.json({ ...receipt, ...patch }))).rejects.toThrow("PROJECT_TIMELINE_EDIT_RECEIPT_INVALID");
  });
});
