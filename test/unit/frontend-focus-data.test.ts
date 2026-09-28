import { describe, expect, it } from "vitest";
import { loadFocusReceipt, loadFocusTransitionReceipt, loadCurrentFocus, startFocus, transitionFocus } from "../../frontend/lib/focus-data";
const session = {id: "focus-1", taskId: "task-1", clientKey: "key-1", calendarEventId: null, status: "active", startedAt: "2026-09-28T00:00:00.000Z", pausedAt: null, endedAt: null, elapsedMs: 5_000, updatedAt: "2026-09-28T00:00:00.000Z"};
describe("focus timer read contract", () => {
  it.each([{status: ["active"]}, {elapsedMs: -1}, {elapsedMs: 0.5}, {elapsedMs: Infinity}, {elapsedMs: Number.MAX_SAFE_INTEGER + 1}, {startedAt: "yesterday"}, {startedAt: "2026-02-30T00:00:00.000Z"}, {pausedAt: "bad"}, {endedAt: 42}, {id: ""}, {taskId: ""}, {clientKey: ""}])("rejects malformed timing or identity %j", async patch => {
    await expect(loadCurrentFocus(async () => Response.json({session: {...session, ...patch}}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
  it("rejects a transition receipt for another session", async () => {
    await expect(transitionFocus("focus-1", "pause", session.updatedAt, async () => Response.json({...session, id: "foreign", status: "paused"}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
  it("restores a valid accumulated duration and accepts empty current", async () => {
    expect(await loadCurrentFocus(async () => Response.json({session}))).toMatchObject(session);
    expect(await loadCurrentFocus(async () => Response.json({session: null}))).toBeNull();
  });
});

describe("stable focus start receipt", () => {
  const intent = {id: "focus-1", clientKey: "key-1", taskId: "task-1", title: "Work", durationMinutes: 25};
  it.each([{startTitle: "Other", durationMinutes: 25}, {startTitle: "Work", durationMinutes: 30}, {startTitle: null, durationMinutes: null}, {}])("does not acknowledge a conflicting or unproven start payload %j", async payload => {
    const receipt = {...session, ...payload};
    await expect(startFocus(intent, async () => Response.json({session: receipt}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
    await expect(loadFocusReceipt(intent, async () => Response.json(receipt))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
  it("sends the same persisted identity on retries", async () => {
    const bodies: unknown[] = [];
    const requester = async (_: unknown, init?: RequestInit) => {bodies.push(JSON.parse(String(init?.body))); return Response.json({session: {...session, startTitle: intent.title, durationMinutes: intent.durationMinutes}});};
    await startFocus(intent, requester); await startFocus(intent, requester);
    expect(bodies).toEqual([intent, intent]);
  });
  it.each([{id: "other"}, {clientKey: "other"}, {taskId: "other"}])("rejects unrelated start receipts %j", async patch => {
    await expect(startFocus(intent, async () => Response.json({session: {...session, ...patch}}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
});

describe("client-observed focus version", () => {
  it("carries the exact observed version and rejects an unchanged transition receipt", async () => {
    let body: unknown;
    await expect(transitionFocus("focus-1", "pause", session.startedAt, async (_input, init) => {
      body = JSON.parse(String(init?.body)); return Response.json({...session, status: "paused", updatedAt: session.startedAt});
    })).rejects.toThrow("FOCUS_RESPONSE_INVALID");
    expect(body).toEqual({expectedUpdatedAt: session.startedAt});
  });
  it("rejects an advanced receipt that did not perform the requested transition", async () => {
    await expect(transitionFocus("focus-1", "pause", session.updatedAt, async () => Response.json({...session, updatedAt: "2026-09-28T00:00:00.001Z"}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
  it("rejects current state without a canonical revision", async () => {
    await expect(loadCurrentFocus(async () => Response.json({session: {...session, updatedAt: "bad"}}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
});


describe("persisted transition receipt", () => {
  const intent = {id: "focus-1", clientKey: "key-1", taskId: "task-1", action: "complete" as const, expectedUpdatedAt: session.updatedAt};
  it.each([{id: "other"}, {clientKey: "other"}, {taskId: "other"}, {updatedAt: "2026-09-27T00:00:00.000Z"}])("rejects another identity or regressed revision %j", async patch => {
    await expect(loadFocusTransitionReceipt(intent, async () => Response.json({...session, ...patch}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
  it("reads the exact owned target and preserves the observed competing outcome", async () => {
    let requested: unknown;
    const result = await loadFocusTransitionReceipt(intent, async input => {requested = input; return Response.json({...session, status: "abandoned", updatedAt: "2026-09-28T00:00:00.001Z"});});
    expect(requested).toBe("/api/focus/focus-1"); expect(result.status).toBe("abandoned");
  });
});
