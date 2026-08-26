// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadMySubmissionsPage, createMySubmissionsRequestController } from "../../frontend/lib/my-submissions-data";

describe("frontend my submissions data", () => {
  it("requests an opaque cursor page and filters malformed rows", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/submissions/mine?limit=20&cursor=v1.previous");
      return new Response(JSON.stringify({ items: [null, { id: "s-1", title: "Guide", status: "review_pending" }, { id: "" }], nextCursor: "v1.next" }), { status: 200 });
    });
    await expect(loadMySubmissionsPage({ cursor: "v1.previous", requester })).resolves.toEqual({ items: [{ id: "s-1", title: "Guide", status: "review_pending" }], nextCursor: "v1.next" });
  });

  it("keeps only the owner-safe review reason fields", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ items: [
      {
        id: "s-2",
        title: "Rejected guide",
        status: "rejected",
        review: {
          decision: "rejected",
          reasonCode: "duplicate",
          note: "已有正式条目",
          createdAt: "2026-08-26T00:00:00.000Z",
          reviewerId: "admin-secret",
        },
      },
      { id: "s-3", status: "rejected", review: { decision: "rejected", reasonCode: "forged", note: "ignore" } },
    ] }), { status: 200 }));

    await expect(loadMySubmissionsPage({ requester })).resolves.toMatchObject({
      items: [{
        id: "s-2",
        review: { decision: "rejected", reasonCode: "duplicate", note: "已有正式条目" },
      }, { id: "s-3" }],
    });
    await expect(loadMySubmissionsPage({ requester })).resolves.not.toMatchObject({ items: [{ review: { reviewerId: expect.anything() } }] });
  });

  it("cancels stale list requests", async () => {
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createMySubmissionsRequestController(requester);
    const first = controller.request();
    const second = controller.request("v1.cursor");
    expect(controller.isCurrent(first.generation)).toBe(false);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.cancel();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
