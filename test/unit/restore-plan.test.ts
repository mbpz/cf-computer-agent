import { describe, expect, it } from "vitest";
import { buildKnowledgeExport } from "../../src/ops/export-package";
import { planKnowledgeRestore } from "../../src/ops/restore-plan";

const input = () => ({
  exportId: "export-restore-1",
  generatedAt: "2026-08-26T00:00:00.000Z",
  schemaFingerprint: "migrations-0024",
  members: [{ id: "member-1", identitySubject: "github:1", email: "owner@example.test", role: "admin" as const, status: "active" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  spaces: [{ id: "space-1", slug: "default" }], collections: [], submissions: [], reviews: [],
  sources: [{ id: "source-1", ownerId: "member-1" }], sourceVersions: [{ id: "source-version-1", sourceId: "source-1" }],
  knowledgeItems: [{ id: "knowledge-1", spaceId: "space-1", collectionId: null, currentRevisionId: "revision-1", status: "active" as const, searchStatus: "indexed" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  revisions: [{ id: "revision-1", knowledgeItemId: "knowledge-1", sourceVersionId: "source-version-1", normalizedPath: "/workspace/published/space-1/knowledge-1/revision-1.md", contentSha256: "a".repeat(64), title: "Source", tags: [], visibility: "shared" as const, publishedBy: "member-1", publishedAt: "2026-01-01T00:00:00.000Z", markdown: "# Source", chunks: [{ id: "chunk-1", revisionId: "revision-1", citationId: "citation-1", ordinal: 0, headingPath: ["Source"], startLine: 1, endLine: 1, body: "Source body" }] }],
  researchRuns: [], researchReports: [], privateNotes: [], assets: [],
});

describe("new-environment restore plan", () => {
  it("maps identities and preserves revision/citation/original operations without writes", async () => {
    const pkg = await buildKnowledgeExport(input());
    const plan = await planKnowledgeRestore(pkg, { expectedSchemaFingerprint: "migrations-0024", memberMap: { "member-1": "target-admin" } });
    expect(plan.ok).toBe(true);
    expect(plan.writes).toBe("none");
    expect(plan.identityMappings).toEqual([{ sourceMemberId: "member-1", targetMemberId: "target-admin" }]);
    expect(plan.citationCount).toBe(1);
    expect(plan.operations.map((operation) => operation.kind)).toEqual(["members", "spaces", "collections", "submissions", "reviews", "sources", "sourceVersions", "knowledgeItems", "revisions", "researchRuns", "researchReports", "privateNotes", "assets"]);
  });

  it("fails closed for schema, unmapped publishers, duplicate targets and broken citations", async () => {
    const pkg = await buildKnowledgeExport(input());
    const broken = { ...pkg, citations: [] };
    const plan = await planKnowledgeRestore(broken, { expectedSchemaFingerprint: "migrations-9999", memberMap: { "member-1": "target-admin" } });
    expect(plan.ok).toBe(false);
    expect(plan.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["SCHEMA_MISMATCH", "CITATION_MISMATCH"]));
    const unmapped = await planKnowledgeRestore(pkg, { expectedSchemaFingerprint: "migrations-0024", memberMap: {} });
    expect(unmapped.errors.map((error) => error.code)).toContain("IDENTITY_UNMAPPED");
    const duplicate = await planKnowledgeRestore(pkg, { expectedSchemaFingerprint: "migrations-0024", memberMap: { "member-1": "target-admin" }, targetMemberIds: ["target-admin"] });
    expect(duplicate.errors.map((error) => error.code)).toContain("IDENTITY_CONFLICT");
  });
});
