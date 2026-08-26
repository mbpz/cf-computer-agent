import { describe, expect, it, vi } from "vitest";
import { loadKnowledgeFavorite, setKnowledgeFavorite } from "../../frontend/lib/knowledge-reader-data";

describe("frontend favorite data boundary", () => {
  it("uses the member-scoped favorite endpoints and rejects malformed writes", async () => {
    const requester = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ favorite: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ favorite: { knowledgeItemId: "knowledge-1" } }), { status: 201 }));
    await expect(loadKnowledgeFavorite("knowledge-1", requester)).resolves.toBe(true);
    await expect(setKnowledgeFavorite("knowledge-1", true, requester)).resolves.toBe(true);
    expect(requester).toHaveBeenNthCalledWith(1, "/api/knowledge/knowledge-1/favorite", expect.objectContaining({ credentials: "same-origin" }));
    expect(requester).toHaveBeenNthCalledWith(2, "/api/knowledge/knowledge-1/favorite", expect.objectContaining({ method: "PUT", credentials: "same-origin" }));
    await expect(loadKnowledgeFavorite("../secret", requester)).rejects.toThrow("KNOWLEDGE_ID_INVALID");
  });
});

