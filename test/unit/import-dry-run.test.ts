import { describe, expect, it } from "vitest";
import { buildKnowledgeExport } from "../../src/ops/export-package";
import { runImportDryRun } from "../../src/ops/import-dry-run";

const input = () => ({
  exportId: "export-1",
  generatedAt: "2026-08-26T00:00:00.000Z",
  schemaFingerprint: "migrations-0023",
  members: [{ id: "member-1", identitySubject: "github:1", email: "owner@example.test", role: "admin" as const, status: "active" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  spaces: [{ id: "space-1", slug: "default" }],
  collections: [], submissions: [], reviews: [], sources: [], sourceVersions: [],
  knowledgeItems: [], revisions: [], researchRuns: [], researchReports: [], privateNotes: [],
  assets: [{ id: "asset-1", objectKey: null, originalName: "source.txt", contentType: "text/plain", byteSize: 3, contentSha256: "b".repeat(64), status: "ready" as const, bytesBase64: "YWJj" }],
});

describe("knowledge import dry-run", () => {
  it("accepts an intact package when schema, capacity and permissions fit", async () => {
    const pkg = await buildKnowledgeExport(input());
    const report = await runImportDryRun(pkg, {
      expectedSchemaFingerprint: "migrations-0023",
      actor: { memberId: "member-1", role: "admin" },
      capacities: { members: 2, spaces: 2, assets: 2, assetBytes: 10 },
    });
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.plan.totalRecords).toBe(3);
  });

  it("reports tampering, schema mismatch, capacity, conflict and permission failures", async () => {
    const pkg = await buildKnowledgeExport(input());
    const tampered = { ...pkg, records: { ...pkg.records, spaces: [{ id: "space-1", slug: "changed" }] } };
    const report = await runImportDryRun(tampered, {
      expectedSchemaFingerprint: "migrations-9999",
      actor: { memberId: "member-2", role: "contributor" },
      capacities: { members: 0, spaces: 0, assets: 0, assetBytes: 0 },
      existingIds: { spaces: ["space-1"] },
    });
    expect(report.ok).toBe(false);
    expect(report.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "IMPORT_FORBIDDEN", "SCHEMA_MISMATCH", "INTEGRITY_MISMATCH", "CAPACITY_EXCEEDED", "ID_CONFLICT",
    ]));
    expect(report.plan.totalRecords).toBe(3);
  });
});
