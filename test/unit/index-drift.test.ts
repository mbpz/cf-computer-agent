import { describe, expect, it } from "vitest";
import { buildKnowledgeExport } from "../../src/ops/export-package";
import { detectIndexDrift, planFullIndexRebuild } from "../../src/ops/index-drift";

const makePackage = () => buildKnowledgeExport({
  exportId: "drift-export-1", generatedAt: "2026-08-26T00:00:00.000Z", schemaFingerprint: "migrations-0023",
  members: [], spaces: [{ id: "space-1" }], collections: [], submissions: [], reviews: [], sources: [{ id: "source-1" }], sourceVersions: [{ id: "source-version-1", sourceId: "source-1" }],
  knowledgeItems: [{ id: "knowledge-1", spaceId: "space-1", collectionId: null, currentRevisionId: "revision-1", status: "active" as const, searchStatus: "indexed" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  revisions: [{ id: "revision-1", knowledgeItemId: "knowledge-1", sourceVersionId: "source-version-1", normalizedPath: "/published/revision-1.md", contentSha256: "a".repeat(64), title: "Source", tags: [], visibility: "shared" as const, publishedBy: "publisher-1", publishedAt: "2026-01-01T00:00:00.000Z", markdown: "# Source", chunks: [{ id: "chunk-1", revisionId: "revision-1", ordinal: 0, headingPath: [], startLine: 1, endLine: 1, body: "body" }] }],
  researchRuns: [], researchReports: [], privateNotes: [], assets: [],
});

describe("index drift and rebuild plan", () => {
  it("reports current/FTS/vector drift with bounded IDs", async () => {
    const pkg = await makePackage();
    const report = detectIndexDrift(pkg, { currentRevisionByItem: { "knowledge-1": "revision-old" }, ftsRevisionIds: ["revision-old"], vectorRevisionIds: ["revision-old"] });
    expect(report.status).toBe("drifted");
    expect(report.current.mismatched).toEqual([{ knowledgeItemId: "knowledge-1", expectedRevisionId: "revision-1", observedRevisionId: "revision-old" }]);
    expect(report.fts.missing).toEqual(["revision-1"]);
    expect(report.vector.status).toBe("skipped_unbound");
  });

  it("plans full FTS rebuild from authoritative current revisions without writes", async () => {
    const pkg = await makePackage();
    const plan = planFullIndexRebuild(pkg);
    expect(plan.writes).toBe("none");
    expect(plan.revisionIds).toEqual(["revision-1"]);
    expect(plan.indexPlan.fts.chunkCount).toBe(1);
  });
});
