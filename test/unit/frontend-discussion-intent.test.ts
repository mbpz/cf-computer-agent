import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDiscussionOperationJournal } from "../../frontend/lib/discussion-intent";
import { createDiscussionSubmitController } from "../../frontend/pages/messages/discussion-model";
const input = { context: { kind: "task" as const, id: "task-1" }, body: "Frozen @bob", replyToMessageId: "message-1", mentionMemberIds: ["bob"], clientKey: "operation-1" };
const key = "memory-garden:discussion-operation:v1:alice:thread-1";
describe("discussion operation refresh journal", () => {
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    values = new Map();
    storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) };
    vi.stubGlobal("window", { sessionStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());
  const journal = () => createDiscussionOperationJournal("alice", "thread-1");
  it("restores an exact frozen operation and isolates members and threads", () => {
    expect(journal().save(input)).toBe(true);
    const restored = journal().load();
    expect(restored).toEqual({ kind: "ready", input });
    if (restored.kind === "ready") {
      expect(Object.isFrozen(restored.input)).toBe(true);
      expect(Object.isFrozen(restored.input.context)).toBe(true);
      expect(Object.isFrozen(restored.input.mentionMemberIds)).toBe(true);
    }
    expect(createDiscussionOperationJournal("bob", "thread-1").load()).toEqual({ kind: "empty" });
    expect(createDiscussionOperationJournal("alice", "thread-2").load()).toEqual({ kind: "empty" });
    expect(journal().save({ ...input, body: "different" })).toBe(false);
    expect(journal().clear({ ...input, clientKey: "different" })).toBe(false);
    expect(journal().clear(input)).toBe(true);
    expect(journal().load()).toEqual({ kind: "empty" });
  });
  it.each(["broken", "null", JSON.stringify({ version: 2, memberId: "alice", threadId: "thread-1", input }), JSON.stringify({ version: 1, memberId: "bob", threadId: "thread-1", input }), JSON.stringify({ version: 1, memberId: "alice", threadId: "thread-2", input }), JSON.stringify({ version: 1, memberId: "alice", threadId: "thread-1", input: { ...input, body: " " } })])("preserves corrupt or wrong-owner data without writes: %s", raw => {
    values.set(key, raw);
    expect(journal().load()).toEqual({ kind: "blocked" });
    expect(journal().save(input)).toBe(false); expect(journal().clear(input)).toBe(false);
    expect(values.get(key)).toBe(raw);
  });
  it("fails closed for quota, silent loss, failed clear, missing identity and unavailable storage", () => {
    storage.setItem.mockImplementationOnce(() => { throw Error("quota"); });
    expect(journal().save(input)).toBe(false);
    storage.setItem.mockImplementationOnce(() => undefined); expect(journal().save(input)).toBe(false);
    expect(journal().save(input)).toBe(true);
    storage.removeItem.mockImplementationOnce(() => undefined); expect(journal().clear(input)).toBe(false);
    expect(createDiscussionOperationJournal("", "thread-1").load()).toEqual({ kind: "blocked" });
    vi.stubGlobal("window", undefined); expect(journal().load()).toEqual({ kind: "blocked" });
  });
  it("saves before dispatch and restores the same number without automatic dispatch", async () => {
    const factory = vi.fn(() => input.clientKey);
    const first = createDiscussionSubmitController(factory, journal());
    await expect(first.submit(input, async sent => {
      expect(journal().load()).toEqual({ kind: "ready", input: sent });
      throw Error("unknown");
    })).rejects.toThrow("unknown");
    const restoredFactory = vi.fn(() => "new-key");
    const restored = createDiscussionSubmitController(restoredFactory, journal());
    expect(restored.snapshot()).toEqual(input); expect(restored.operationKey()).toBe(input.clientKey);
    expect(restoredFactory).not.toHaveBeenCalled();
    await expect(restored.reconcile(async () => false)).resolves.toBe(false);
    expect(journal().load().kind).toBe("ready");
    await restored.submit(input, async sent => { expect(sent).toEqual(input); });
    expect(journal().load()).toEqual({ kind: "empty" });
    expect(factory).toHaveBeenCalledTimes(1); expect(restoredFactory).not.toHaveBeenCalled();
  });
  it("does not send before verified storage and retains a receipt until cleanup succeeds", async () => {
    const controller = createDiscussionSubmitController(() => input.clientKey, journal());
    const send = vi.fn(async () => {});
    storage.setItem.mockImplementationOnce(() => undefined);
    await expect(controller.submit(input, send)).rejects.toThrow(); expect(send).not.toHaveBeenCalled();
    storage.removeItem.mockImplementationOnce(() => undefined);
    await expect(controller.submit(input, send)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1); expect(controller.operationKey()).toBe(input.clientKey);
    await expect(controller.reconcile(async () => true)).resolves.toBe(true);
    expect(journal().load()).toEqual({ kind: "empty" });
  });
  it("does not erase a newer conflicting record when a prior receipt arrives", async () => {
    const controller = createDiscussionSubmitController(() => input.clientKey, journal());
    let finish!: () => void;
    const promise = controller.submit(input, () => new Promise<void>(resolve => { finish = resolve; }));
    const newer = { ...input, clientKey: "other-operation", body: "Other original" };
    values.set(key, JSON.stringify({ version: 1, memberId: "alice", threadId: "thread-1", input: newer }));
    finish(); await expect(promise).rejects.toThrow();
    expect(controller.operationKey()).toBe(input.clientKey); expect(journal().load()).toEqual({ kind: "ready", input: newer });
  });
  it("rejects malformed intent fields and preserves raw recovery evidence", () => {
    for (const value of [{ ...input, extra: true }, { ...input, context: { ...input.context, extra: true } },
      { ...input, context: { kind: ["task"], id: "task-1" } }, { ...input, body: " spaced " }, { ...input, body: "a".repeat(5001) }, { ...input, body: "\u0000" },
      { ...input, clientKey: " " }, { ...input, replyToMessageId: "../bad" }, { ...input, mentionMemberIds: ["bob", "bob"] },
      { ...input, mentionMemberIds: undefined }, { ...input, mentionMemberIds: Array.from({ length: 21 }, (_, i) => `m-${i}`) }]) {
      const raw = JSON.stringify({ version: 1, memberId: "alice", threadId: "thread-1", input: value });
      values.set(key, raw); expect(journal().load()).toEqual({ kind: "blocked" });
      expect(journal().save(input)).toBe(false); expect(values.get(key)).toBe(raw);
    }
  });
  it("gives callers an isolated snapshot without allowing mutation of a restored retry", async () => {
    journal().save(input);
    const controller = createDiscussionSubmitController(() => "unused", journal());
    const snapshot = controller.snapshot()!;
    snapshot.body = "Changed"; snapshot.context.id = "other"; (snapshot.mentionMemberIds as string[]).push("other");
    expect(controller.snapshot()).toEqual(input);
    await controller.reconcile(async frozen => { expect(frozen).toEqual(input); return true; });
    expect(journal().load()).toEqual({ kind: "empty" });
  });
  it("blocks malformed recovery rather than silently starting a new operation", async () => {
    values.set(key, "broken");
    const controller = createDiscussionSubmitController(() => "new", journal());
    expect(controller.recoveryBlocked()).toBe(true); expect(controller.hasUnresolved()).toBe(true);
    const send = vi.fn(); await expect(controller.submit(input, send)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled(); expect(values.get(key)).toBe("broken");
  });
});
