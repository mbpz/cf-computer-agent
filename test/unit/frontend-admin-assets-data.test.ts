import { describe, expect, it, vi } from "vitest";
import { loadAdminAssetPreview, loadAdminAssets } from "../../frontend/lib/admin-assets-data";

describe("admin asset preview data boundary", () => {
  it("loads a filtered numbered asset page", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/admin/assets?page=1&pageSize=20&status=failed_retryable");
      return new Response(JSON.stringify({ items: [{ asset: { id: "asset-1", originalName: "guide.pdf" }, job: { status: "failed_retryable" } }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }), { status: 200 });
    });
    await expect(loadAdminAssets({ page: 1, pageSize: 20, status: "failed_retryable", requester })).resolves.toMatchObject({ items: [{ id: "asset-1", status: "failed_retryable" }], pagination: { total: 1 } });
  });
  it("loads and bounds the server preview model", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      assetId: "asset-1",
      originalName: "guide.pdf",
      markdown: "# Guide",
      warnings: ["No title", 42],
      lineCount: 1,
      parserSchemaVersion: "v1",
    }), { status: 200 }));
    await expect(loadAdminAssetPreview("asset-1", requester)).resolves.toMatchObject({ assetId: "asset-1", originalName: "guide.pdf", warnings: ["No title"] });
    expect(requester).toHaveBeenCalledWith("/api/admin/assets/asset-1/preview", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("rejects malformed preview payloads", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ assetId: "asset-1" }), { status: 200 }));
    await expect(loadAdminAssetPreview("asset-1", requester)).rejects.toThrow("ASSET_PREVIEW_INVALID");
  });
});
