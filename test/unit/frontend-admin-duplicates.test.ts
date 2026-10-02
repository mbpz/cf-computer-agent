// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAdminDuplicateRequestController, decideAdminDuplicate, loadAdminDuplicate, loadAdminDuplicatePage } from "../../frontend/lib/admin-duplicates-data";

describe("frontend admin duplicate data", () => {
  it("normalizes a numbered pending-candidate page", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/admin/duplicates?page=1&pageSize=20");
      return new Response(JSON.stringify({ items: [
        { submissionId: "s-1", canonicalSubmissionId: "s-0", canonicalSourceId: "src-0", canonicalSourceVersionId: "ver-0", submissionTitle: "New", canonicalTitle: "Old", decision: "pending" },
      ], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }), { status: 200 });
    });
    await expect(loadAdminDuplicatePage({ page: 1, pageSize: 20, requester })).resolves.toEqual({ items: [{
      submissionId: "s-1", canonicalSubmissionId: "s-0", canonicalSourceId: "src-0", canonicalSourceVersionId: "ver-0", submissionTitle: "New", canonicalTitle: "Old", decision: "pending",
    }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
  });

  it("posts an allowlisted decision and rejects malformed response", async () => {
    const requester = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ decision: "associate" }));
      return new Response(JSON.stringify({ candidate: { submissionId: "s-1", canonicalSubmissionId: "s-0", canonicalSourceId: "src-0", canonicalSourceVersionId: "ver-0", submissionTitle: "New", canonicalTitle: "Old", decision: "associate" } }), { status: 200 });
    });
    await expect(decideAdminDuplicate("s-1", "associate", requester)).resolves.toMatchObject({ decision: "associate" });
    await expect(decideAdminDuplicate("bad id", "reject", requester)).rejects.toThrow("DUPLICATE_REQUEST_INVALID");
  });

  it.each(["pending", "associate", "keep_separate", "reject"] as const)("reads a validated %s candidate without writing", async decision => {
    const candidate = {submissionId: "s-1", canonicalSubmissionId: "s-0", canonicalSourceId: "src-0", canonicalSourceVersionId: "ver-0", submissionTitle: "New", canonicalTitle: "Old", decision};
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/admin/duplicates/s-1"); expect(init?.method ?? "GET").toBe("GET"); expect(init?.body).toBeUndefined();
      return new Response(JSON.stringify({candidate}));
    });
    await expect(loadAdminDuplicate("s-1", requester)).resolves.toEqual(candidate);
    await expect(loadAdminDuplicate("../other", requester)).rejects.toThrow("DUPLICATE_REQUEST_INVALID"); expect(requester).toHaveBeenCalledTimes(1);
  });
  it.each(["wrong-id", "missing", "malformed", "unknown-decision"])("rejects a %s detail response", async failure => {
    const candidate = {submissionId: "s-1", canonicalSubmissionId: "s-0", canonicalSourceId: "src-0", canonicalSourceVersionId: "ver-0", submissionTitle: "New", canonicalTitle: "Old", decision: "pending"};
    if (failure === "wrong-id") candidate.submissionId = "other";
    if (failure === "malformed") candidate.canonicalSourceId = " ";
    if (failure === "unknown-decision") candidate.decision = "published";
    await expect(loadAdminDuplicate("s-1", async () => new Response(JSON.stringify(failure === "missing" ? {} : {candidate})))).rejects.toThrow("DUPLICATE_RESPONSE_INVALID");
  });

  it("invalidates stale paginated requests", async () => {
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createAdminDuplicateRequestController(requester);
    const first = controller.request({ page: 1, pageSize: 20 });
    const second = controller.request({ page: 2, pageSize: 20 });
    expect(controller.isCurrent(first.generation)).toBe(false);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.dispose();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
