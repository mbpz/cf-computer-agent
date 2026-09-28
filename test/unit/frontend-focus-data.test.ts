import { describe, expect, it } from "vitest";
import { loadCurrentFocus, transitionFocus } from "../../frontend/lib/focus-data";
const session = {id: "focus-1", taskId: "task-1", clientKey: "key-1", calendarEventId: null, status: "active", startedAt: "2026-09-28T00:00:00.000Z", pausedAt: null, endedAt: null, elapsedMs: 5_000};
describe("focus timer read contract", () => {
  it.each([{status: ["active"]}, {elapsedMs: -1}, {elapsedMs: 0.5}, {elapsedMs: Infinity}, {elapsedMs: Number.MAX_SAFE_INTEGER + 1}, {startedAt: "yesterday"}, {startedAt: "2026-02-30T00:00:00.000Z"}, {pausedAt: "bad"}, {endedAt: 42}, {id: ""}, {taskId: ""}, {clientKey: ""}])("rejects malformed timing or identity %j", async patch => {
    await expect(loadCurrentFocus(async () => Response.json({session: {...session, ...patch}}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
  it("rejects a transition receipt for another session", async () => {
    await expect(transitionFocus("focus-1", "pause", async () => Response.json({...session, id: "foreign", status: "paused"}))).rejects.toThrow("FOCUS_RESPONSE_INVALID");
  });
  it("restores a valid accumulated duration and accepts empty current", async () => {
    expect(await loadCurrentFocus(async () => Response.json({session}))).toEqual(session);
    expect(await loadCurrentFocus(async () => Response.json({session: null}))).toBeNull();
  });
});
