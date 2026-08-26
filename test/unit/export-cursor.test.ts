import { describe, expect, it } from "vitest";
import { pageExportRecords } from "../../src/ops/export-cursor";

const records = ["item-3", "item-1", "item-5", "item-2", "item-4"].map((id) => ({ id, value: id }));
const snapshotSha256 = "a".repeat(64);

describe("incremental export cursor", () => {
  it("pages a stable snapshot without gaps or duplicates", () => {
    const first = pageExportRecords(records, { exportId: "export-1", category: "members", snapshotSha256, limit: 2 });
    const second = pageExportRecords(records, { exportId: "export-1", category: "members", snapshotSha256, limit: 2, cursor: first.nextCursor });
    const third = pageExportRecords(records, { exportId: "export-1", category: "members", snapshotSha256, limit: 2, cursor: second.nextCursor });

    expect(first.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
    expect(second.items.map((item) => item.id)).toEqual(["item-3", "item-4"]);
    expect(third.items.map((item) => item.id)).toEqual(["item-5"]);
    expect(third.nextCursor).toBeUndefined();
  });

  it("rejects cursor reuse across snapshots and categories", () => {
    const first = pageExportRecords(records, { exportId: "export-1", category: "members", snapshotSha256, limit: 2 });
    expect(() => pageExportRecords(records, { exportId: "export-1", category: "spaces", snapshotSha256, limit: 2, cursor: first.nextCursor })).toThrow(/cursor/i);
    expect(() => pageExportRecords(records, { exportId: "export-1", category: "members", snapshotSha256: "b".repeat(64), limit: 2, cursor: first.nextCursor })).toThrow(/cursor/i);
  });
});
