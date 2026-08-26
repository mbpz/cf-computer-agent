import { describe, expect, it } from "vitest";
import { assertSafeSyntheticText, buildSyntheticProbePlan, createProbeRateLimiter } from "../../src/evaluation/synthetic-probe";

describe("production synthetic probe plan", () => {
  it("builds a bounded, non-sensitive, cleanup-required plan for a custom HTTPS domain", () => {
    const plan = buildSyntheticProbePlan({ baseUrl: "https://memory.example.test/", runId: "20260827-a" });
    expect(plan).toMatchObject({
      baseUrl: "https://memory.example.test",
      maxRequests: 6,
      rateLimit: { windowMs: 60 * 60 * 1000, maxRuns: 1 },
      cleanup: { required: true, strategy: "admin-purge-after-retention" },
    });
    expect(plan.fixture.content).toContain(plan.fixture.marker);
    expect(() => assertSafeSyntheticText(plan.fixture.content)).not.toThrow();
  });

  it("rejects worker URLs, credentials, and sensitive fixture markers", () => {
    expect(() => buildSyntheticProbePlan({ baseUrl: "https://example.workers.dev", runId: "ok" })).toThrow("SYNTHETIC_BASE_URL_INVALID");
    expect(() => assertSafeSyntheticText("Bearer super-secret")).toThrow("SYNTHETIC_FIXTURE_SENSITIVE");
    expect(() => assertSafeSyntheticText("operator@example.com")).toThrow("SYNTHETIC_FIXTURE_SENSITIVE");
  });

  it("limits runs to one per window and resets after the window", () => {
    let now = 0;
    const limiter = createProbeRateLimiter({ windowMs: 60_000, now: () => now });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    now = 60_000;
    expect(limiter.tryAcquire()).toBe(true);
  });

  it("rejects unbounded plan metadata", () => {
    expect(() => buildSyntheticProbePlan({ baseUrl: "https://memory.example.test", runId: "ok", maxRequests: 9 })).toThrow("SYNTHETIC_REQUEST_BOUND_INVALID");
    expect(() => buildSyntheticProbePlan({ baseUrl: "https://memory.example.test", runId: "ok", windowMs: 1 })).toThrow("SYNTHETIC_WINDOW_INVALID");
  });
});
