// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../frontend/lib/admin-batch-review-data";

describe("receipt query concurrency", () => {
  it("keeps at most four reads pending and preserves result order", async () => {
    let active = 0; let peak = 0;
    const results = await mapWithConcurrency(Array.from({ length: 20 }, (_, index) => index), 4, undefined, async (item) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(results).toHaveLength(20);
    expect(results[0]).toBe(0);
    expect(results[19]).toBe(38);
  });

  it("stops scheduling new reads when the batch is cancelled", async () => {
    const controller = new AbortController();
    let started = 0;
    const pending = mapWithConcurrency(Array.from({ length: 20 }, (_, index) => index), 4, controller.signal, async (item) => {
      started += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return item;
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(started).toBeLessThan(20);
  });
});
