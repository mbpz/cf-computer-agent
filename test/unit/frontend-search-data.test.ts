// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createSearchRequestController, loadSearchPage } from "../../frontend/lib/search-data";

describe("frontend search data", () => {
  it("requests a numbered encoded query with filters and normalizes citations", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/knowledge/search?q=title+%2F+body&page=2&pageSize=20&tagId=tag-a&tagId=tag-b&tagMode=and");
      return Response.json({ degraded: true, items: [{ knowledgeItemId: "k-1", citationId: "c-1", title: "Guide", excerpt: "Excerpt", matchedFields: ["title", "unsafe", "code"] }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
    });
    await expect(loadSearchPage({ query: "  title / body  ", page: 2, pageSize: 20, tagIds: ["tag-a", "tag-b"], tagMode: "and", requester })).resolves.toEqual({
      degraded: true, pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 }, items: [{ id: "c-1", knowledgeItemId: "k-1", title: "Guide", snippet: "Excerpt", href: "/knowledge/k-1#c-1", matchedFields: ["title", "code"] }],
    });
  });

  it("cancels the previous numbered search and invalidates late results", async () => {
    const requester = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createSearchRequestController(requester);
    const first = controller.request({ query: "first", page: 1, pageSize: 20 });
    const second = controller.request({ query: "second", page: 1, pageSize: 20 });
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.dispose();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
