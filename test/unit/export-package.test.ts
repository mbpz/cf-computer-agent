import { describe, expect, it } from "vitest";
import { buildKnowledgeExport, KNOWLEDGE_EXPORT_FORMAT } from "../../src/ops/export-package";

const baseInput = () => ({
  exportId: "export-20260826",
  generatedAt: "2026-08-26T00:00:00.000Z",
  schemaFingerprint: "migrations-0021",
  members: [{ id: "member-1", identitySubject: "github:1", email: "owner@example.test", role: "admin" as const, status: "active" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  spaces: [{ id: "space-1", slug: "default" }],
  collections: [],
  submissions: [{ id: "submission-1", status: "published" }],
  reviews: [{ id: "review-1", submissionId: "submission-1" }],
  sources: [{ id: "source-1", ownerId: "member-1" }],
  sourceVersions: [{ id: "source-version-1", sourceId: "source-1" }],
  knowledgeItems: [{ id: "knowledge-1", spaceId: "space-1", collectionId: null, currentRevisionId: "revision-1", status: "active" as const, searchStatus: "indexed" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  revisions: [{ id: "revision-1", knowledgeItemId: "knowledge-1", sourceVersionId: "source-version-1", normalizedPath: "/workspace/published/space-1/knowledge-1/revision-1.md", contentSha256: "a".repeat(64), title: "Source", tags: [], visibility: "shared" as const, publishedBy: "member-1", publishedAt: "2026-01-01T00:00:00.000Z", markdown: "# Source", chunks: [{ id: "chunk-1", revisionId: "revision-1", citationId: "citation-1", ordinal: 0, headingPath: ["Source"], startLine: 1, endLine: 1, body: "Source body" }] }],
  researchRuns: [],
  researchReports: [],
  privateNotes: [],
  assets: [{ id: "asset-1", objectKey: null, originalName: "source.txt", contentType: "text/plain", byteSize: 3, contentSha256: "b".repeat(64), status: "ready" as const, bytesBase64: "YWJj" }],
});

describe("knowledge export package", () => {
  it("builds a deterministic manifest with authoritative records, originals and citations", async () => {
    const first = await buildKnowledgeExport(baseInput());
    const second = await buildKnowledgeExport({ ...baseInput(), spaces: [{ slug: "default", id: "space-1" }] });

    expect(first.manifest).toMatchObject({
      format: KNOWLEDGE_EXPORT_FORMAT,
      version: 1,
      citationCount: 1,
      originals: { mode: "inline", count: 1, inlineCount: 1 },
      derivedExcluded: ["chunks_fts", "vectorize", "jobs"],
    });
    expect(first.citations).toEqual([expect.objectContaining({ citationId: "citation-1", revisionId: "revision-1", chunkId: "chunk-1", startLine: 1, endLine: 1 })]);
    expect(first.manifest.integritySha256).toBe(second.manifest.integritySha256);
    expect(first.records.revisions[0]?.chunks[0]?.body).toBe("Source body");
  });

  it("rejects broken references, duplicate IDs, invalid originals and non-export secrets", async () => {
    await expect(buildKnowledgeExport({ ...baseInput(), revisions: [{ ...baseInput().revisions[0]!, knowledgeItemId: "missing" }] })).rejects.toThrow(/Revision export/);
    await expect(buildKnowledgeExport({ ...baseInput(), members: [...baseInput().members, { ...baseInput().members[0]! }] })).rejects.toThrow(/duplicate/);
    await expect(buildKnowledgeExport({ ...baseInput(), assets: [{ ...baseInput().assets[0]!, contentSha256: "secret" }] })).rejects.toThrow(/Original/);

    const packageValue = await buildKnowledgeExport(baseInput());
    expect(JSON.stringify(packageValue)).not.toContain("auth_sessions");
    expect(JSON.stringify(packageValue)).not.toContain("automation_nonces");
    expect(JSON.stringify(packageValue)).not.toContain("APP_TOKEN");
  });
});
