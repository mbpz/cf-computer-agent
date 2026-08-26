import { describe, expect, it } from "vitest";
import { decideAiQuota, nextUtcDay } from "../../src/ai/quota-policy";

describe("Workers AI daily quota policy", () => {
  it("reserves a bounded slice for interactive requests", () => {
    expect(decideAiQuota({ used: 75, limit: 100, cost: 6, priority: "research", interactiveReserve: 20, now: "2026-08-27T10:00:00.000Z" })).toMatchObject({ decision: "defer", state: "normal", deferredUntil: "2026-08-28T00:00:00.000Z" });
    expect(decideAiQuota({ used: 75, limit: 100, cost: 5, priority: "interactive", interactiveReserve: 20, now: "2026-08-27T10:00:00.000Z" })).toMatchObject({ decision: "allow", state: "normal", remaining: 25 });
  });

  it("defers exhausted work and computes the next UTC window", () => {
    expect(decideAiQuota({ used: 100, limit: 100, cost: 1, priority: "ingestion", now: "2026-08-27T23:59:00.000Z" })).toMatchObject({ decision: "defer", state: "exhausted", deferredUntil: "2026-08-28T00:00:00.000Z" });
    expect(nextUtcDay("2026-08-27T23:59:00.000Z")).toBe("2026-08-28T00:00:00.000Z");
  });

  it("rejects unsafe quota metadata", () => {
    expect(() => decideAiQuota({ used: -1, limit: 10, cost: 1, priority: "research", now: "2026-08-27T00:00:00.000Z" })).toThrow("AI_QUOTA_USED_INVALID");
    expect(() => nextUtcDay("invalid")).toThrow("AI_QUOTA_TIME_INVALID");
  });
});
