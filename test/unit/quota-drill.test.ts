import { describe, expect, it } from "vitest";
import { buildQuotaFailureDrill } from "../../src/ops/quota-drill";

describe("quota failure drill", () => {
  it("covers every Cloudflare component with an explicit bounded fallback", () => {
    const report = buildQuotaFailureDrill([
      { component: "d1", state: "exhausted" }, { component: "r2", state: "unbound" }, { component: "do", state: "failed" },
      { component: "ai", state: "near_limit" }, { component: "vectorize", state: "unbound" }, { component: "queue", state: "exhausted" },
    ]);
    expect(report.ok).toBe(true);
    expect(report.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "d1", action: "block_writes" }),
      expect.objectContaining({ component: "r2", action: "metadata_only" }),
      expect.objectContaining({ component: "do", action: "retryable_error" }),
      expect.objectContaining({ component: "ai", action: "defer_ai" }),
      expect.objectContaining({ component: "vectorize", action: "fts_only" }),
      expect.objectContaining({ component: "queue", action: "d1_recovery_scan" }),
    ]));
  });

  it("fails closed for missing, duplicate or unknown components", () => {
    expect(() => buildQuotaFailureDrill([{ component: "d1", state: "available" }])).toThrow(/component/i);
    expect(() => buildQuotaFailureDrill([
      { component: "d1", state: "available" }, { component: "d1", state: "failed" }, { component: "r2", state: "available" }, { component: "do", state: "available" }, { component: "ai", state: "available" }, { component: "vectorize", state: "available" }, { component: "queue", state: "available" },
    ])).toThrow(/component/i);
  });
});
