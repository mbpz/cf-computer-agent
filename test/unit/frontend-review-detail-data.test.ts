// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadReviewDetail, normalizeReviewPreview, submitReviewDecision } from "../../frontend/components/review/review-detail-data";

function preview() {
  return {
    submissionId: "sub-1", submitterId: "member-1", status: "review_pending",
    requestedSpaceId: "space-1", requestedCollectionId: null, requestedVisibility: "shared",
    title: "Cloudflare guide", rawContent: "raw fallback",
    sourceVersion: { id: "source-1", kind: "markdown", content: "# Guide\n\nBody", parserVersion: "m1" },
    safety: { status: "warning", findings: [{ code: "unsafe_link", message: "Review link" }] },
    chunks: [],
  };
}

describe("review detail data boundary", () => {
  it("normalizes preview data and preserves the server-approved publish target", () => {
    const result = normalizeReviewPreview(preview());
    expect(result).toMatchObject({
      detail: { id: "sub-1", title: "Cloudflare guide", content: "# Guide\n\nBody", warnings: ["unsafe_link: Review link"] },
      publish: { title: "Cloudflare guide", visibility: "shared", spaceId: "space-1", collectionId: null, tagIds: [] },
    });
    expect(JSON.stringify(result)).not.toContain("undefined");
  });

  it("loads a detail through the admin preview endpoint", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const result = await loadReviewDetail("sub-1", async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ preview: preview() }), { status: 200, headers: { "content-type": "application/json" } });
    });
    expect(String(calls[0]?.input)).toContain("/api/admin/submissions/sub-1");
    expect(calls[0]?.init).toMatchObject({ credentials: "same-origin" });
    expect(result.detail.id).toBe("sub-1");
  });

  it("rejects malformed preview responses instead of rendering partial data", async () => {
    await expect(loadReviewDetail("sub-1", async () => new Response(JSON.stringify({ preview: { submissionId: "" } }), { status: 200 }))).rejects.toThrow("REVIEW_DETAIL_INVALID");
  });

  it("publishes with the approved target and maps decision endpoints", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const requester = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };
    await submitReviewDecision("sub-1", "publish", { title: "Cloudflare guide", visibility: "shared", spaceId: "space-1", collectionId: null, tagIds: [] }, requester);
    await submitReviewDecision("sub-1", "request_changes", { title: "x", visibility: "shared", spaceId: "s", collectionId: null, tagIds: [] }, requester);
    await submitReviewDecision("sub-1", "reject", { title: "x", visibility: "shared", spaceId: "s", collectionId: null, tagIds: [] }, requester);
    expect(String(calls[0]?.input)).toContain("/api/admin/submissions/sub-1/publish");
    expect(String(calls[1]?.input)).toContain("/api/admin/submissions/sub-1/request-revision");
    expect(String(calls[2]?.input)).toContain("/api/admin/submissions/sub-1/reject");
    const body = (index: number) => new Request(new URL(String(calls[index]!.input), "https://memory-garden.test"), calls[index]!.init).json();
    expect(await body(0)).toMatchObject({ title: "Cloudflare guide", spaceId: "space-1" });
    expect(await body(1)).toEqual({ reasonCode: "needs_revision", note: "" });
    expect(await body(2)).toEqual({ reasonCode: "not_relevant", note: "" });
  });
});
