// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createSubmission } from "../../frontend/lib/submission-data";

describe("frontend submission data", () => {
  it("sends the caller identity unchanged on repeated attempts and forwards cancellation", async () => {
    const attempts: RequestInit[] = [];
    const requester = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      attempts.push(init!);
      return Response.json({ submission: { id: "same-id" } });
    });
    const controller = new AbortController();
    const draft = { mode: "text" as const, title: "Title", content: "Body" };
    await createSubmission(draft, "caller-key-123456", requester, controller.signal);
    await createSubmission(draft, "caller-key-123456", requester, controller.signal);
    expect(attempts[0]?.body).toBe(attempts[1]?.body);
    for (const attempt of attempts) {
      expect(new Headers(attempt.headers).get("idempotency-key")).toBe("caller-key-123456");
      expect(attempt.signal).toBe(controller.signal);
    }
    for (const key of ["", "short", "a".repeat(129), "bad key with spaces"]) {
      await expect(createSubmission(draft, key, requester)).rejects.toThrow("SUBMISSION_KEY_INVALID");
    }
    expect(requester).toHaveBeenCalledTimes(2);
  });
  it("posts a bounded reviewable submission with idempotency", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/submissions");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "content-type": "application/json" });
      expect((init?.headers as Record<string, string>)["idempotency-key"]).toBeTruthy();
      expect(JSON.parse(String(init?.body))).toMatchObject({ requestedSpaceId: "default", requestedVisibility: "shared", kind: "markdown", title: "Guide", content: "# Body" });
      return new Response(JSON.stringify({ submission: { id: "submission-1" }, similarCandidates: [{ submissionId: "old-1", sourceId: "source-1", sourceVersionId: "version-1", title: "Existing guide", similarity: 0.72 }] }), { status: 201 });
    });
    await expect(createSubmission({ mode: "markdown", title: " Guide ", content: "# Body" }, "submission-key-123456", requester)).resolves.toEqual({ id: "submission-1", similarCandidates: [{ submissionId: "old-1", sourceId: "source-1", sourceVersionId: "version-1", title: "Existing guide", similarity: 0.72 }] });
  });

  it("rejects empty and oversized drafts before network", async () => {
    const requester = vi.fn();
    await expect(createSubmission({ mode: "text", title: "", content: "body" }, "submission-key-123456", requester)).rejects.toThrow("SUBMISSION_DRAFT_INVALID");
    await expect(createSubmission({ mode: "text", title: "Title", content: "x".repeat(131073) }, "submission-key-123456", requester)).rejects.toThrow("SUBMISSION_DRAFT_INVALID");
    expect(requester).not.toHaveBeenCalled();
  });

  it("rejects malformed response data", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ submission: null }), { status: 201 }));
    await expect(createSubmission({ mode: "code", title: "Code", content: "const x = 1;" }, "submission-key-123456", requester)).rejects.toThrow("SUBMISSION_RESPONSE_INVALID");
  });

  it("drops malformed similarity suggestions without weakening submission success", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ submission: { id: "submission-1" }, similarCandidates: [{ title: "leak", similarity: 2 }, null] }), { status: 201 }));
    await expect(createSubmission({ mode: "text", title: "Guide", content: "Body" }, "submission-key-123456", requester)).resolves.toEqual({ id: "submission-1", similarCandidates: [] });
  });
});
