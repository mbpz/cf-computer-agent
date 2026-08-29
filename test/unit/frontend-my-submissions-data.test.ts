// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMySubmissionsRequestController, loadMySubmissionsPage } from "../../frontend/lib/my-submissions-data";

describe("frontend my submissions data", () => {
  it("requests a numbered status page and keeps owner-safe review fields", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/submissions/mine?page=1&pageSize=20&status=rejected");
      return Response.json({ items: [{ id: "s-2", title: "Rejected guide", status: "rejected", review: { decision: "rejected", reasonCode: "duplicate", note: "已有正式条目", reviewerId: "admin-secret" } }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await expect(loadMySubmissionsPage({ page: 1, pageSize: 20, status: "rejected", requester })).resolves.toEqual({
      items: [{ id: "s-2", title: "Rejected guide", status: "rejected", review: { decision: "rejected", reasonCode: "duplicate", note: "已有正式条目" } }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
  });

  it("cancels stale numbered list requests", async () => {
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createMySubmissionsRequestController(requester);
    const first = controller.request({ page: 1, pageSize: 20 });
    const second = controller.request({ page: 2, pageSize: 20 });
    expect(controller.isCurrent(first.generation)).toBe(false);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.dispose();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
