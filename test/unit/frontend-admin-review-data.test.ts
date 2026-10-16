// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadReviewQueuePage, createReviewQueueRequestController } from "../../frontend/lib/admin-review-data";

describe("frontend admin review data", () => {
  it("requests only pending reviews and normalizes rows", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/admin/submissions?page=2&pageSize=20&status=review_pending");
      return new Response(JSON.stringify({ items: [{ id: "s-1", title: "Guide", submitterId: "member-1", status: "review_pending" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } }), { status: 200 });
    });
    await expect(loadReviewQueuePage({ page: 2, pageSize: 20, requester })).resolves.toEqual({ items: [{ id: "s-1", title: "Guide", submitter: "member-1", status: "review_pending" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
  });

  it("invalidates stale queue requests", async () => {
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createReviewQueueRequestController(requester);
    const first = controller.request({ page: 1, pageSize: 20 });
    const second = controller.request({ page: 2, pageSize: 20 });
    expect(controller.isCurrent(first.generation)).toBe(false);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.dispose();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps the submission version the queue decision is made against", async () => {
    const page = (item: Record<string, unknown>) => new Response(JSON.stringify({ items: [item], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }), { status: 200 });
    const queue = await loadReviewQueuePage({
      page: 1, pageSize: 20,
      requester: async () => page({ id: "s-1", title: "Guide", submitterId: "member-1", status: "review_pending", updatedAt: "2026-08-22T00:00:00.000Z" }),
    });
    expect(queue.items[0]).toEqual({
      id: "s-1", title: "Guide", submitter: "member-1", status: "review_pending", updatedAt: "2026-08-22T00:00:00.000Z",
    });
    // Without the version the row is still usable, but a malformed one must fail
    // the read rather than let the queue decide without a precondition.
    const withoutVersion = await loadReviewQueuePage({
      page: 1, pageSize: 20,
      requester: async () => page({ id: "s-2", title: "Guide", submitterId: "member-1", status: "review_pending" }),
    });
    expect(withoutVersion.items[0]?.updatedAt).toBeUndefined();
    await expect(loadReviewQueuePage({
      page: 1, pageSize: 20,
      requester: async () => page({ id: "s-3", title: "Guide", submitterId: "member-1", status: "review_pending", updatedAt: "2026-08-22" }),
    })).rejects.toThrow("NUMBERED_PAGE_RESPONSE_INVALID");
  });
});
