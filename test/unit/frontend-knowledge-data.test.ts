// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createKnowledgeRequestController, loadKnowledgePage } from "../../frontend/lib/knowledge-data";

describe("knowledge data pagination", () => {
  it("requests a numbered filtered page and forwards the abort signal", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/knowledge?page=2&pageSize=20&spaceId=space-a&kind=markdown");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ items: [{ id: "k1", title: "Guide", tags: ["cf", 1] }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
    });
    await expect(loadKnowledgePage({ page: 2, pageSize: 20, spaceId: "space-a", kind: "markdown", requester, signal: new AbortController().signal })).resolves.toEqual({
      items: [{ id: "k1", title: "Guide", tags: ["cf"] }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    });
  });

  it("cancels the prior numbered request and marks its generation stale", () => {
    const signals: AbortSignal[] = [];
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => { signals.push(init?.signal as AbortSignal); return new Promise<Response>(() => undefined); });
    const controller = createKnowledgeRequestController(requester);
    const first = controller.request({ page: 1, pageSize: 20 });
    const second = controller.request({ page: 2, pageSize: 20 });
    expect(signals[0]?.aborted).toBe(true);
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    controller.dispose();
    expect(signals[1]?.aborted).toBe(true);
  });
});
