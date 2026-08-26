import { describe, expect, it, vi } from "vitest";
import { loadRecentKnowledge, loadRecentResearch } from "../../frontend/lib/knowledge-data";

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

describe("frontend recent research boundary", () => {
  it("keeps source scope and unfinished checkpoint while dropping malformed rows", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      {
        id: "run-1", knowledgeItemId: "knowledge-1", goal: "Compare launch options", status: "paused", quotaState: "available", quotaDeferredUntil: null,
        plan: { spaceIds: ["space-1"], collectionIds: ["collection-1"], knowledgeItemIds: ["knowledge-1"], completion: ["Decision"], steps: ["Read"], subquestions: [{ id: "q1", question: "What changed?", status: "pending" }] },
        checkpoint: { nextStep: 1, completedSubquestionIds: [] }, createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:01:00.000Z",
      },
      { id: "broken", status: "unknown" },
    ] }), { status: 200 }));
    await expect(loadRecentResearch(requester)).resolves.toEqual([expect.objectContaining({
      id: "run-1", status: "paused", sourceScope: { spaceIds: ["space-1"], collectionIds: ["collection-1"], knowledgeItemIds: ["knowledge-1"] }, checkpoint: { nextStep: 1, completedSubquestionIds: [] },
    })]);
    expect(requester).toHaveBeenCalledWith("/api/knowledge/research-runs?limit=8", expect.objectContaining({ credentials: "same-origin" }));
  });
});
