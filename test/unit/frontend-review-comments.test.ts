// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createReviewComment, loadReviewComments } from "../../frontend/components/review/review-comments-data";

describe("frontend review comments", () => {
  it("normalizes bounded comment rows and drops internal malformed values", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ comments: [
      { id: "comment-1", submissionId: "submission-1", authorRole: "admin", authorId: "member-admin", body: "Guidance", createdAt: "2026-08-26T00:00:00.000Z" },
      { id: "comment-2", submissionId: "submission-1", authorRole: "owner", body: "Context", createdAt: "2026-08-26T00:01:00.000Z", supersedesCommentId: "comment-1", reviewerEmail: "secret@example.test" },
      { id: "bad", submissionId: "submission-1", authorRole: "forged", body: "ignore", createdAt: "" },
    ] }), { status: 200 }));
    await expect(loadReviewComments("submission-1", requester)).resolves.toEqual([
      { id: "comment-1", submissionId: "submission-1", authorRole: "admin", authorId: "member-admin", body: "Guidance", createdAt: "2026-08-26T00:00:00.000Z" },
      { id: "comment-2", submissionId: "submission-1", authorRole: "owner", body: "Context", createdAt: "2026-08-26T00:01:00.000Z", supersedesCommentId: "comment-1" },
    ]);
  });

  it("posts a comment with a bounded same-origin API path", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/admin/submissions/submission-1/comments");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ body: "A note" }));
      return new Response(JSON.stringify({ comment: { id: "comment-1", submissionId: "submission-1", authorRole: "admin", body: "A note", createdAt: "2026-08-26T00:00:00.000Z" } }), { status: 201 });
    });
    await expect(createReviewComment("submission-1", "A note", requester)).resolves.toMatchObject({ id: "comment-1", body: "A note" });
  });
});
