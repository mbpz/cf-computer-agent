// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadKnowledgeReview } from "../../frontend/lib/review-data";

describe("knowledge review data", () => {
  it("requests a bounded period and drops malformed items", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/knowledge/review?period=weekly");
      return Response.json({
        period: "weekly",
        from: "2026-08-20T00:00:00.000Z",
        to: "2026-08-27T00:00:00.000Z",
        items: [
          { knowledgeItemId: "k1", revisionId: "r1", title: "Guide", publishedAt: "2026-08-25T00:00:00.000Z", lastVisitedAt: null, reason: "new", favorite: false },
          { knowledgeItemId: "bad", title: "Missing fields" },
        ],
      });
    });
    await expect(loadKnowledgeReview("weekly", requester)).resolves.toEqual({
      period: "weekly",
      from: "2026-08-20T00:00:00.000Z",
      to: "2026-08-27T00:00:00.000Z",
      items: [{ knowledgeItemId: "k1", revisionId: "r1", title: "Guide", publishedAt: "2026-08-25T00:00:00.000Z", lastVisitedAt: null, reason: "new", favorite: false }],
    });
  });
});
