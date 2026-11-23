// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearBatchIntent, loadBatchIntent, saveBatchIntent, type StoredBatchIntent } from "../../frontend/lib/review-batch-intent";

const action = { submissionId: "review-1", action: "reject" as const, reasonCode: "not_relevant", note: "", operationId: "batch-1", expectedUpdatedAt: "2026-10-01T00:00:00.000Z" };
const intent = (batchId: string, status: StoredBatchIntent["status"]): StoredBatchIntent => ({ version: 1, memberId: "member-a", batchId, decision: "reject", reasonCode: "not_relevant", note: "", attempts: [action], outcomes: null, status, savedAt: "2026-10-01T00:00:00.000Z" });

describe("review batch intent identity", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  });

  it("does not let a second batch overwrite an unresolved batch", () => {
    expect(saveBatchIntent(intent("batch-a", "unknown"))).toBe(true);
    expect(saveBatchIntent(intent("batch-b", "pending"))).toBe(false);
    expect(loadBatchIntent("member-a")?.batchId).toBe("batch-a");
  });

  it("only clears the batch that owns the slot", () => {
    expect(saveBatchIntent(intent("batch-a", "unknown"))).toBe(true);
    expect(clearBatchIntent("member-a", "batch-b")).toBe(false);
    expect(loadBatchIntent("member-a")?.batchId).toBe("batch-a");
    expect(clearBatchIntent("member-a", "batch-a")).toBe(true);
    expect(loadBatchIntent("member-a")).toBeNull();
  });

  it("allows a new batch to supersede a completed one", () => {
    expect(saveBatchIntent(intent("batch-a", "done"))).toBe(true);
    expect(saveBatchIntent(intent("batch-b", "pending"))).toBe(true);
    expect(loadBatchIntent("member-a")?.batchId).toBe("batch-b");
  });
});
