import { describe, expect, it } from "vitest";
import { buildKnowledgeExport } from "../../src/ops/export-package";
import { runRestoreDrill } from "../../src/ops/restore-drill";

const makePackage = () => buildKnowledgeExport({
  exportId: "drill-export-1", generatedAt: "2026-08-26T00:00:00.000Z", schemaFingerprint: "migrations-0024",
  members: [], spaces: [], collections: [], submissions: [], reviews: [], sources: [], sourceVersions: [], knowledgeItems: [], revisions: [], researchRuns: [], researchReports: [], privateNotes: [], assets: [],
});

describe("offline restore drill", () => {
  it("records a reproducible successful drill with timing and no writes", async () => {
    const report = await runRestoreDrill(await makePackage(), {
      drillId: "drill-1", startedAt: "2026-08-26T01:00:00.000Z", completedAt: "2026-08-26T01:00:00.125Z", expectedSchemaFingerprint: "migrations-0024", actor: { memberId: "admin-1", role: "admin" }, memberMap: {},
    });
    expect(report.status).toBe("passed");
    expect(report.elapsedMs).toBe(125);
    expect(report.writes).toBe("none");
    expect(report.stages.map((stage) => stage.name)).toEqual(["import-dry-run", "restore-plan", "derived-index-plan"]);
  });

  it("records differences and bounded failure handling instead of writing", async () => {
    const report = await runRestoreDrill(await makePackage(), {
      drillId: "drill-2", startedAt: "2026-08-26T01:00:00.000Z", completedAt: "2026-08-26T01:00:01.000Z", expectedSchemaFingerprint: "migrations-9999", actor: { memberId: "member-1", role: "contributor" }, memberMap: {},
    });
    expect(report.status).toBe("failed");
    expect(report.differences.map((difference) => difference.code)).toEqual(expect.arrayContaining(["IMPORT_FORBIDDEN", "SCHEMA_MISMATCH"]));
    expect(report.failureHandling).toEqual(["stop-before-write", "retain-export", "repair-and-rerun"]);
  });
});
