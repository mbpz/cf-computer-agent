import { describe, expect, it } from "vitest";
import { loadInboxNumbered } from "../../frontend/lib/inbox-data";
const item = { id: "one", clientKey: "key", kind: "text", content: "Private", status: "inbox", sourceUrl: null, promotedTaskId: null, promotedSubmissionId: null, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" };
const page = () => ({ items: [item], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
describe("inbox numbered response contract", () => {
  it("sends numbered filters, credentials and the cancellation signal", async () => {
    const signal = new AbortController().signal;
    const result = await loadInboxNumbered({ page: 1, pageSize: 20, status: "inbox" }, async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      expect(Object.fromEntries(url.searchParams)).toEqual({ page: "1", pageSize: "20", status: "inbox" });
      expect(init?.signal).toBe(signal); expect(init?.credentials).toBe("same-origin");
      return Response.json(page());
    }, signal);
    expect(result.items).toEqual([item]); expect(result.pagination.total).toBe(1);
  });
  it.each([
    ["missing pagination", { items: [item] }],
    ["wrong page", { items: [], pagination: { page: 2, pageSize: 20, total: 1, totalPages: 1 } }],
    ["wrong size", { items: [item], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } }],
    ["wrong total", { ...page(), pagination: { ...page().pagination, total: 2 } }],
    ["duplicate ids", { items: [item, item], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } }],
    ["invalid row", { ...page(), items: [{ ...item, kind: "invalid" }] }],
    ["blank id", { ...page(), items: [{ ...item, id: "" }] }],
    ["missing date", { ...page(), items: [{ ...item, createdAt: null }] }],
    ["malformed nullable field", { ...page(), items: [{ ...item, sourceUrl: 42 }] }],
    ["filter mismatch", { ...page(), items: [{ ...item, status: "archived" }] }],
  ])("rejects %s", async (_, payload) => {
    await expect(loadInboxNumbered({ page: 1, pageSize: 20, status: "inbox" }, async () => Response.json(payload))).rejects.toThrow();
  });
  it("preserves empty beyond-last pages and true totals", async () => {
    const payload = { items: [], pagination: { page: 4, pageSize: 20, total: 43, totalPages: 3 } };
    await expect(loadInboxNumbered({ page: 4, pageSize: 20 }, async () => Response.json(payload))).resolves.toEqual(payload);
  });
  it("rejects invalid query windows before fetching", async () => {
    let calls = 0;
    await expect(loadInboxNumbered({ page: 501, pageSize: 20 }, async () => { calls++; return Response.json(page()); })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
