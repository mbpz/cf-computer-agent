/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { CalendarRepository } from "../../src/calendar/repository";
import { CalendarService } from "../../src/calendar/service";
const tokens: Record<string, string> = {};
async function http(path = "/api/calendar/events?page=1&pageSize=20", method = "GET", body?: unknown, owner = "a") {
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { method, headers: { cookie: `__Host-memory-session=${tokens[owner] ?? ""}`, origin: "https://memory.crgmhrc.asia", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context); return response;
}
const from = "2026-09-28T00:00:00.000Z", to = "2026-09-29T00:00:00.000Z";
const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
describe("calendar numbered authenticated pages", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      const members = new MembersRepository(env.DB); tokens[owner] = (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findByIdentitySubject(owner))!)).token;
    }
    await env.DB.batch(Array.from({ length: 47 }, (_, i) => env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, all_day, status, created_at, updated_at) VALUES (?, ?, ?, 'event', ?, ?, ?, 'UTC', 0, ?, 1, 1)").bind(`e-${String(i).padStart(3, "0")}`, i < 43 ? "a" : "b", `key-${i}`, `Private ${i}`, Date.parse(from), Date.parse(to), i === 42 ? "canceled" : "scheduled")));
  });
  async function read(query: string, owner = "a") { const response = await http(`/api/calendar/events?${range}&${query}`, "GET", undefined, owner); expect(response.status).toBe(200); return response.json<any>(); }
  it("counts only owned overlapping filtered events and orders ties consistently", async () => {
    const pages = await Promise.all([1, 2, 3].map(page => read(`page=${page}&pageSize=20&status=scheduled`)));
    expect(pages[1].pagination).toEqual({ page: 2, pageSize: 20, total: 42, totalPages: 3 });
    expect(pages[0].items[0].id).toBe("e-000"); expect(pages[1].items[0].id).toBe("e-020"); expect(pages[2].items.map((x: any) => x.id)).toEqual(["e-040", "e-041"]);
    expect(new Set(pages.flatMap(p => p.items.map((x: any) => x.id))).size).toBe(42);
    expect((await read("page=1&pageSize=100", "b")).pagination.total).toBe(4);
  });
  it.each([20, 50, 100])("accepts size %i and preserves beyond-last requested page", async size => {
    expect(await read(`page=2&pageSize=${size}&status=canceled`, "b")).toEqual({ items: [], pagination: { page: 2, pageSize: size, total: 0, totalPages: 0 } });
  });
  it.each(["page=0", "page=1.2", "page=-1", "page=501&pageSize=20", "page=1&pageSize=21", "page=1&page=2", "page=1&cursor=abc", "page=1&limit=20", "page=1&status=invalid", "page=1&status=scheduled&status=canceled", "page=1&memberId=b"])("rejects malformed or mixed query %s", async query => { expect((await http(`/api/calendar/events?${range}&${query}`)).status).toBe(400); });
  it("preserves cursor API and defaults numbered size", async () => {
    const first = await read("limit=20"), second = await read(`limit=20&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(first.pagination).toBeUndefined(); expect(second.items).toHaveLength(20); expect(second.items[0].id).not.toBe(first.items[0].id);
    expect((await read("page=1")).pagination).toEqual({ page: 1, pageSize: 20, total: 43, totalPages: 3 });
  });
  it("uses half-open overlap including cross-midnight events and offset-equivalent instants", async () => {
    await env.DB.prepare("UPDATE calendar_events SET starts_at = ?, ends_at = ? WHERE member_id = 'a'").bind(Date.parse(from)-3600000, Date.parse(from)).run();
    expect((await read("page=1")).pagination.total).toBe(0);
    await env.DB.prepare("UPDATE calendar_events SET ends_at = ? WHERE id = 'e-000'").bind(Date.parse(from)+1).run();
    expect((await read("page=1")).items.map((x: any) => x.id)).toEqual(["e-000"]);
    const url = new URL("https://app.test/api/calendar/events"); url.search = new URLSearchParams({ from: "2026-09-28T08:00:00+08:00", to, page: "1" }).toString();
    expect((await (await http(url.pathname+url.search)).json<any>()).pagination.total).toBe(1);
    await env.DB.prepare("UPDATE calendar_events SET starts_at = ?, ends_at = ? WHERE id = 'e-000'").bind(Date.parse(to), Date.parse(to)+1).run();
    expect((await read("page=1")).pagination.total).toBe(0);
  });
  it.each(["from=bad&to=bad", `from=${from}&to=${from}`, `from=${from}&to=2026-11-01T00:00:00Z`, `from=${from}&from=${from}&to=${to}`, ""])("rejects invalid range %s", async query => { expect((await http(`/api/calendar/events?page=1&${query}`)).status).toBe(400); });
  it("requires authentication and validates direct service status and pagination", async () => {
    expect((await http(`/api/calendar/events?${range}&page=1`, "GET", undefined, "missing")).status).toBe(401);
    const service = new CalendarService(new CalendarRepository(env.DB));
    await expect(service.listNumbered("a", Date.parse(from), Date.parse(to), { page: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(service.listNumbered("a", Date.parse(from), Date.parse(to), {}, "invalid" as never)).rejects.toMatchObject({ status: 400 });
  });
});
