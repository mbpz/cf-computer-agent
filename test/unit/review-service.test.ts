import { describe, expect, it } from "vitest";
import { ReviewService } from "../../src/review/service";
import type { ReviewRepositoryPort, ReviewResult, ReviewScope } from "../../src/review/types";

describe("ReviewService", () => {
  it("normalizes a deterministic daily review request", async () => {
    const repository = new FakeReviewRepository();
    const service = new ReviewService(repository, () => new Date("2026-08-26T12:00:00.000Z"));
    await expect(service.list({ memberId: "member-a", role: "contributor" }, "daily")).resolves.toEqual({
      period: "daily",
      from: "2026-08-25T00:00:00.000Z",
      to: "2026-08-27T00:00:00.000Z",
      items: [],
    });
    expect(repository.calls).toEqual([{ memberId: "member-a", role: "contributor", period: "daily" }]);
  });

  it("rejects malformed scopes and periods before storage", async () => {
    const repository = new FakeReviewRepository();
    const service = new ReviewService(repository);
    await expect(service.list({ memberId: "../secret", role: "contributor" }, "daily")).rejects.toMatchObject({ code: "KNOWLEDGE_REVIEW_INVALID", status: 400 });
    await expect(service.list({ memberId: "member-a", role: "contributor" }, "monthly")).rejects.toMatchObject({ code: "KNOWLEDGE_REVIEW_PERIOD_INVALID", status: 400 });
    expect(repository.calls).toEqual([]);
  });
});

class FakeReviewRepository implements ReviewRepositoryPort {
  calls: Array<ReviewScope & { period: string }> = [];
  async list(scope: ReviewScope, period: "daily" | "weekly"): Promise<ReviewResult> {
    this.calls.push({ ...scope, period });
    return { period, from: "2026-08-25T00:00:00.000Z", to: "2026-08-27T00:00:00.000Z", items: [] };
  }
}
