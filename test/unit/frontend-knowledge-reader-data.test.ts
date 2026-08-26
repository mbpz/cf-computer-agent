import { describe, expect, it, vi } from "vitest";
import { loadKnowledgeRevision, loadKnowledgeRevisionDiff } from "../../frontend/lib/knowledge-reader-data";

describe("knowledge reader data boundary", () => {
  it("loads only the authorized current revision and normalizes malformed chunks", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      knowledge: {
        currentRevision: {
          id: "revision-1",
          knowledgeItemId: "knowledge-1",
          title: "Guide",
          markdown: "# Guide",
          publishedAt: "2026-08-26T00:00:00.000Z",
          isCurrent: true,
          chunks: [
            { id: "chunk-1", text: "Body", citationId: "citation-1", headingPath: ["Guide", 1] },
            { id: "broken", text: 42 },
          ],
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(loadKnowledgeRevision("knowledge-1", requester)).resolves.toEqual({
      id: "revision-1",
      knowledgeItemId: "knowledge-1",
      title: "Guide",
      markdown: "# Guide",
      publishedAt: "2026-08-26T00:00:00.000Z",
      isCurrent: true,
      previousRevisionId: null,
      visibility: undefined,
      chunks: [{ id: "chunk-1", text: "Body", citationId: "citation-1", headingPath: ["Guide"] }],
    });
    expect(requester).toHaveBeenCalledWith("/api/knowledge/knowledge-1", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("loads and bounds a revision diff through the encoded route", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ diff: {
      fromRevisionId: "revision-1", toRevisionId: "revision-2", changed: true,
      metadataChanges: [{ field: "title", from: "Old", to: "New" }],
      stats: { added: 1, removed: 1, unchanged: 2, truncated: false },
      hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: "added", text: "New", oldLine: null, newLine: 1 }] }],
    } }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(loadKnowledgeRevisionDiff("knowledge-1", "revision-1", "revision-2", requester)).resolves.toMatchObject({
      fromRevisionId: "revision-1", toRevisionId: "revision-2", stats: { added: 1 },
    });
    expect(requester).toHaveBeenCalledWith(
      "/api/knowledge/knowledge-1/revisions/revision-1/diff/revision-2",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("rejects unsafe IDs and missing revision payloads", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ knowledge: {} }), { status: 200 }));
    await expect(loadKnowledgeRevision("../secret", requester)).rejects.toThrow("KNOWLEDGE_ID_INVALID");
    await expect(loadKnowledgeRevision("knowledge-1", requester)).rejects.toThrow("KNOWLEDGE_REVISION_INVALID");
    expect(requester).toHaveBeenCalledTimes(1);
  });
});
