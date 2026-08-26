import { describe, expect, it, vi } from "vitest";
import { loadAssetResume } from "../../frontend/lib/asset-resume";

describe("asset resume data boundary", () => {
  it("loads an owner-scoped upload state by idempotency key", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      asset: { id: "asset-1", originalName: "guide.pdf", status: "ready", byteSize: 10 },
      job: { id: "job-1", status: "queued", attempts: 0 },
    }), { status: 200 }));

    await expect(loadAssetResume("resume-key-1", requester)).resolves.toEqual({
      assetId: "asset-1", originalName: "guide.pdf", assetStatus: "ready", jobStatus: "queued", attempts: 0,
    });
    expect(requester).toHaveBeenCalledWith("/api/assets/resume", expect.objectContaining({
      credentials: "same-origin", headers: { "idempotency-key": "resume-key-1" },
    }));
  });

  it("rejects malformed resume state before the queue can resume", async () => {
    const requester = vi.fn().mockResolvedValue(new Response(JSON.stringify({ asset: {} }), { status: 200 }));
    await expect(loadAssetResume("resume-key-1", requester)).rejects.toThrow("ASSET_RESUME_INVALID");
  });
});
