import { describe, expect, it } from "vitest";
import { decideExperimentalMedia } from "../../src/ai/experimental-media-policy";

describe("experimental media safety policy", () => {
  const base = { kind: "audio" as const, qualityScore: 1, used: 0, limit: 10, cost: 2, now: "2026-08-27T12:00:00.000Z" };

  it("is closed by default and keeps the experiment quota scope explicit", () => {
    expect(decideExperimentalMedia(base)).toMatchObject({ decision: "block", reason: "disabled", quotaScope: "experimental-media" });
    expect(decideExperimentalMedia({ ...base, enabled: true })).toMatchObject({ decision: "allow", remaining: 8, quotaScope: "experimental-media" });
  });

  it("blocks every quality score other than exactly 1.0 before spending quota", () => {
    expect(decideExperimentalMedia({ ...base, enabled: true, qualityScore: 0.999, used: 9 })).toMatchObject({ decision: "block", reason: "quality_gate", remaining: 1 });
  });

  it("defers exhausted media quota to the next UTC day", () => {
    expect(decideExperimentalMedia({ ...base, kind: "video", enabled: true, used: 9 })).toMatchObject({
      decision: "block", reason: "quota", deferredUntil: "2026-08-28T00:00:00.000Z", quotaScope: "experimental-media",
    });
  });

  it("rejects malformed policy metadata", () => {
    expect(() => decideExperimentalMedia({ ...base, limit: 0 })).toThrow("MEDIA_QUOTA_LIMIT_INVALID");
    expect(() => decideExperimentalMedia({ ...base, qualityScore: 1.1 })).toThrow("MEDIA_QUALITY_INVALID");
  });
});
