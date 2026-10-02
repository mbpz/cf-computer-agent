// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createDiscussionRequestController,
  ensureDiscussionThread,
  loadContextDiscussionThread,
  loadDiscussionMessages,
  loadDiscussionThread,
  loadDiscussionThreads,
  sendDiscussionMessage,
} from "../../frontend/lib/discussions-data";

describe("discussion client contract", () => {
  it("parses strict thread and message cursor pages from canonical endpoints", async () => {
    const calls: string[] = [];
    const requester = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input).includes("/messages")) return Response.json({ items: [message()] });
      return Response.json({ items: [thread()], nextCursor: "cursor_2" });
    }) as typeof fetch;

    await expect(loadDiscussionThreads({ limit: 20 }, requester)).resolves.toEqual({
      items: [thread()],
      nextCursor: "cursor_2",
    });
    await expect(loadDiscussionMessages("thread-1", { limit: 50, cursor: "cursor_2" }, requester))
      .resolves.toEqual({ items: [message()] });
    expect(calls).toEqual([
      "/api/discussions?limit=20",
      "/api/discussions/thread-1/messages?limit=50&cursor=cursor_2",
    ]);
  });

  it("fails closed on extra keys, malformed identifiers, dates, and cursor envelopes", async () => {
    await expect(loadDiscussionThreads({ limit: 20 }, jsonRequester({ items: [thread({ extra: true })] })))
      .rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    await expect(loadDiscussionThreads({ limit: 20 }, jsonRequester({ items: [], cursor: "wrong-key" })))
      .rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    await expect(loadDiscussionMessages("thread-1", { limit: 20 }, jsonRequester({ items: [message({ sequence: 0 })] })))
      .rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    await expect(loadDiscussionThread("../unsafe", jsonRequester(thread())))
      .rejects.toThrow("DISCUSSION_ID_INVALID");
    await expect(loadContextDiscussionThread({ kind: "task", id: "bad/id" }, jsonRequester(thread())))
      .rejects.toThrow("DISCUSSION_CONTEXT_INVALID");
  });

  it("gets or creates context threads and sends one canonical idempotent payload", async () => {
    const calls: Array<{ path: string; method?: string; body: string }> = [];
    const requester = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), method: init?.method, body: String(init?.body ?? "") });
      if (String(input) === "/api/discussions/messages") {
        return Response.json({ thread: thread(), message: message({ body: "Reply", replyToMessageId: "message-0" }), created: true }, { status: 201 });
      }
      return init?.method === "POST"
        ? Response.json({ thread: thread(), created: true }, { status: 201 })
        : Response.json(thread());
    }) as typeof fetch;

    await expect(loadContextDiscussionThread({ kind: "task", id: "task-1" }, requester)).resolves.toEqual(thread());
    await expect(ensureDiscussionThread({ kind: "task", id: "task-1" }, requester)).resolves.toEqual({ thread: thread(), created: true });
    await expect(sendDiscussionMessage({
      context: { kind: "task", id: "task-1" },
      body: "Reply",
      clientKey: "stable-client-key",
      replyToMessageId: "message-0",
      mentionMemberIds: ["member-2"],
    }, requester)).resolves.toEqual({ thread: thread(), message: message({ body: "Reply", replyToMessageId: "message-0" }), created: true });
    expect(calls).toEqual([
      { path: "/api/discussions/context?kind=task&id=task-1", method: undefined, body: "" },
      { path: "/api/discussions/context", method: "POST", body: JSON.stringify({ kind: "task", id: "task-1" }) },
      { path: "/api/discussions/messages", method: "POST", body: JSON.stringify({ context: { kind: "task", id: "task-1" }, body: "Reply", clientKey: "stable-client-key", replyToMessageId: "message-0", mentionMemberIds: ["member-2"] }) },
    ]);
  });

  it("rejects valid-shaped threads from another requested id or context", async () => {
    await expect(loadDiscussionThread("thread-2", jsonRequester(thread()))).rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    for (const context of [{ kind: "task" as const, id: "task-2" }, { kind: "knowledge" as const, id: "task-1" }]) {
      await expect(loadContextDiscussionThread(context, jsonRequester(thread()))).rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
      await expect(ensureDiscussionThread(context, jsonRequester({ thread: thread(), created: false }))).rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    }
  });

  it("rejects over-limit, duplicate and non-progressing cursor pages", async () => {
    for (const page of [
      { items: [thread(), thread()] },
      { items: Array.from({ length: 21 }, (_, i) => thread({ id: `thread-${i}` })) },
      { items: [], nextCursor: "cursor_2" },
      { items: [thread()], nextCursor: "cursor_2" },
    ]) {
      await expect(loadDiscussionThreads({ limit: 20, cursor: "cursor_2" }, jsonRequester(page))).rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    }
    for (const items of [
      [message({ threadId: "thread-2" })],
      [message(), message()],
      [message(), message({ id: "message-2", sequence: 2 })],
      [message(), message({ id: "message-2" })],
      Array.from({ length: 21 }, (_, i) => message({ id: `message-${i}`, sequence: 21 - i })),
    ]) {
      await expect(loadDiscussionMessages("thread-1", { limit: 20 }, jsonRequester({ items }))).rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    }
    await expect(loadDiscussionMessages("thread-1", { limit: 20 }, jsonRequester({ items: [message({ id: "message-2", sequence: 2 }), message()], nextCursor: "older" })))
      .resolves.toMatchObject({ items: [{ sequence: 2 }, { sequence: 1 }], nextCursor: "older" });
  });

  it("binds send receipts to the context and normalized client key without mistaking a replay for a new write", async () => {
    const input = { context: { kind: "task" as const, id: "task-1" }, body: " New message ", clientKey: " stable-client-key ", mentionMemberIds: ["member-1", "member-2"] };
    const valid = { thread: thread(), message: message({ body: "New message" }), created: true };
    await expect(sendDiscussionMessage(input, jsonRequester(valid))).resolves.toEqual(valid);
    for (const receipt of [
      { ...valid, thread: thread({ contextId: "task-2" }) },
      { ...valid, thread: thread({ contextKind: "knowledge" }) },
      { ...valid, message: message({ clientKey: "another-key" }) },
      { ...valid, message: message({ body: "Other body" }) },
      { ...valid, message: message({ body: "New message", replyToMessageId: "message-0" }) },
      { ...valid, message: message({ body: "New message", mentionMemberIds: [] }) },
      { ...valid, thread: thread({ lastSequence: 0 }) },
    ]) for (const created of [true, false]) await expect(sendDiscussionMessage(input, jsonRequester({ ...receipt, created }))).rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    // A first-write-wins replay is not confirmation of a different frozen intent.
    await expect(sendDiscussionMessage(input, jsonRequester({ ...valid, message: message(), created: false })))
      .rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
    await expect(sendDiscussionMessage(input, jsonRequester({ ...valid, created: false })))
      .resolves.toEqual({ ...valid, created: false });
    await expect(sendDiscussionMessage(input, jsonRequester({ ...valid, message: message({ clientKey: "another-key" }), created: false })))
      .rejects.toThrow("DISCUSSION_RESPONSE_INVALID");
  });

  it("aborts the superseded generation and never treats it as current", async () => {
    const signals: AbortSignal[] = [];
    const controller = createDiscussionRequestController(async (_input: { page: number }, signal) => {
      signals.push(signal);
      return { page: 1 };
    });
    const first = controller.request({ page: 1 });
    const second = controller.request({ page: 2 });
    expect(signals[0]?.aborted).toBe(true);
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    controller.dispose();
    expect(signals[1]?.aborted).toBe(true);
  });
});

function thread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    contextKind: "task",
    contextId: "task-1",
    creatorMemberId: "member-1",
    lastSequence: 1,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:01:00.000Z",
    ...overrides,
  };
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "message-1",
    threadId: "thread-1",
    sequence: 1,
    authorMemberId: "member-1",
    body: "Hello @member-2",
    replyToMessageId: null,
    mentionMemberIds: ["member-2"],
    clientKey: "stable-client-key",
    createdAt: "2026-08-30T00:01:00.000Z",
    ...overrides,
  };
}

function jsonRequester(payload: unknown): typeof fetch {
  return (async () => Response.json(payload)) as typeof fetch;
}
