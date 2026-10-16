// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMySubmissionsRequestController, loadMySubmissionsPage, normalizeSubmissionRange, parseSubmissionRange, submissionResubmitSource, writeSubmissionRange } from "../../frontend/lib/my-submissions-data";

const pageBody = { items: [{ id: "s-1", title: "Guide", status: "review_pending" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };

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

  it("sends the stated submission-time window next to the status filter", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "https://app.test");
      expect(url.pathname).toBe("/api/submissions/mine");
      expect(Object.fromEntries(url.searchParams)).toEqual({ page: "2", pageSize: "50", status: "published", from: "2026-10-01", to: "2026-10-31T12:00:00.000Z" });
      return Response.json(pageBody);
    });
    await expect(loadMySubmissionsPage({ page: 2, pageSize: 50, status: "published", from: "2026-10-01", to: "2026-10-31T12:00:00.000Z", requester })).resolves.toEqual({ items: pageBody.items, pagination: pageBody.pagination });
  });

  it("drops a malformed bound instead of forwarding it", async () => {
    const url = vi.fn(async (input: string | URL | Request) => {
      expect(Object.fromEntries(new URL(String(input), "https://app.test").searchParams)).toEqual({ page: "1", pageSize: "20", to: "2026-10-31" });
      return Response.json(pageBody);
    });
    await expect(loadMySubmissionsPage({ page: 1, pageSize: 20, from: "2026-13-45", to: "2026-10-31", requester: url })).resolves.toMatchObject({ items: pageBody.items });
  });

  it("refuses an empty interval before any request leaves the client", async () => {
    const requester = vi.fn(async () => Response.json(pageBody));
    await expect(loadMySubmissionsPage({ page: 1, pageSize: 20, from: "2026-10-20", to: "2026-10-01", requester })).rejects.toThrow("SUBMISSION_RANGE_INVALID");
    // The end day is covered, so an equal pair is a valid single day, not an empty one.
    await expect(loadMySubmissionsPage({ page: 1, pageSize: 20, from: "2026-10-01", to: "2026-10-01", requester })).resolves.toMatchObject({ items: pageBody.items });
    expect(requester).toHaveBeenCalledTimes(1);
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

  it("keeps a returned row's own source and the supersede link the list renders from", async () => {
    const requester = vi.fn(async () => Response.json({ items: [
      { id: "resubmitted", title: "Revision", status: "review_pending", supersedesSubmissionId: "returned" },
      { id: "returned", title: "Returned guide", status: "revision_requested", kind: "markdown", content: "# Body", requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared", review: { decision: "revision_requested", reasonCode: "needs_revision", note: "Add sources." } },
      { id: "partial", title: "Partial", status: "revision_requested", kind: "markdown" },
    ], pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 } }));
    const page = await loadMySubmissionsPage({ page: 1, pageSize: 20, requester });
    expect(page.items[0]).toEqual({ id: "resubmitted", title: "Revision", status: "review_pending", supersedes: "returned" });
    // A row without its complete own source offers no editing payload.
    expect(page.items[2]).toEqual({ id: "partial", title: "Partial", status: "revision_requested" });
    const returned = page.items[1]!;
    expect(returned.source).toEqual({ kind: "markdown", content: "# Body", target: { requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared" } });
    expect(submissionResubmitSource(returned)).toEqual({
      id: "returned", title: "Returned guide", kind: "markdown", content: "# Body",
      target: { requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared" },
      reviewNote: "Add sources.",
    });
    expect(submissionResubmitSource(page.items[0]!)).toBeNull();
    expect(submissionResubmitSource(page.items[2]!)).toBeNull();
  });
});

describe("frontend submission-time filter", () => {
  it("reads a stated range, clearing values the server would reject", () => {
    expect(parseSubmissionRange("?from=2026-10-01&to=2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-10-31", invalid: false });
    expect(parseSubmissionRange("?from=2026-02-30&to=2026-02-30T00:00:00.000Z")).toEqual({ from: "", to: "", invalid: false });
    expect(parseSubmissionRange("?from=nope&to=2026-10-31")).toEqual({ from: "", to: "2026-10-31", invalid: false });
    expect(parseSubmissionRange("?from=2026-10-01&from=2026-10-02")).toEqual({ from: "", to: "", invalid: false });
    expect(parseSubmissionRange("?status=review_pending")).toEqual({ from: "", to: "", invalid: false });
  });

  it("reports an empty half-open interval and keeps an equal pair valid", () => {
    expect(normalizeSubmissionRange("2026-10-20", "2026-10-20T00:00:00.000Z")).toMatchObject({ invalid: true });
    expect(normalizeSubmissionRange("2026-10-31", "2026-10-31")).toMatchObject({ invalid: false });
    expect(normalizeSubmissionRange("2026-10-01", "2026-10-02")).toMatchObject({ invalid: false });
    expect(normalizeSubmissionRange("2026-10-01T12:00:00.000Z", "2026-10-01")).toMatchObject({ invalid: false });
  });

  it("writes the range at page one without dropping the other filters", () => {
    expect(writeSubmissionRange("?status=rejected&page=3&pageSize=50", { from: "2026-10-01", to: "2026-10-31" })).toBe("?status=rejected&pageSize=50&from=2026-10-01&to=2026-10-31");
    expect(writeSubmissionRange("?status=rejected&from=2026-10-01&to=2026-10-31&page=2", { from: "2026-11-01", to: "" })).toBe("?status=rejected&from=2026-11-01");
    expect(writeSubmissionRange("?from=2026-10-01", { from: "", to: "" })).toBe("");
  });
});
