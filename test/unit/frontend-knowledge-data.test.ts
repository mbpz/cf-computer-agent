// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createKnowledgeRequestController, loadKnowledgePage } from "../../frontend/lib/knowledge-data";

describe("knowledge data pagination", () => {
  it("requests bounded pages and forwards cursor plus abort signal", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/knowledge?limit=20&cursor=next%2Fpage");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ items: [{ id: "k1", title: "Guide", tags: ["cf", 1] }], nextCursor: "next-2" });
    });

    await expect(loadKnowledgePage({ cursor: "next/page", requester, signal: new AbortController().signal })).resolves.toEqual({
      items: [{ id: "k1", title: "Guide", tags: ["cf"] }],
      nextCursor: "next-2",
    });
    expect(requester).toHaveBeenCalledOnce();
  });

  it("cancels the prior request and marks its generation stale", async () => {
    const signals: AbortSignal[] = [];
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>(() => undefined);
    });
    const controller = createKnowledgeRequestController(requester);
    const first = controller.request(null);
    const second = controller.request("next");
    expect(signals[0]?.aborted).toBe(true);
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    controller.cancel();
    expect(signals[1]?.aborted).toBe(true);
    expect(controller.isCurrent(second.generation)).toBe(false);
  });
});
