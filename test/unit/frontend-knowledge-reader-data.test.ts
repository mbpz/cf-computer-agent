import { describe, expect, it, vi } from "vitest";
import { loadKnowledgeBacklinks, loadKnowledgeRevision, loadKnowledgeRevisionDiff, loadRelatedKnowledge } from "../../frontend/lib/knowledge-reader-data";

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
          sourceVersionId: "source-version-1",
          sourceVersionOrdinal: 2,
          parserSchemaVersion: "m2-v1",
          indexStatus: "indexed",
          chunks: [
            { id: "chunk-1", text: "Body", citationId: "citation-1", headingPath: ["Guide", 1], startLine: 3, endLine: 4, location: { kind: "pdf", page: 2 } },
            { id: "chunk-2", ordinal: 1, text: "Cells", headingPath: [], startLine: 5, endLine: 5, location: { kind: "spreadsheet", sheet: "Sheet1", range: "A1:B2" } },
            { id: "chunk-3", ordinal: 2, text: "Slide", headingPath: [], startLine: 6, endLine: 7, location: { kind: "slide", slide: 3, elementStart: 1, elementEnd: 2 } },
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
      sourceVersionId: "source-version-1",
      sourceVersionOrdinal: 2,
      parserSchemaVersion: "m2-v1",
      indexStatus: "indexed",
      chunks: [
        { id: "chunk-1", ordinal: 0, text: "Body", citationId: "citation-1", headingPath: ["Guide"], startLine: 3, endLine: 4, location: { kind: "pdf", page: 2 } },
        { id: "chunk-2", ordinal: 1, text: "Cells", headingPath: [], startLine: 5, endLine: 5, location: { kind: "spreadsheet", sheet: "Sheet1", range: "A1:B2" } },
        { id: "chunk-3", ordinal: 2, text: "Slide", headingPath: [], startLine: 6, endLine: 7, location: { kind: "slide", slide: 3, elementStart: 1, elementEnd: 2 } },
      ],
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

  it("loads the exact historical revision behind a citation, never the current revision", async () => {
    const requester = vi.fn(async (url: RequestInfo | URL) => json(String(url).includes("/citations/") ? { citation: citation() } : { revision: historicalRevision() }));
    await expect(loadKnowledgeRevision("knowledge-1", requester, undefined, "#citation-1")).resolves.toMatchObject({ id: "revision-old", isCurrent: false, selectedChunkId: "chunk-old", markdown: "Old text" });
    expect(requester.mock.calls.map(([url]) => url)).toEqual(["/api/knowledge/citations/citation-1", "/api/knowledge/knowledge-1/revisions/revision-old"]);
  });

  it.each(["knowledge", "revision", "chunk", "lines"])("rejects a citation whose %s binding differs from its exact revision", async (mismatch) => {
    const source = citation(); const revision = historicalRevision();
    if (mismatch === "knowledge") source.knowledgeItemId = "other";
    if (mismatch === "revision") revision.id = "revision-new";
    if (mismatch === "chunk") revision.chunks[0]!.id = "other";
    if (mismatch === "lines") revision.chunks[0]!.startLine = 2;
    const requester = vi.fn(async (url: RequestInfo | URL) => json(String(url).includes("/citations/") ? { citation: source } : { revision }));
    await expect(loadKnowledgeRevision("knowledge-1", requester, undefined, "#citation-1")).rejects.toThrow();
    expect(requester.mock.calls.every(([url]) => url !== "/api/knowledge/knowledge-1")).toBe(true);
    expect(requester).toHaveBeenCalledTimes(mismatch === "knowledge" ? 1 : 2);
  });

  it.each([401, 403, 404, 503])("does not substitute current text when citation resolution fails (%i)", async (status) => {
    const requester = vi.fn(async (_url: RequestInfo | URL) => new Response(null, { status }));
    await expect(loadKnowledgeRevision("knowledge-1", requester, undefined, "#citation-1")).rejects.toThrow();
    expect(requester).toHaveBeenCalledTimes(1);
    expect(requester.mock.calls[0]?.[0]).toBe("/api/knowledge/citations/citation-1");
  });

  it("rejects malformed encoded citations without any request", async () => {
    const requester = vi.fn();
    await expect(loadKnowledgeRevision("knowledge-1", requester, undefined, "#%ZZ")).rejects.toThrow();
    expect(requester).not.toHaveBeenCalled();
  });

  it("rejects unsafe IDs and missing revision payloads", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ knowledge: {} }), { status: 200 }));
    await expect(loadKnowledgeRevision("../secret", requester)).rejects.toThrow("KNOWLEDGE_ID_INVALID");
    await expect(loadKnowledgeRevision("knowledge-1", requester)).rejects.toThrow("KNOWLEDGE_REVISION_INVALID");
    expect(requester).toHaveBeenCalledTimes(1);
  });

  it("loads at most five related items and drops malformed fields", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ related: { items: [
      { id: "knowledge-2", title: "Related", publishedAt: "2026-08-26", reasonFields: ["title", "body", 42] },
      { id: "broken", title: 42, publishedAt: "2026-08-26" },
    ] } }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(loadRelatedKnowledge("knowledge-1", requester)).resolves.toEqual([
      { id: "knowledge-2", title: "Related", publishedAt: "2026-08-26", reasonFields: ["title", "body"] },
    ]);
    expect(requester).toHaveBeenCalledWith("/api/knowledge/knowledge-1/related", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("loads bounded backlink locations and rejects malformed rows", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ backlinks: { items: [
      { id: "knowledge-2", revisionId: "revision-2", chunkId: "chunk-2", title: "Source", publishedAt: "2026-08-26", startLine: 4, endLine: 6 },
      { id: "broken", revisionId: "revision-3", chunkId: "chunk-3", title: "Broken", publishedAt: "2026-08-26", startLine: 0, endLine: 2 },
    ] } }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(loadKnowledgeBacklinks("knowledge-1", requester)).resolves.toEqual([
      { id: "knowledge-2", revisionId: "revision-2", chunkId: "chunk-2", title: "Source", publishedAt: "2026-08-26", startLine: 4, endLine: 6 },
    ]);
    expect(requester).toHaveBeenCalledWith("/api/knowledge/knowledge-1/backlinks", expect.objectContaining({ credentials: "same-origin" }));
  });
});

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function citation() { return { knowledgeItemId: "knowledge-1", title: "Historical", revisionId: "revision-old", chunkId: "chunk-old", headingPath: [], startLine: 1, endLine: 2 }; }
function historicalRevision() { return { id: "revision-old", knowledgeItemId: "knowledge-1", markdown: "Old text", isCurrent: false, chunks: [{ id: "chunk-old", citationId: "citation-1", text: "Old text", startLine: 1, endLine: 2 }] }; }
