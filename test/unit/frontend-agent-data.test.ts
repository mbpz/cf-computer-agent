// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadAgentConversations, submitAgentFeedback, agentLocationFromSearch, loadAgentConversation, askAgent, cancelAgentConversation, createAgentRequestController, updateAgentConversationScope } from "../../frontend/lib/agent-data";

describe("frontend agent data", () => {
  it("loads bounded history pages and rejects malformed or duplicate identifiers", async () => {
    const item = { id: "conv-1", createdAt: "2026-09-26T00:00:00.000Z" };
    const requester = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ items: [item], nextCursor: "opaque_123" }));
    await expect(loadAgentConversations({ cursor: "prior_123", requester })).resolves.toEqual({ items: [item], nextCursor: "opaque_123" });
    expect(requester.mock.calls[0]?.[0]).toBe("/api/knowledge/chat/conversations?limit=20&cursor=prior_123");
    for (const value of [{ items: [item, item] }, { items: [{ ...item, id: "../bad" }] }, { items: [{ ...item, createdAt: "yesterday" }] }, { items: [], nextCursor: "bad?" }, { items: [] , nextCursor: "opaque" }, { items: Array(21).fill(item) }]) {
      await expect(loadAgentConversations({ requester: async () => Response.json(value) })).rejects.toThrow();
    }
  });

  it("parses explicit source scopes without silently widening malformed links", () => {
    expect(agentLocationFromSearch("")).toEqual({ scope: { kind: "all" } });
    expect(agentLocationFromSearch("?scope=space&spaceId=s-1")).toEqual({ scope: { kind: "space", spaceId: "s-1" } });
    expect(agentLocationFromSearch("?scope=collection&collectionId=c-1")).toEqual({ scope: { kind: "collection", collectionId: "c-1" } });
    expect(agentLocationFromSearch("?scope=items&knowledgeItemId=k-1&knowledgeItemId=k-2")).toEqual({ scope: { kind: "items", knowledgeItemIds: ["k-1", "k-2"] } });
    expect(agentLocationFromSearch("?conversationId=conv-1")).toEqual({ conversationId: "conv-1" });
    for (const search of ["?scope=items", "?scope=wat", "?scope=all&spaceId=s", "?spaceId=s", "?scope=all&scope=items", "?scope=items&knowledgeItemId=x&knowledgeItemId=x", "?scope=space&spaceId=a.b", "?conversationId=", "?conversationId=x&scope=all", "?conversationId=x&conversationId=y"]) {
      expect(() => agentLocationFromSearch(search), search).toThrow();
    }
  });

  it("loads a validated conversation without a mutation and rejects mismatched recovery data", async () => {
    const valid = { conversation: { id: "conv-1", scope: { kind: "all" } }, messages: [{ role: "user", content: "Earlier question", citationIds: [] }], sources: [] };
    const requester = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(valid)));
    await expect(loadAgentConversation("conv-1", { requester })).resolves.toMatchObject({ id: "conv-1", scope: { kind: "all" }, messages: [{ role: "user", content: "Earlier question" }] });
    expect(String(requester.mock.calls[0]?.[0])).toBe("/api/knowledge/chat/conversations/conv-1");
    expect(requester.mock.calls[0]?.[1]?.method).toBe("GET");
    for (const data of [null, { ...valid, conversation: { ...valid.conversation, id: "other" } }, { ...valid, messages: [{ role: "assistant", content: "private answer", citationIds: ["missing"] }] }, { ...valid, messages: Array(9).fill(valid.messages[0]) }]) {
      await expect(loadAgentConversation("conv-1", { requester: async () => new Response(JSON.stringify(data)) })).rejects.toThrow();
    }
  });

  it("accepts valid recovery scope regardless of JSON key order while rejecting unknown scope fields", async () => {
    const payload = { conversation: { id: "conv-1", scope: { spaceId: "s-1", kind: "space" } }, messages: [], sources: [] };
    await expect(loadAgentConversation("conv-1", { requester: async () => new Response(JSON.stringify(payload)) })).resolves.toMatchObject({ scope: { kind: "space", spaceId: "s-1" } });
    await expect(loadAgentConversation("conv-1", { requester: async () => new Response(JSON.stringify({ ...payload, conversation: { ...payload.conversation, scope: { kind: "all", spaceId: "private" } } })) })).rejects.toThrow();
  });

  it("preserves the server's insufficient-evidence marker and allowlists suggestions", async () => {
    await expect(askAgent({ question: "unknown", scope: { kind: "all" }, requester: async () => new Response(JSON.stringify({ answer: "No evidence", messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT", suggestedActionKeys: ["KNOWLEDGE_CHAT_REWRITE_QUESTION", "run-untrusted-action", "KNOWLEDGE_CHAT_EXPAND_SCOPE", "KNOWLEDGE_CHAT_EXPAND_SCOPE"] })) })).resolves.toMatchObject({ insufficientEvidence: true, suggestions: ["rewrite", "sources"] });
    await expect(askAgent({ question: "unknown", scope: { kind: "all" }, requester: async () => new Response(JSON.stringify({ messageKey: "something-else", suggestedActionKeys: ["KNOWLEDGE_CHAT_EXPAND_SCOPE"] })) })).resolves.not.toHaveProperty("insufficientEvidence");
  });

  it("requires a matching feedback receipt before confirming a write", async () => {
    const feedback = { conversationId: "conv-1", rating: "not_useful", citationIds: ["c-1"] };
    const requester = vi.fn(async () => new Response(JSON.stringify({ feedback })));
    await expect(submitAgentFeedback("conv-1", "not_useful", ["c-1"], requester)).resolves.toBeUndefined();
    for (const receipt of [null, { ...feedback, conversationId: "other" }, { ...feedback, rating: "useful" }, { ...feedback, citationIds: [] }]) {
      await expect(submitAgentFeedback("conv-1", "not_useful", ["c-1"], async () => new Response(JSON.stringify({ feedback: receipt })))).rejects.toThrow();
    }
  });

  it("requires the original key and conversation in a keyed answer receipt", async () => {
    const key = "original-chat-key01";
    const request = { question: "Follow up", scope: { kind: "all" as const }, conversationId: "conv-1", idempotencyKey: key };
    const valid = { answer: "Done", conversationId: "conv-1", idempotencyKey: key, citations: [] };
    for (const receipt of [{ ...valid, conversationId: "conv-other" }, { ...valid, idempotencyKey: "different-chat-key" }, { ...valid, answer: null }]) {
      await expect(askAgent({ ...request, requester: async () => Response.json(receipt) })).rejects.toThrow();
    }
    await expect(askAgent({ ...request, requester: async () => Response.json(valid) })).resolves.toMatchObject({ answer: "Done", conversationId: "conv-1" });
  });

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
  it("does not send remote cancellation after an answer has completed", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({ answer: "Done", conversationId: "conversation-1", citations: [] })));
    const controller = createAgentRequestController(requester);
    await controller.request("Question", { kind: "all" }, "conversation-1").promise;
    controller.cancel("conversation-1");
    expect(requester).toHaveBeenCalledTimes(1);
  });

});
