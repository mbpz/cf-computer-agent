// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadReviewDetail, normalizeReviewPreview, submitReviewDecision, prepareReviewDecision, sendReviewDecision } from "../../frontend/components/review/review-detail-data";

const publish = { title: "Cloudflare guide", visibility: "shared" as const, spaceId: "space-1", collectionId: null, tagIds: [] };
const json = (value: unknown) => new Response(JSON.stringify(value));

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
  it.each([
    { path: "/api/admin/members" },
    { path: "https://external.invalid/capture" },
    { id: "sub-other" },
    { id: "../sub-1" },
    { action: "publish" as const },
  ])("rejects an inconsistent replay target before any request (%j)", async (change) => {
    const operation = prepareReviewDecision("sub-1", "reject", publish);
    const requester = vi.fn(async () => json({ decision: { submissionId: "sub-1", decision: "rejected" } }));
    await expect(sendReviewDecision({ ...operation, ...change }, requester)).rejects.toThrow("REVIEW_OPERATION_INVALID");
    expect(requester).not.toHaveBeenCalled();
  });

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

  it("rejects a valid preview for a different submission", async () => {
    await expect(loadReviewDetail("sub-other", async () => new Response(JSON.stringify({ preview: preview() })))).rejects.toThrow("REVIEW_DETAIL_INVALID");
  });

  it("passes cancellation to the actual detail request", async () => {
    const controller = new AbortController(); let received: AbortSignal | null | undefined;
    const data = await loadReviewDetail("sub-1", async (_input, init) => { received = init?.signal; return new Response(JSON.stringify({ preview: preview() })); }, controller.signal);
    expect(data.detail.id).toBe("sub-1"); expect(received).toBe(controller.signal);
  });

  it("publishes with the approved target and maps decision endpoints", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const requester = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input, init });
      return json(String(input).endsWith("/publish")
        ? { revision: { id: "rev-1", knowledgeItemId: "ki-1", searchStatus: "pending" } }
        : { decision: { submissionId: "sub-1", decision: String(input).endsWith("/reject") ? "rejected" : "revision_requested" } });
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

  it.each(["pending", "indexed", "search_degraded", "failed"])("preserves the authoritative %s indexing receipt", async (searchStatus) => {
    expect(await submitReviewDecision("sub-1", "publish", publish, async () => json({ revision: { id: "rev-1", knowledgeItemId: "ki-1", searchStatus } })))
      .toEqual({ action: "publish", status: "published", revisionId: "rev-1", knowledgeItemId: "ki-1", searchStatus });
  });

  it.each([{}, { revision: {} }, { revision: { id: "rev-1", searchStatus: "pending" } }, { revision: { id: "", knowledgeItemId: "ki-1", searchStatus: "indexed" } }, { revision: { id: "rev-1", knowledgeItemId: "ki-1", searchStatus: "unknown" } }])("rejects malformed publish success %j", async (value) => {
    await expect(submitReviewDecision("sub-1", "publish", publish, async () => json(value))).rejects.toThrow("REVIEW_RECEIPT_INVALID");
  });

  it.each([undefined, {}, { decision: { submissionId: "sub-2", decision: "rejected" } }, { decision: { submissionId: "sub-1", decision: "revision_requested" } }])("rejects missing or mismatched decision receipt %j", async (value) => {
    await expect(submitReviewDecision("sub-1", "reject", publish, async () => json(value))).rejects.toThrow("REVIEW_RECEIPT_INVALID");
  });

  it("serializes a frozen payload and replays it without observing later input changes", async () => {
    const details = { reasonCode: "duplicate" as const, note: "  重复资料，请核对  " };
    const operation = prepareReviewDecision("sub-1", "reject", publish, details);
    details.note = "changed";
    const bodies: unknown[] = [];
    const requester = async (_: unknown, init?: RequestInit) => { bodies.push(init?.body); return json({ decision: { submissionId: "sub-1", decision: "rejected" } }); };
    await sendReviewDecision(operation, requester); await sendReviewDecision(operation, requester);
    expect(Object.isFrozen(operation)).toBe(true);
    expect(bodies[0]).toBe(bodies[1]); expect(JSON.parse(String(bodies[0]))).toEqual({ reasonCode: "duplicate", note: "  重复资料，请核对  " });
  });

  it.each(["中".repeat(1334), "bad\u0000note", "bad\ud800", "bad\udc00"])("rejects notes outside the server contract", (note) => {
    expect(() => prepareReviewDecision("sub-1", "reject", publish, { reasonCode: "unsafe", note })).toThrow("REVIEW_NOTE_INVALID");
  });

  it("accepts exactly 4000 UTF-8 bytes and enforces the action reason allowlist", () => {
    expect(() => prepareReviewDecision("sub-1", "reject", publish, { reasonCode: "duplicate", note: "中".repeat(1333) + "x" })).not.toThrow();
    expect(() => prepareReviewDecision("sub-1", "reject", publish, { reasonCode: "needs_revision", note: "" })).toThrow("REVIEW_NOTE_INVALID");
    expect(() => prepareReviewDecision("sub-1", "request_changes", publish, { reasonCode: "unsafe", note: "" })).toThrow("REVIEW_NOTE_INVALID");
  });
});
