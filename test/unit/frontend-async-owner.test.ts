// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAsyncOwner } from "../../frontend/lib/async-owner";

describe("async owner guard", () => {
  it("accepts only the latest token and invalidates on disposal", () => {
    const owner = createAsyncOwner();
    const first = owner.claim();
    const second = owner.claim();
    expect(owner.isCurrent(first)).toBe(false);
    expect(owner.isCurrent(second)).toBe(true);
    owner.invalidate();
    expect(owner.isCurrent(second)).toBe(false);
  });

  it("does not reuse tokens after invalidation", () => {
    const owner = createAsyncOwner();
    const first = owner.claim();
    owner.invalidate();
    const next = owner.claim();
    expect(next).toBeGreaterThan(first);
    expect(owner.isCurrent(next)).toBe(true);
  });
});
