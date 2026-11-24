// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginBatchIntent, clearBatchIntent, loadBatchIntent, updateBatchIntent, type StoredBatchIntent } from "../../frontend/lib/review-batch-intent";

const action = { submissionId: "review-1", action: "reject" as const, reasonCode: "not_relevant", note: "", operationId: "batch-1", expectedUpdatedAt: "2026-10-01T00:00:00.000Z" };
const intent = (batchId: string, status: StoredBatchIntent["status"]): StoredBatchIntent => ({ version: 1, memberId: "member-a", batchId, decision: "reject", reasonCode: "not_relevant", note: "", attempts: [action], outcomes: null, status, savedAt: "2026-10-01T00:00:00.000Z" });

describe("review batch intent identity", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  });

  it("does not let a second batch overwrite an unresolved batch", () => {
    expect(beginBatchIntent(intent("batch-a", "unknown"))).toBe(true);
    expect(beginBatchIntent(intent("batch-b", "pending"))).toBe(false);
    expect(loadBatchIntent("member-a")?.batchId).toBe("batch-a");
  });

  it("only clears the batch that owns the slot", () => {
    expect(beginBatchIntent(intent("batch-a", "unknown"))).toBe(true);
    expect(clearBatchIntent("member-a", "batch-b")).toBe(false);
    expect(loadBatchIntent("member-a")?.batchId).toBe("batch-a");
    expect(clearBatchIntent("member-a", "batch-a")).toBe(true);
    expect(loadBatchIntent("member-a")).toBeNull();
  });

  it("updates only a batch that still owns the slot; a cleared record is not rebuilt", () => {
    expect(beginBatchIntent(intent("batch-a", "unknown"))).toBe(true);
    expect(clearBatchIntent("member-a", "batch-a")).toBe(true);
    expect(updateBatchIntent(intent("batch-a", "done"))).toBe(false);
    expect(loadBatchIntent("member-a")).toBeNull();
  });

  it("migrates a legacy record without batchId once and turns pending into unknown", () => {
    const legacy = { version: 1, memberId: "member-a", decision: "reject", reasonCode: "not_relevant", note: "", attempts: [action], outcomes: null, status: "pending", savedAt: "2026-10-01T00:00:00.000Z" };
    sessionStorage.setItem("memory-garden:review-batch-intent:v1:member-a", JSON.stringify(legacy));
    const first = loadBatchIntent("member-a");
    expect(first?.batchId).toBeTruthy();
    expect(first?.status).toBe("unknown");
    const second = loadBatchIntent("member-a");
    expect(second?.batchId).toBe(first?.batchId);
    expect(second?.status).toBe("unknown");
  });

  it("allows a new batch to supersede a completed one", () => {
    expect(beginBatchIntent(intent("batch-a", "done"))).toBe(true);
    expect(beginBatchIntent(intent("batch-b", "pending"))).toBe(true);
    expect(loadBatchIntent("member-a")?.batchId).toBe("batch-b");
  });
});
