import { describe, expect, it } from "vitest";
import { sourceSimilarity } from "../../src/sources/similarity";

describe("advisory source similarity", () => {
  it("scores near-duplicate text above unrelated text", () => {
    const near = sourceSimilarity("Cloudflare D1 backup and recovery checklist", "Cloudflare D1 backup and recovery checklist with an owner note");
    const unrelated = sourceSimilarity("Cloudflare D1 backup and recovery checklist", "Kitchen inventory weekend recipes");
    expect(near).toBeGreaterThan(0.55);
    expect(unrelated).toBe(0);
  });

  it("is bounded and does not create a signal for empty content", () => {
    expect(sourceSimilarity("", "anything")).toBe(0);
    expect(sourceSimilarity("same same", "same")).toBe(1);
    expect(sourceSimilarity("a".repeat(100_000), "b".repeat(100_000))).toBe(0);
  });
});
