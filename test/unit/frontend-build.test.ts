// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FRONTEND_BUILD } from "../../frontend/build-contract";

describe("frontend build contract", () => {
  it("has a React root entry and deterministic frontend build scripts", () => {
    expect(FRONTEND_BUILD.entry).toBe("/main.tsx");
    expect(FRONTEND_BUILD.root).toBe("frontend");
  });

  it("keeps the build output separate from Worker source assets", () => {
    expect(FRONTEND_BUILD.outDir).toBe("dist");
    expect(FRONTEND_BUILD.outDir).not.toBe("../public");
  });

  it("builds React assets before Wrangler validates the assets directory", () => {
    const build = FRONTEND_BUILD.command;
    expect(build.indexOf("npm run build:ui")).toBeGreaterThanOrEqual(0);
    expect(build.indexOf("npm run build:ui")).toBeLessThan(build.indexOf("wrangler deploy --dry-run"));
  });
});
