// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { askAgent, cancelAgentConversation, createAgentRequestController, updateAgentConversationScope } from "../../frontend/lib/agent-data";

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

  it("round-trips the server conversation id for follow-up turns", async () => {
    const requester = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ question: "follow up", scope: { kind: "all" }, conversationId: "conversation-1" });
      return new Response(JSON.stringify({ answer: "Grounded", evidenceConfidence: 0.9, citations: [], conversationId: "conversation-1" }), { status: 200 });
    });
    await expect(askAgent({ question: "follow up", scope: { kind: "all" }, conversationId: "conversation-1", requester })).resolves.toMatchObject({ conversationId: "conversation-1" });
  });

  it("updates conversation sources through the explicit scope endpoint", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/knowledge/chat/conversations/conversation-1/scope");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ scope: { kind: "items", knowledgeItemIds: ["knowledge-2"] } });
      return new Response(JSON.stringify({ conversation: { id: "conversation-1" } }), { status: 200 });
    });
    await expect(updateAgentConversationScope("conversation-1", { kind: "items", knowledgeItemIds: ["knowledge-2"] }, requester)).resolves.toBeUndefined();
  });

  it("requests server-side cancellation for an active conversation", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/knowledge/chat/conversations/conversation-1/cancel");
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify({ cancelled: true }), { status: 202 });
    });
    await expect(cancelAgentConversation("conversation-1", requester)).resolves.toBe(true);
  });

  it("binds cited source context from the server source set without exposing raw content", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({
      answer: "Use [1]", evidenceConfidence: 0.8, citations: ["citation-1"],
      sources: [{ citationId: "citation-1", knowledgeItemId: "knowledge-1", title: "Guide", spaceId: "space-1", collectionId: "collection-1", headingPath: ["Guide"], startLine: 4, endLine: 8, body: "secret body" }],
    }), { status: 200 }));
    await expect(askAgent({ question: "q", scope: { kind: "all" }, requester })).resolves.toEqual({
      answer: "Use [1]", confidence: "high", citations: [{ id: "citation-1", title: "Guide", href: "/knowledge/knowledge-1#citation-1", spaceId: "space-1", collectionId: "collection-1", headingPath: ["Guide"], startLine: 4, endLine: 8 }],
    });
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
