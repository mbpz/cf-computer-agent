// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadCalendarNumbered } from "../../frontend/lib/calendar-data";
import { parseCalendarSearch, writeCalendarSearch } from "../../frontend/lib/calendar-query";
const from = "2026-09-28T00:00:00.000Z", to = "2026-09-29T00:00:00.000Z";
const event = { id: "one", updatedAt: "2026-09-28T00:00:00.000Z", clientKey: "key", kind: "event", title: "Private", description: "", startsAt: from, endsAt: to, timezone: "UTC", allDay: false, status: "scheduled", taskId: null, projectId: null };
const query = { page: 1, pageSize: 20 as const, from, to };
const payload = () => ({ items: [event], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
describe("calendar numbered data contract", () => {
  it("sends exact range, numbered filters and abort signal", async () => {
    const signal = new AbortController().signal;
    const result = await loadCalendarNumbered({ ...query, status: "scheduled" }, async (input, init) => {
      expect(Object.fromEntries(new URL(String(input), "https://app.test").searchParams)).toEqual({ from, to, page: "1", pageSize: "20", status: "scheduled" });
      expect(init?.signal).toBe(signal); expect(init?.credentials).toBe("same-origin"); return Response.json(payload());
    }, signal);
    expect(result).toEqual(payload());
  });
  it.each([
    ["missing pagination", { items: [event] }],
    ["wrong page", { ...payload(), pagination: { ...payload().pagination, page: 2 } }],
    ["wrong size", { ...payload(), pagination: { ...payload().pagination, pageSize: 50 } }],
    ["wrong total", { ...payload(), pagination: { ...payload().pagination, total: 2 } }],
    ["duplicate", { items: [event,event], pagination: { ...payload().pagination, total: 2 } }],
    ["invalid date", { ...payload(), items: [{ ...event, startsAt: "yesterday" }] }],
    ["reversed", { ...payload(), items: [{ ...event, startsAt: to, endsAt: from }] }],
    ["outside range", { ...payload(), items: [{ ...event, startsAt: "2026-09-29T00:00:00.000Z", endsAt: "2026-09-30T00:00:00.000Z" }] }],
    ["bad timezone", { ...payload(), items: [{ ...event, timezone: "Unknown/Place" }] }],
    ["bad boolean", { ...payload(), items: [{ ...event, allDay: "false" }] }],
    ["bad relation", { ...payload(), items: [{ ...event, taskId: 42 }] }],
    ["filter mismatch", { ...payload(), items: [{ ...event, status: "canceled" }] }],
  ])("rejects %s", async (_, body) => { await expect(loadCalendarNumbered({ ...query, status: "scheduled" }, async () => Response.json(body))).rejects.toThrow(); });
  it("allows empty beyond-last page with true total", async () => {
    const body = { items: [], pagination: { page: 3, pageSize: 20, total: 1, totalPages: 1 } };
    await expect(loadCalendarNumbered({ ...query, page: 3 }, async () => Response.json(body))).resolves.toEqual(body);
  });
  it.each([{ ...query, page: 501 }, { ...query, to: from }, { ...query, from: "bad" }, { ...query, to: "2026-11-01T00:00:00.000Z" }])("rejects bad query before network %j", async input => {
    let calls = 0; await expect(loadCalendarNumbered(input, async () => { calls++; return Response.json(payload()); })).rejects.toThrow(); expect(calls).toBe(0);
  });
});
describe("calendar URL and local-time range", () => {
  it("restores absolute instants and preserves unrelated query params", () => {
    const parsed = parseCalendarSearch(`?page=2&pageSize=50&from=${from}&to=${to}&status=canceled`, { from, to });
    expect(parsed).toEqual({ page: 2, pageSize: 50, from, to, status: "canceled" });
    const params = new URLSearchParams(writeCalendarSearch("?view=agenda&cursor=old&limit=50", parsed));
    expect(params.get("view")).toBe("agenda"); expect(params.has("cursor")).toBe(false); expect(params.has("limit")).toBe(false); expect(params.get("from")).toBe(from);
  });
  it.each(["?from=bad&to=bad&page=0", `?from=${from}`, `?from=${from}&to=${from}`, `?from=${from}&from=${from}&to=${to}`, `?from=${from}&to=2026-11-01T00:00:00.000Z`])("normalizes invalid range as a whole: %s", search => {
    expect(parseCalendarSearch(search, { from, to })).toEqual(query);
  });

});
