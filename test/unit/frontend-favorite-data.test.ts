import { describe, expect, it, vi } from "vitest";
import { loadFavoriteKnowledge } from "../../frontend/lib/knowledge-data";

describe("frontend favorite reading list boundary", () => {
  it("keeps private completion state and drops malformed rows", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { knowledgeItemId: "knowledge-1", title: "Guide", createdAt: "2026-08-26T00:00:00.000Z", completed: false, visibility: "shared" },
      { knowledgeItemId: "broken", title: 42, createdAt: "", completed: "yes", visibility: "shared" },
    ] }), { status: 200 }));
    await expect(loadFavoriteKnowledge(requester)).resolves.toEqual([{ id: "knowledge-1", title: "Guide", createdAt: "2026-08-26T00:00:00.000Z", completed: false, visibility: "shared" }]);
    expect(requester).toHaveBeenCalledWith("/api/knowledge/favorites?limit=20", expect.objectContaining({ credentials: "same-origin" }));
  });
});
