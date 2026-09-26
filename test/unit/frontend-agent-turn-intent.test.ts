import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAgentIntent, createAgentIntent, loadAgentIntent, saveAgentIntent } from "../../frontend/lib/agent-turn-intent";

describe("member-scoped agent intent storage", () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("round trips only the member's original question, scope, conversation and key", () => {
    const intent = createAgentIntent("member-a", " Original ", { kind: "items", knowledgeItemIds: ["k-1"] }, "conv-1");
    expect(saveAgentIntent(intent)).toBe(true);
    expect(loadAgentIntent("member-a")).toEqual({ kind: "ready", intent });
    expect(loadAgentIntent("member-b")).toEqual({ kind: "empty" });
    expect(intent.question).toBe("Original");
    expect(intent).not.toHaveProperty("answer");
    expect(clearAgentIntent("member-b")).toBe(true);
    expect(loadAgentIntent("member-a").kind).toBe("ready");
  });

  it("cannot overwrite another pending intent or clear it with another key", () => {
    const first = createAgentIntent("member-a", "First", { kind: "all" });
    const second = createAgentIntent("member-a", "Second", { kind: "all" });
    expect(saveAgentIntent(first)).toBe(true);
    expect(saveAgentIntent(second)).toBe(false);
    expect(clearAgentIntent("member-a", second.key)).toBe(false);
    expect(loadAgentIntent("member-a")).toEqual({ kind: "ready", intent: first });
    expect(clearAgentIntent("member-a", first.key)).toBe(true);
  });

  it("blocks corrupt, wrong-member and source-broadening stored payloads", () => {
    const intent = createAgentIntent("member-a", "First", { kind: "all" });
    expect(saveAgentIntent(intent)).toBe(true);
    const key = [...values.keys()][0]!;
    for (const raw of ["not json", "null", JSON.stringify({ ...intent, memberId: "member-b" }), JSON.stringify({ ...intent, scope: { kind: "all", spaceId: "secret" } }), JSON.stringify({ ...intent, scope: { kind: "items", knowledgeItemIds: [] } }), JSON.stringify({ ...intent, answer: "cached prose" })]) {
      values.set(key, raw);
      expect(loadAgentIntent("member-a")).toEqual({ kind: "blocked" });
      expect(saveAgentIntent(intent)).toBe(false);
      expect(clearAgentIntent("member-a", intent.key)).toBe(false);
    }
    expect(clearAgentIntent("member-a")).toBe(true);
  });

  it("fails closed on read, write or removal failures", () => {
    const intent = createAgentIntent("member-a", "First", { kind: "all" });
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("denied"); } });
    expect(loadAgentIntent("member-a").kind).toBe("blocked");
    expect(saveAgentIntent(intent)).toBe(false);
    expect(clearAgentIntent("member-a")).toBe(false);
    vi.stubGlobal("window", { sessionStorage: { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("denied"); } } });
    expect(saveAgentIntent(intent)).toBe(false);
    expect(clearAgentIntent("member-a")).toBe(false);
  });
});
