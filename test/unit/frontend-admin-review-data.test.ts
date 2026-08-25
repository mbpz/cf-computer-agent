// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadReviewQueuePage, createReviewQueueRequestController } from "../../frontend/lib/admin-review-data";

describe("frontend admin review data", () => {
  it("requests only pending reviews and normalizes rows", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/admin/submissions?limit=20&status=review_pending");
      return new Response(JSON.stringify({ items: [{ id: "s-1", title: "Guide", submitterId: "member-1", status: "review_pending" }, {}, null], nextCursor: "v1.next" }), { status: 200 });
    });
    await expect(loadReviewQueuePage({ requester })).resolves.toEqual({ items: [{ id: "s-1", title: "Guide", submitter: "member-1", status: "review_pending" }], nextCursor: "v1.next" });
  });

  it("invalidates stale queue requests", async () => {
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createReviewQueueRequestController(requester);
    const first = controller.request();
    const second = controller.request("v1.cursor");
    expect(controller.isCurrent(first.generation)).toBe(false);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.cancel();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
