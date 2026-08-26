// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createSubmission } from "../../frontend/lib/submission-data";

describe("frontend submission data", () => {
  it("posts a bounded reviewable submission with idempotency", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/submissions");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "content-type": "application/json" });
      expect((init?.headers as Record<string, string>)["idempotency-key"]).toBeTruthy();
      expect(JSON.parse(String(init?.body))).toMatchObject({ requestedSpaceId: "default", requestedVisibility: "shared", kind: "markdown", title: "Guide", content: "# Body" });
      return new Response(JSON.stringify({ submission: { id: "submission-1" }, similarCandidates: [{ submissionId: "old-1", sourceId: "source-1", sourceVersionId: "version-1", title: "Existing guide", similarity: 0.72 }] }), { status: 201 });
    });
    await expect(createSubmission({ mode: "markdown", title: " Guide ", content: "# Body" }, requester)).resolves.toEqual({ id: "submission-1", similarCandidates: [{ submissionId: "old-1", sourceId: "source-1", sourceVersionId: "version-1", title: "Existing guide", similarity: 0.72 }] });
  });

  it("rejects empty and oversized drafts before network", async () => {
    const requester = vi.fn();
    await expect(createSubmission({ mode: "text", title: "", content: "body" }, requester)).rejects.toThrow("SUBMISSION_DRAFT_INVALID");
    await expect(createSubmission({ mode: "text", title: "Title", content: "x".repeat(131073) }, requester)).rejects.toThrow("SUBMISSION_DRAFT_INVALID");
    expect(requester).not.toHaveBeenCalled();
  });

  it("rejects malformed response data", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ submission: null }), { status: 201 }));
    await expect(createSubmission({ mode: "code", title: "Code", content: "const x = 1;" }, requester)).rejects.toThrow("SUBMISSION_RESPONSE_INVALID");
  });

  it("drops malformed similarity suggestions without weakening submission success", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ submission: { id: "submission-1" }, similarCandidates: [{ title: "leak", similarity: 2 }, null] }), { status: 201 }));
    await expect(createSubmission({ mode: "text", title: "Guide", content: "Body" }, requester)).resolves.toEqual({ id: "submission-1", similarCandidates: [] });
  });
});
