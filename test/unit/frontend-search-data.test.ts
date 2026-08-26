// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadSearchPage, createSearchRequestController } from "../../frontend/lib/search-data";

describe("frontend search data", () => {
  it("requests bounded encoded queries and normalizes citation locations", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("q=title+%2F+body");
      return new Response(JSON.stringify({ degraded: true, items: [{ knowledgeItemId: "k-1", citationId: "c-1", title: "Guide", excerpt: "Excerpt", matchedFields: ["title", "unsafe", "code"] }] }), { status: 200 });
    });
    await expect(loadSearchPage({ query: "  title / body  ", requester })).resolves.toEqual({
      degraded: true,
      nextCursor: null,
      items: [{ id: "c-1", knowledgeItemId: "k-1", title: "Guide", snippet: "Excerpt", href: "/knowledge/k-1#c-1", matchedFields: ["title", "code"] }],
    });
  });

  it("fails closed on malformed hits and preserves an opaque cursor", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ items: [null, {}, { knowledgeItemId: "" }, { knowledgeItemId: "k-2" }], nextCursor: "v1.cursor" }), { status: 200 }));
    await expect(loadSearchPage({ query: "q", cursor: "v1.previous", requester })).resolves.toMatchObject({
      nextCursor: "v1.cursor",
      items: [{ id: "k-2", knowledgeItemId: "k-2", href: "/knowledge/k-2" }],
    });
  });

  it("cancels the previous request and invalidates late results", async () => {
    const requester = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createSearchRequestController(requester);
    const first = controller.request("first");
    const second = controller.request("second");
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.cancel();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(controller.isCurrent(second.generation)).toBe(false);
  });
});
