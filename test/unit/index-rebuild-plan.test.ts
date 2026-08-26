import { describe, expect, it } from "vitest";
import { buildKnowledgeExport } from "../../src/ops/export-package";
import { planDerivedIndexRebuild } from "../../src/ops/index-rebuild-plan";

const packageInput = () => ({
  exportId: "export-index-1", generatedAt: "2026-08-26T00:00:00.000Z", schemaFingerprint: "migrations-0023",
  members: [], spaces: [{ id: "space-1" }], collections: [], submissions: [], reviews: [], sources: [], sourceVersions: [],
  knowledgeItems: [{ id: "knowledge-1", spaceId: "space-1", collectionId: null, currentRevisionId: "revision-1", status: "active" as const, searchStatus: "indexed" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  revisions: [{ id: "revision-1", knowledgeItemId: "knowledge-1", sourceVersionId: "source-version-1", normalizedPath: "/published/revision-1.md", contentSha256: "a".repeat(64), title: "Index source", tags: [], visibility: "shared" as const, publishedBy: "publisher-1", publishedAt: "2026-01-01T00:00:00.000Z", markdown: "# Index source", chunks: [
    { id: "chunk-1", revisionId: "revision-1", ordinal: 0, headingPath: ["Index source"], startLine: 1, endLine: 1, body: "prose body", searchBody: "prose body", indexField: "body" as const },
    { id: "chunk-2", revisionId: "revision-1", ordinal: 1, headingPath: ["Code"], startLine: 2, endLine: 2, body: "const x = 1;", searchBody: "const x = 1;", indexField: "code" as const },
  ] }],
  researchRuns: [], researchReports: [], privateNotes: [], assets: [],
});

describe("derived index rebuild plan", () => {
  it("rebuilds deterministic FTS documents from exported authoritative revisions", async () => {
    const pkg = await buildKnowledgeExport(packageInput());
    const plan = await planDerivedIndexRebuild(pkg);
    expect(plan.ok).toBe(true);
    expect(plan.writes).toBe("none");
    expect(plan.fts.documents).toHaveLength(1);
    expect(plan.fts.documents[0]).toMatchObject({ revisionId: "revision-1", title: "Index source", body: "prose body", code: "const x = 1;" });
    expect(plan.fts.chunkCount).toBe(2);
    expect(plan.vectorize.status).toBe("skipped_unbound");
  });

  it("fails closed when a revision is not represented by the authoritative items", async () => {
    const pkg = await buildKnowledgeExport({ ...packageInput(), revisions: [{ ...packageInput().revisions[0]!, knowledgeItemId: "knowledge-1", sourceVersionId: "source-version-1" }] });
    const broken = { ...pkg, records: { ...pkg.records, knowledgeItems: [] } };
    const plan = await planDerivedIndexRebuild(broken);
    expect(plan.ok).toBe(false);
    expect(plan.errors.map((error) => error.code)).toContain("REVISION_ORPHANED");
  });
});
