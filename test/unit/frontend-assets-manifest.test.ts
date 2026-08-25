// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FRONTEND_BUILD } from "../../frontend/build-contract";
import { FRONTEND_ASSET_MANIFEST } from "../../frontend/asset-manifest";

describe("React asset manifest contract", () => {
  it("keeps the React entry and output isolated from Worker public assets", () => {
    expect(FRONTEND_ASSET_MANIFEST.entry).toBe("/index.html");
    expect(FRONTEND_ASSET_MANIFEST.outputDirectory).toBe("frontend/dist");
    expect(FRONTEND_ASSET_MANIFEST.outputDirectory).not.toBe("public");
    expect(FRONTEND_BUILD.root).toBe("frontend");
  });

  it("declares only known SPA routes for a future Worker-first fallback", () => {
    expect(FRONTEND_ASSET_MANIFEST.spaRoutes).toEqual(expect.arrayContaining(["/", "/knowledge", "/search", "/agent", "/submit", "/admin"]));
    expect(FRONTEND_ASSET_MANIFEST.spaRoutes).not.toContain("/api");
    expect(FRONTEND_ASSET_MANIFEST.spaRoutes).not.toContain("/admin/publications/recover");
  });
});
