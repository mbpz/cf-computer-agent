// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { askAgentSessionStream, agentLocationFromSearch, createAgentRequestController, createAgentSession, loadAgentMessages, loadAgentSession, terminateAgentTurn } from "../../frontend/lib/agent-data";

const SESSION = "abcdefghijklmnopqrstuvwx";
const TURN = "8f14e45f-ceea-4670-a1c6-8c1b2d3e4f50";

/** The grounded session stream: a terminal frame names the session and turn. */
function streamed(body: Record<string, unknown>, init: ResponseInit = { status: 200, headers: { "x-agent-turn-id": TURN } }): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "text/event-stream");
  return new Response(`data: ${JSON.stringify({ stage: "answer", body: { answer: "", sessionId: SESSION, conversationId: SESSION, turnId: TURN, evidenceConfidence: 0.9, citations: [], sources: [], ...body } })}\n\n`, { ...init, headers });
}

describe("frontend agent session data", () => {
  it("parses explicit source scopes without silently widening malformed links", () => {
    expect(agentLocationFromSearch("")).toEqual({ scope: { kind: "all" } });
    expect(agentLocationFromSearch("?scope=space&spaceId=s-1")).toEqual({ scope: { kind: "space", spaceId: "s-1" } });
    expect(agentLocationFromSearch("?scope=collection&collectionId=c-1")).toEqual({ scope: { kind: "collection", collectionId: "c-1" } });
    expect(agentLocationFromSearch("?scope=items&knowledgeItemId=k-1&knowledgeItemId=k-2")).toEqual({ scope: { kind: "items", knowledgeItemIds: ["k-1", "k-2"] } });
    // `conversationId` is the legacy URL name for the durable session id.
    expect(agentLocationFromSearch("?conversationId=conv-1")).toEqual({ conversationId: "conv-1" });
    for (const search of ["?scope=items", "?scope=wat", "?scope=all&spaceId=s", "?spaceId=s", "?scope=all&scope=items", "?scope=items&knowledgeItemId=x&knowledgeItemId=x", "?scope=space&spaceId=a.b", "?conversationId=", "?conversationId=x&scope=all", "?conversationId=x&conversationId=y"]) {
      expect(() => agentLocationFromSearch(search), search).toThrow();
    }
  });

  it("creates and reads only strictly valid member sessions", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/agent/sessions");
      expect(init?.method).toBe("POST");
      return Response.json({ session: { id: SESSION, memberId: "member-a" } });
    });
    await expect(createAgentSession(requester)).resolves.toBe(SESSION);
    for (const data of [null, { session: null }, { session: { id: "short" } }, { session: { id: "../escape" } }]) {
      await expect(createAgentSession(async () => Response.json(data))).rejects.toThrow();
    }

    const read = vi.fn(async (_input: string | URL | Request) => Response.json({ session: { id: SESSION } }));
    await expect(loadAgentSession(SESSION, { requester: read })).resolves.toEqual({ id: SESSION });
    expect(String(read.mock.calls[0]?.[0])).toBe(`/api/agent/sessions/${SESSION}`);
    await expect(loadAgentSession(SESSION, { requester: async () => Response.json({ session: { id: "other-session-identifier" } }) })).rejects.toThrow();
  });

  it("loads bounded history oldest-first and rejects malformed pages", async () => {
    const items = [
      { id: "m-2", role: "assistant", content: "Earlier answer", createdAt: "2026-10-18T00:00:02.000Z" },
      { id: "m-1", role: "user", content: "Earlier question", createdAt: "2026-10-18T00:00:01.000Z" },
    ];
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(`/api/agent/sessions/${SESSION}/messages?limit=20`);
      expect(init?.method).toBe("GET");
      return Response.json({ messages: { items, truncated: false } });
    });
    await expect(loadAgentMessages(SESSION, 20, { requester })).resolves.toEqual({
      messages: [
        { role: "user", content: "Earlier question", citations: [] },
        { role: "assistant", content: "Earlier answer", citations: [] },
      ],
      truncated: false,
    });
    for (const data of [null, { messages: null }, { messages: { items: "no" } }, { messages: { items: [{ id: "x", role: "tool", content: "t" }], truncated: false } }, { messages: { items: [items[0], items[0]], truncated: false } }]) {
      await expect(loadAgentMessages(SESSION, 20, { requester: async () => Response.json(data) })).rejects.toThrow();
    }
  });

  it("requires the owner turn receipt before confirming a termination", async () => {
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(`/api/agent/sessions/${SESSION}/turns/${TURN}/terminate`);
      expect(init?.method).toBe("POST");
      return Response.json({ turn: { turnId: TURN, status: "terminated" } });
    });
    await expect(terminateAgentTurn(SESSION, TURN, requester)).resolves.toBeUndefined();
    for (const data of [null, { turn: { turnId: TURN, status: "active" } }, { turn: { turnId: "different-turn-id-0001", status: "terminated" } }]) {
      await expect(terminateAgentTurn(SESSION, TURN, async () => Response.json(data))).rejects.toThrow();
    }
  });

  it("posts the question and scope, reports stages and validates the terminal receipt", async () => {
    const stages: string[] = [];
    const turns: string[] = [];
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(`/api/agent/sessions/${SESSION}/stream`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ question: "Where is the guide?", scope: { kind: "space", spaceId: "s-1" } });
      return new Response([
        `data: ${JSON.stringify({ stage: "retrieving" })}\n\n`,
        `data: ${JSON.stringify({ stage: "evidence" })}\n\n`,
        `data: ${JSON.stringify({ stage: "answer", body: { sessionId: SESSION, conversationId: SESSION, turnId: TURN, answer: "Use [1]", evidenceConfidence: 0.9, citations: [{ citationId: "c-1", knowledgeItemId: "k-1", title: "Guide", spaceId: "s-1" }], sources: [] } })}\n\n`,
      ].join(""), { headers: { "content-type": "text/event-stream", "x-agent-turn-id": TURN } });
    });
    await expect(askAgentSessionStream({ sessionId: SESSION, question: "  Where is the guide?  ", scope: { kind: "space", spaceId: "s-1" }, requester, onStage: (stage) => stages.push(stage), onTurn: (turnId) => turns.push(turnId) })).resolves.toEqual({
      answer: "Use [1]",
      confidence: "high",
      citations: [{ id: "c-1", title: "Guide", href: "/knowledge/k-1#c-1", spaceId: "s-1" }],
      conversationId: SESSION,
      sessionId: SESSION,
      turnId: TURN,
    });
    expect(stages).toEqual(["retrieving", "evidence"]);
    expect(turns).toEqual([TURN]);
  });

  it("accepts the no-evidence marker and allowlists its suggestions", async () => {
    const answer = await askAgentSessionStream({
      sessionId: SESSION, question: "unknown", scope: { kind: "all" },
      requester: async () => streamed({ answer: "No evidence", messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT", suggestedActionKeys: ["KNOWLEDGE_CHAT_REWRITE_QUESTION", "run-untrusted-action", "KNOWLEDGE_CHAT_EXPAND_SCOPE", "KNOWLEDGE_CHAT_EXPAND_SCOPE"] }),
    });
    expect(answer).toMatchObject({ insufficientEvidence: true, suggestions: ["rewrite", "sources"] });
    const other = await askAgentSessionStream({ sessionId: SESSION, question: "unknown", scope: { kind: "all" }, requester: async () => streamed({ messageKey: "something-else", suggestedActionKeys: ["KNOWLEDGE_CHAT_EXPAND_SCOPE"] }) });
    expect(other).not.toHaveProperty("insufficientEvidence");
  });

  it("fails closed on a mismatched session, turn, or incomplete answer receipt", async () => {
    const valid = { answer: "Done", citations: [], sources: [] };
    const cases: Array<Record<string, unknown>> = [
      { ...valid, sessionId: "other-session-identifier" },
      { ...valid, conversationId: "other-session-identifier" },
      { ...valid, turnId: "00000000-0000-0000-0000-000000000000" },
      { ...valid, answer: 42 },
      { ...valid, evidenceConfidence: "high" },
      { ...valid, citations: [{ citationId: "c-1", knowledgeItemId: "" }] },
      { ...valid, sources: [{}] },
    ];
    for (const body of cases) {
      await expect(askAgentSessionStream({ sessionId: SESSION, question: "q", scope: { kind: "all" }, requester: async () => streamed(body) })).rejects.toThrow();
    }
    await expect(askAgentSessionStream({ sessionId: SESSION, question: "q", scope: { kind: "all" }, requester: async () => streamed(valid) })).resolves.toMatchObject({ answer: "Done", sessionId: SESSION, turnId: TURN });
  });

  it("reports stream errors and refuses to confirm an unterminated stream", async () => {
    const failed = `data: ${JSON.stringify({ stage: "error", error: { code: "AI_UNAVAILABLE", message: "AI service is temporarily unavailable", status: 503, retryable: true } })}\n\n`;
    await expect(askAgentSessionStream({ sessionId: SESSION, question: "q", scope: { kind: "all" }, requester: async () => new Response(failed, { headers: { "content-type": "text/event-stream", "x-agent-turn-id": TURN } }) })).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503, retryable: true });
    const truncated = `data: ${JSON.stringify({ stage: "generating" })}\n\n`;
    await expect(askAgentSessionStream({ sessionId: SESSION, question: "q", scope: { kind: "all" }, requester: async () => new Response(truncated, { headers: { "content-type": "text/event-stream", "x-agent-turn-id": TURN } }) })).rejects.toMatchObject({ code: "AGENT_STREAM_INTERRUPTED" });
    await expect(askAgentSessionStream({ sessionId: SESSION, question: "q", scope: { kind: "all" }, requester: async () => new Response(null, { status: 503 }) })).rejects.toMatchObject({ status: 503 });
  });

  it("cancels stale requests and terminates exactly the observed turn once", async () => {
    const calls: string[] = [];
    const requester = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).endsWith(`/turns/${TURN}/terminate`)) return Promise.resolve(Response.json({ turn: { turnId: TURN, status: "terminated" } }));
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    });
    const controller = createAgentRequestController(requester);
    const first = controller.request(SESSION, "first", { kind: "all" });
    const second = controller.request(SESSION, "second", { kind: "all" });
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.cancel();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(controller.isCurrent(second.generation)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // No stream reported a turn id (the mock never answers), so nothing is
    // terminated speculatively.
    expect(calls.some((call) => call.includes("/terminate"))).toBe(false);
  });

  it("does not send a remote termination after an answer has completed", async () => {
    const calls: string[] = [];
    const requester = vi.fn(async (input: string | URL | Request) => {
      calls.push(String(input));
      return streamed({ answer: "Done" });
    });
    const controller = createAgentRequestController(requester);
    await controller.request(SESSION, "Question", { kind: "all" }).promise;
    controller.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([`/api/agent/sessions/${SESSION}/stream`]);
  });
});
