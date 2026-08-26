import { describe, expect, it } from "vitest";
import { buildTaskDashboard } from "../../src/ops/task-dashboard";

describe("task dashboard", () => {
  it("aggregates bounded backlog, age, failures, retries and quota", () => {
    const dashboard = buildTaskDashboard([
      { id: "task-1", kind: "index", state: "pending", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:05:00.000Z", attempts: 0, maxAttempts: 3 },
      { id: "task-2", kind: "parse", state: "failed_retryable", createdAt: "2026-08-26T00:02:00.000Z", updatedAt: "2026-08-26T00:04:00.000Z", attempts: 2, maxAttempts: 3 },
      { id: "task-3", kind: "research", state: "failed_terminal", createdAt: "2026-08-26T00:01:00.000Z", updatedAt: "2026-08-26T00:03:00.000Z", attempts: 3, maxAttempts: 3 },
    ], { now: "2026-08-26T00:10:00.000Z", quota: { dailyUsed: 8, dailyLimit: 10 } });
    expect(dashboard.backlog).toMatchObject({ pending: 1, failedRetryable: 1, oldestAgeMs: 600_000 });
    expect(dashboard.failures).toEqual({ retryable: 1, terminal: 1 });
    expect(dashboard.retries).toEqual({ attempted: 5, exhausted: 1 });
    expect(dashboard.quota).toEqual({ dailyUsed: 8, dailyLimit: 10, percent: 80, state: "degraded" });
  });

  it("rejects unbounded or malformed task input", () => {
    expect(() => buildTaskDashboard([{ id: "bad", kind: "x", state: "pending", createdAt: "bad", updatedAt: "bad", attempts: 0, maxAttempts: 1 }], { now: "2026-08-26T00:00:00.000Z" })).toThrow(/task/i);
  });
});
