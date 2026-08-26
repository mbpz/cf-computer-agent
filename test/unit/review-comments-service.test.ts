import { describe, expect, it } from "vitest";
import { ReviewCommentsService } from "../../src/review-comments/service";
import type { ReviewCommentCreate, ReviewCommentsRepositoryPort } from "../../src/review-comments/repository";
import type { ReviewCommentRecord } from "../../src/review-comments/types";

describe("ReviewCommentsService", () => {
  it("keeps owner comments private and appends edits instead of overwriting", async () => {
    const repository = new FakeReviewCommentsRepository();
    const service = new ReviewCommentsService(repository, { id: (() => { let n = 0; return () => `comment-${++n}`; })(), now: () => new Date("2026-08-26T00:00:00.000Z") });
    const owner = { memberId: "member-owner", role: "contributor" as const };
    const first = await service.create(owner, "submission-1", "  First note  ");
    expect(first).toMatchObject({ id: "comment-1", authorRole: "owner", body: "First note" });
    expect(first).not.toHaveProperty("authorId");
    const edited = await service.edit(owner, first.id, "Edited note");
    expect(edited).toMatchObject({ id: "comment-2", body: "Edited note", supersedesCommentId: "comment-1" });
    expect(repository.items.map((item) => item.body)).toEqual(["First note", "Edited note"]);
    await expect(service.list({ memberId: "member-other", role: "contributor" }, "submission-1")).rejects.toMatchObject({ code: "REVIEW_COMMENT_NOT_FOUND", status: 404 });
  });

  it("exposes author IDs only to admins and rejects unsafe edits", async () => {
    const repository = new FakeReviewCommentsRepository();
    const service = new ReviewCommentsService(repository, { id: (() => { let n = 0; return () => `comment-${++n}`; })() });
    const admin = { memberId: "member-admin", role: "admin" as const };
    const comment = await service.create(admin, "submission-1", "Admin note");
    expect(comment).toMatchObject({ authorId: "member-admin", authorRole: "admin" });
    await expect(service.create(admin, "submission-1", "bad\u0000note")).rejects.toMatchObject({ code: "REVIEW_COMMENT_INVALID", status: 400 });
    await expect(service.edit({ memberId: "member-owner", role: "contributor" }, comment.id, "forged")).rejects.toMatchObject({ code: "REVIEW_COMMENT_EDIT_FORBIDDEN", status: 403 });
  });
});

class FakeReviewCommentsRepository implements ReviewCommentsRepositoryPort {
  readonly items: ReviewCommentRecord[] = [];
  async findSubmissionOwner(submissionId: string): Promise<string | null> { return submissionId === "submission-1" ? "member-owner" : null; }
  async list(submissionId: string): Promise<ReviewCommentRecord[]> { return this.items.filter((item) => item.submissionId === submissionId); }
  async find(commentId: string): Promise<ReviewCommentRecord | null> { return this.items.find((item) => item.id === commentId) ?? null; }
  async create(input: ReviewCommentCreate): Promise<ReviewCommentRecord> {
    const item: ReviewCommentRecord = { ...input, ownerId: "member-owner" };
    this.items.push(item);
    return item;
  }
}
