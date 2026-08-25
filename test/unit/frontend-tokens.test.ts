// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FRONTEND_TOKEN_NAMES,
  FRONTEND_TOKEN_POLICY,
} from "../../frontend/styles/token-contract";

describe("frontend design tokens", () => {
  it("defines the neutral light and dark surfaces", () => {
    expect(FRONTEND_TOKEN_POLICY.lightSelector).toBe(":root");
    expect(FRONTEND_TOKEN_POLICY.darkSelector).toBe(".dark");
    for (const token of [
      "background",
      "foreground",
      "primary",
      "primary-foreground",
      "muted",
      "border",
      "destructive",
    ] as const) {
      expect(FRONTEND_TOKEN_NAMES).toContain(token);
    }
  });

  it("keeps motion accessible and the accent restrained", () => {
    expect(FRONTEND_TOKEN_NAMES).toContain("ring");
    expect(FRONTEND_TOKEN_POLICY.reducedMotionMedia).toBe(
      "(prefers-reduced-motion: reduce)",
    );
    expect(FRONTEND_TOKEN_POLICY.forbidDecorativeGradients).toBe(true);
  });
});
