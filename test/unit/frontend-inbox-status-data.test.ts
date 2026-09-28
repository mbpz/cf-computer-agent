import { describe, expect, it, vi } from "vitest";
import { loadInboxItem, updateInboxStatus } from "../../frontend/lib/inbox-data";
const version = "2026-09-28T00:00:00.000Z";
const row = { id: "one", clientKey: "key", kind: "text", content: "Private", sourceUrl: null, status: "archived", promotedTaskId: null, promotedSubmissionId: null, createdAt: version, updatedAt: "2026-09-28T00:00:00.001Z" };
describe("inbox conditional status receipts", () => {
  it("sends the exact conditional write and validates the owned readback", async () => {
    expect(await updateInboxStatus("one", "archived", version, async (url, init) => {
      expect(url).toBe("/api/inbox/one"); expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ status: "archived", expectedUpdatedAt: version }); return Response.json(row);
    })).toEqual(row);
    const signal = new AbortController().signal;
    expect(await loadInboxItem("one", async (url, init) => { expect(url).toBe("/api/inbox/one"); expect(init?.signal).toBe(signal); expect(init?.method ?? "GET").toBe("GET"); return Response.json(row); }, signal)).toEqual(row);
  });
  it.each([{ id: "other" }, { status: "inbox" }, { updatedAt: version }, { updatedAt: "2026-09-28" }, { updatedAt: "invalid" }, { promotedTaskId: 3 }])("rejects malformed or unadvanced receipt %#", async patch => {
    await expect(updateInboxStatus("one", "archived", version, async () => Response.json({ ...row, ...patch }))).rejects.toThrow();
  });
  it.each([{ id: "other" }, { updatedAt: "2026-09-28" }, { updatedAt: "bad" }])("rejects a mismatching GET %#", async patch => {
    await expect(loadInboxItem("one", async () => Response.json({ ...row, ...patch }))).rejects.toThrow();
  });
  it("rejects invalid outgoing identity/version before fetch", async () => {
    const request = vi.fn();
    await expect(updateInboxStatus("one", "archived", "bad", request)).rejects.toThrow();
    await expect(updateInboxStatus("../one", "archived", version, request)).rejects.toThrow();
    await expect(loadInboxItem("../one", request)).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  });
});
