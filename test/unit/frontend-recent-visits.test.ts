import { describe, expect, it, vi } from "vitest";
import { loadRecentKnowledge } from "../../frontend/lib/knowledge-data";

describe("frontend recent visits boundary", () => {
  it("loads a small private list and drops malformed rows", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { knowledgeItemId: "knowledge-1", title: "Guide", lastVisitedAt: "2026-08-26T00:00:00.000Z", visitCount: 3 },
      { knowledgeItemId: "broken", title: 42, lastVisitedAt: "", visitCount: "bad" },
    ] }), { status: 200 }));
    await expect(loadRecentKnowledge(requester)).resolves.toEqual([{ id: "knowledge-1", title: "Guide", lastVisitedAt: "2026-08-26T00:00:00.000Z", visitCount: 3 }]);
    expect(requester).toHaveBeenCalledWith("/api/knowledge/recent?limit=8", expect.objectContaining({ credentials: "same-origin" }));
  });
});

