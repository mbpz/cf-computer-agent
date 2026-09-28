import { describe, expect, it, vi } from "vitest";
import { promoteInboxTask } from "../../frontend/lib/inbox-data";
const version = "2026-09-28T00:00:00.000Z";
const row = { id: "one", clientKey: "key", kind: "text", content: "Private", sourceUrl: null, status: "promoted", promotedTaskId: "task-1", promotedSubmissionId: null, createdAt: version, updatedAt: "2026-09-28T00:00:00.001Z" };
const receipt = { item: row, taskId: "task-1", promoted: true };
describe("inbox promotion receipt", () => {
  it("sends only the selected ID and exact observed version", async () => {
    expect(await promoteInboxTask("one", version, async (url, init) => {
      expect(url).toBe("/api/inbox/one/promote/task"); expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ expectedUpdatedAt: version }); return Response.json(receipt);
    })).toEqual(receipt);
  });
  it.each([{ taskId: "other" }, { promoted: "yes" }, { item: { ...row, id: "other" } }, { item: { ...row, status: "inbox" } }, { item: { ...row, promotedSubmissionId: "submission" } }, { item: { ...row, updatedAt: version } }, { taskId: "../bad", item: { ...row, promotedTaskId: "../bad" } }])("rejects malformed or mismatching receipt %#", async patch => {
    await expect(promoteInboxTask("one", version, async () => Response.json({ ...receipt, ...patch }))).rejects.toThrow();
  });
  it("accepts an owned replay at the same current version", async () => {
    expect((await promoteInboxTask("one", row.updatedAt, async () => Response.json({ ...receipt, promoted: false }))).promoted).toBe(false);
  });
  it("rejects invalid outgoing input before network access", async () => {
    const fetcher = vi.fn(); await expect(promoteInboxTask("../one", version, fetcher)).rejects.toThrow();
    await expect(promoteInboxTask("one", "bad", fetcher)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
});
