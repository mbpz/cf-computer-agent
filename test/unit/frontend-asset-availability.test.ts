// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadAssetAvailability } from "../../frontend/lib/asset-availability";

describe("asset availability loader", () => {
  it.each([false, true])("reads the authenticated configuration contract: %s", async (enabled) => {
    const value = { storageEnabled: enabled, reason: enabled ? null : "ASSET_STORAGE_NOT_CONFIGURED", maxBytes: 1024 };
    const controller = new AbortController();
    expect(await loadAssetAvailability({ signal: controller.signal, requester: async (path, init) => {
      expect(path).toBe("/api/assets/availability");
      expect(init).toMatchObject({ method: "GET", credentials: "same-origin", signal: controller.signal });
      return Response.json(value);
    } })).toEqual(value);
  });
  it.each([null, {}, [], { storageEnabled: true, reason: "ASSET_STORAGE_NOT_CONFIGURED", maxBytes: 1 },
    { storageEnabled: false, reason: null, maxBytes: 1 },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1024"].map(maxBytes => ({ storageEnabled: false, reason: "ASSET_STORAGE_NOT_CONFIGURED", maxBytes }))
  ])("rejects malformed payloads instead of reporting disabled: %j", async (value) => {
    await expect(loadAssetAvailability({ requester: async () => Response.json(value) })).rejects.toThrow();
  });
  it("rejects a successful non-JSON response", async () => {
    await expect(loadAssetAvailability({ requester: async () => new Response("<html>login</html>") })).rejects.toThrow();
  });
  it.each([401, 403, 503])("keeps read failure distinct from configuration: %s", async status => {
    await expect(loadAssetAvailability({ requester: async () => Response.json({}, { status }) })).rejects.toMatchObject({ status });
  });
});
