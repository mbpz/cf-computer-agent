import { describe, expect, it, vi } from "vitest";
import { createInbox, readCreatedInbox } from "../../frontend/lib/inbox-data";
import type { InboxCreateIntent } from "../../frontend/lib/inbox-create-intent";
const intent: InboxCreateIntent = { id: "one", clientKey: "key", kind: "link", content: "Private note", sourceUrl: "https://example.com/" };
const row = { ...intent, status: "inbox", promotedTaskId: null, promotedSubmissionId: null, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" };
describe("inbox exact creation receipt contract", () => {
  it("sends the immutable request verbatim and accepts strict create/replay receipts", async () => {
    for (const created of [true, false]) {
      const result = await createInbox(intent, async (input, init) => {
        expect(input).toBe("/api/inbox"); expect(init?.method).toBe("POST"); expect(init?.credentials).toBe("same-origin");
        expect(JSON.parse(String(init?.body))).toEqual(intent); return Response.json({ item: row, created });
      }); expect(result).toEqual({ item: row, created });
    }
  });
  it("reads back the owned identity with abort signal", async () => {
    const signal = new AbortController().signal;
    await expect(readCreatedInbox(intent, async (input, init) => {
      expect(input).toBe("/api/inbox/one"); expect(init?.method ?? "GET").toBe("GET"); expect(init?.signal).toBe(signal);
      return Response.json(row);
    }, signal)).resolves.toEqual(row);
  });
  it.each([{ id: "other" }, { clientKey: "other" }, { content: "other" }, { kind: "text" }, { sourceUrl: "https://other.test" }, { updatedAt: "bad" }, { promotedTaskId: 123 }, { status: "invalid" }])("rejects mismatching or malformed identity %# for both POST and GET", async patch => {
    await expect(createInbox(intent, async () => Response.json({ item: { ...row, ...patch }, created: true }))).rejects.toThrow();
    await expect(readCreatedInbox(intent, async () => Response.json({ ...row, ...patch }))).rejects.toThrow();
  });
  it.each([null, {}, { item: row }, { item: row, created: 1 }, { item: { ...row, status: "archived" }, created: true }])("rejects invalid envelopes %#", async value => {
    await expect(createInbox(intent, async () => Response.json(value))).rejects.toThrow();
  });
  it("rejects invalid outgoing data before any network request", async () => {
    const fetcher = vi.fn();
    await expect(createInbox({ ...intent, content: " " }, fetcher)).rejects.toThrow();
    await expect(readCreatedInbox({ ...intent, id: "../bad" }, fetcher)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
});
