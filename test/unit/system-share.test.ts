import { describe, expect, it, vi } from "vitest";
import { knowledgeShareUrl, shareKnowledgeItem } from "../../frontend/lib/system-share";

describe("system share boundary", () => {
  it("allows only opaque same-origin knowledge links and requires confirmation", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    await expect(shareKnowledgeItem({ id: "knowledge-1", title: "Guide", origin: "https://memory.crgmhrc.asia", navigator: { share }, confirm: () => true })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Guide", url: "https://memory.crgmhrc.asia/knowledge/knowledge-1" });
    await expect(shareKnowledgeItem({ id: "knowledge-1", title: "Guide", origin: "https://memory.crgmhrc.asia", navigator: { share }, confirm: () => false })).resolves.toBe("cancelled");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("fails closed for malformed IDs or missing system share", async () => {
    expect(() => knowledgeShareUrl("../secret", "https://memory.crgmhrc.asia")).toThrow("SHARE_TARGET_INVALID");
    await expect(shareKnowledgeItem({ id: "knowledge-1", title: "Guide", origin: "https://memory.crgmhrc.asia", navigator: {}, confirm: () => true })).rejects.toThrow("SHARE_UNAVAILABLE");
  });
});
