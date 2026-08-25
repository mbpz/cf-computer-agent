// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { askAgent, createAgentRequestController } from "../../frontend/lib/agent-data";

describe("frontend agent data", () => {
  it("posts an explicit scope and normalizes grounded citations/confidence", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/knowledge/chat");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ question: "Where is the guide?", scope: { kind: "all" } });
      return new Response(JSON.stringify({ answer: "Use [1]", evidenceConfidence: 0.9, citations: [{ citationId: "c-1", knowledgeItemId: "k-1", title: "Guide" }, null, { citationId: "", knowledgeItemId: "k-2" }] }), { status: 200 });
    });
    await expect(askAgent({ question: "  Where is the guide?  ", scope: { kind: "all" }, requester })).resolves.toEqual({
      answer: "Use [1]",
      confidence: "high",
      citations: [{ id: "c-1", title: "Guide", href: "/knowledge/k-1#c-1" }],
    });
  });

  it("fails closed on malformed answer fields", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ answer: 42, evidenceConfidence: "high", citations: [{ citationId: "c-1", knowledgeItemId: "" }] }), { status: 200 }));
    await expect(askAgent({ question: "q", scope: { kind: "all" }, requester })).resolves.toEqual({ answer: "", confidence: "low", citations: [] });
  });

  it("cancels stale agent requests", async () => {
    const requester = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const controller = createAgentRequestController(requester);
    const first = controller.request("first", { kind: "all" });
    const second = controller.request("second", { kind: "all" });
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.cancel();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(controller.isCurrent(second.generation)).toBe(false);
  });
});
