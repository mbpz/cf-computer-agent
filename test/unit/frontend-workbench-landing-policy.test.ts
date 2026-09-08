// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldAutoLoadScene } from "../../frontend/pages/workbench-landing/workbench-scene-policy";

describe("landing automatic loading", () => {
  // Catches a static preference accidentally starting the GPU/network workload.
  it.each([
    [false, false, false, true],
    [true, false, false, false],
    [false, true, false, false],
    [false, false, true, false],
    [true, true, true, false],
  ])("reduceMotion=%s saveData=%s staticMode=%s → %s", (reduceMotion, saveData, staticMode, want) => {
    expect(shouldAutoLoadScene({ reduceMotion, saveData, staticMode })).toBe(want);
  });
});
