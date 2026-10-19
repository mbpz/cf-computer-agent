import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAgentSession, loadAgentSession, saveAgentSession, type AgentSessionRecord } from "../../frontend/lib/agent-session-store";

const SESSION = "abcdefghijklmnopqrstuvwx";

describe("member-scoped agent session storage", () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
  });
  afterEach(() => vi.unstubAllGlobals());

  const record: AgentSessionRecord = { version: 1, memberId: "member-a", sessionId: SESSION, scope: { kind: "space", spaceId: "s-1" } };

  it("round trips only the member's last verified session and scope", () => {
    expect(saveAgentSession(record)).toBe(true);
    expect(loadAgentSession("member-a")).toEqual({ kind: "ready", session: record });
    expect(loadAgentSession("member-b")).toEqual({ kind: "empty" });
    expect(values.size).toBe(1);
    expect(clearAgentSession("member-b")).toBe(true);
    expect(loadAgentSession("member-a").kind).toBe("ready");
    expect(clearAgentSession("member-a", "zyxwvutsrqponmlkjihgfedc")).toBe(false);
    expect(loadAgentSession("member-a").kind).toBe("ready");
    expect(clearAgentSession("member-a", SESSION)).toBe(true);
    expect(loadAgentSession("member-a")).toEqual({ kind: "empty" });
  });

  it("blocks corrupt, cross-member and scope-widening records", () => {
    expect(saveAgentSession(record)).toBe(true);
    const key = [...values.keys()][0]!;
    const corrupt = [
      "not json",
      "null",
      JSON.stringify({ ...record, memberId: "member-b" }),
      JSON.stringify({ ...record, sessionId: "../escape" }),
      JSON.stringify({ ...record, scope: { kind: "all", spaceId: "s-1" } }),
      JSON.stringify({ ...record, scope: { kind: "items", knowledgeItemIds: [] } }),
      JSON.stringify({ ...record, extra: true }),
    ];
    for (const raw of corrupt) {
      values.set(key, raw);
      expect(loadAgentSession("member-a"), raw).toEqual({ kind: "blocked" });
      expect(saveAgentSession(record)).toBe(false);
    }
  });

  it("fails closed on read, write or removal failures", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("denied"); } });
    expect(loadAgentSession("member-a").kind).toBe("blocked");
    expect(saveAgentSession(record)).toBe(false);
    expect(clearAgentSession("member-a")).toBe(false);
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("denied"); } } });
    expect(saveAgentSession(record)).toBe(false);
    expect(clearAgentSession("member-a")).toBe(false);
  });
});
