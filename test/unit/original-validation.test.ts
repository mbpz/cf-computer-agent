import { describe, expect, it } from "vitest";
import { buildOriginalValidationReport } from "../../src/ops/original-validation";

describe("original validation report", () => {
  it("reports valid, missing and damaged originals without deletion", () => {
    const report = buildOriginalValidationReport([
      { assetId: "asset-1", objectKey: "staging/asset-1", expectedByteSize: 3, expectedSha256: "a".repeat(64), observed: { exists: true, byteSize: 3, sha256: "a".repeat(64) } },
      { assetId: "asset-2", objectKey: "staging/asset-2", expectedByteSize: 4, expectedSha256: "b".repeat(64), observed: { exists: false } },
      { assetId: "asset-3", objectKey: "staging/asset-3", expectedByteSize: 4, expectedSha256: "c".repeat(64), observed: { exists: true, byteSize: 4, sha256: "d".repeat(64) } },
    ]);
    expect(report.checked).toBe(3);
    expect(report.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: "asset-1", status: "ok" }),
      expect.objectContaining({ assetId: "asset-2", status: "missing" }),
      expect.objectContaining({ assetId: "asset-3", status: "hash_mismatch" }),
    ]));
    expect(report.deletions).toBe(0);
  });

  it("marks an unbound storage provider instead of pretending to scan", () => {
    const report = buildOriginalValidationReport([], { storage: "unbound" });
    expect(report.status).toBe("unbound");
    expect(report.checked).toBe(0);
  });
});
