// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadSubmissionComments } from "../../frontend/lib/submission-comments-data";

const NOW = "2026-10-16T09:00:00.000Z";

describe("member submission comments", () => {
  it("fails closed when the response carries another submission's comments", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/submissions/submission-a/comments");
      return Response.json({ comments: [
        { id: "comment-2", submissionId: "submission-a", authorRole: "admin", body: "Please add sources.", createdAt: NOW },
        { id: "comment-1", submissionId: "submission-a", authorRole: "owner", body: "Added two sources.", createdAt: NOW },
        { id: "comment-3", submissionId: "other-submission", authorRole: "admin", body: "Unrelated", createdAt: NOW },
      ] });
    });
    await expect(loadSubmissionComments("submission-a", { requester })).rejects.toThrow("SUBMISSION_COMMENTS_INVALID");
  });

  it("keeps only the surviving text of an edited comment", async () => {
    const requester = vi.fn(async () => Response.json({ comments: [
      { id: "comment-1", submissionId: "submission-a", authorRole: "admin", body: "Old wording", createdAt: NOW },
      { id: "comment-2", submissionId: "submission-a", authorRole: "admin", body: "New wording", createdAt: NOW, supersedesCommentId: "comment-1" },
    ] }));
    await expect(loadSubmissionComments("submission-a", { requester })).resolves.toEqual([
      { id: "comment-2", authorRole: "admin", body: "New wording", createdAt: NOW },
    ]);
  });

  it("refuses a response that is not a member-readable thread", async () => {
    for (const payload of [
      {},
      { comments: "none" },
      { comments: [{ id: "comment-1", submissionId: "submission-a", authorRole: "reviewer", body: "x", createdAt: NOW }] },
      { comments: [{ id: "comment-1", submissionId: "submission-a", authorRole: "admin", body: "  ", createdAt: NOW }] },
      { comments: [{ id: "comment-1", submissionId: "submission-a", authorRole: "admin", body: "x", createdAt: "not a date" }] },
      { comments: [{ id: "comment-1", submissionId: "submission-a", authorRole: "admin", body: "x".repeat(16385), createdAt: NOW }] },
    ]) {
      const requester = vi.fn(async () => Response.json(payload));
      await expect(loadSubmissionComments("submission-a", { requester })).rejects.toThrow("SUBMISSION_COMMENTS_INVALID");
    }
    const requester = vi.fn(async () => Response.json({ comments: [] }));
    await expect(loadSubmissionComments("bad id!", { requester })).rejects.toThrow("SUBMISSION_ID_INVALID");
    expect(requester).not.toHaveBeenCalled();
    await expect(loadSubmissionComments("submission-a", { requester })).resolves.toEqual([]);
  });
});
