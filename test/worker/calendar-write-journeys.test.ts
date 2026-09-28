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
describe("calendar write journeys", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      const members = new MembersRepository(env.DB); tokens[owner] = (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findByIdentitySubject(owner))!)).token;
    }
  });

  const input = { id: "new-a", clientKey: "intent-a", title: "Create once", startsAt: "2026-09-28T01:00:00.000Z", endsAt: "2026-09-28T02:00:00.000Z", timezone: "UTC" };
  const create = (body = input, owner = "a") => http("/api/calendar/events", "POST", body, owner);
  it("converges simultaneous same-key creates onto one receipt", async () => {
    const service = new CalendarService(new CalendarRepository(env.DB));
    const receipts = await Promise.all([service.create("a", input), service.create("a", { ...input, id: "new-b" })]);
    expect(receipts.map(r => r.event.id)).toEqual([receipts[0].event.id, receipts[0].event.id]);
    expect(receipts.filter(r => r.created)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT id FROM calendar_events").all()).results).toHaveLength(1);
  });
  it("rejects an occupied id instead of returning an unrelated receipt", async () => {
    expect((await create()).status).toBe(201);
    expect((await create({ ...input, clientKey: "different-intent" })).status).toBe(409);
    expect((await create({ ...input, clientKey: "different-intent" }, "b")).status).toBe(409);
  });
  it.each([{ endsAt: input.startsAt }, { timezone: "Not/AZone" }, { startsAt: 9e15, endsAt: 9e15+1 }])("rejects invalid time input %j", async extra => {
    expect((await create({ ...input, ...extra } as any)).status).toBe(400);
  });
  it("requires canonical versions and keeps foreign mutations 404", async () => {
    const { event } = await (await create()).json<any>();
    for (const method of ["DELETE", "PATCH"]) {
      expect((await http(`/api/calendar/events/${event.id}`, method, {})).status).toBe(400);
      expect((await http(`/api/calendar/events/${event.id}`, method, { expectedUpdatedAt: event.updatedAt }, "b")).status).toBe(404);
      expect((await http(`/api/calendar/events/${event.id}`, method, { expectedUpdatedAt: "2026-01-01" })).status).toBe(400);
    }
  });
  it("allows only one concurrent edit/cancel and rejects replay of the stale version", async () => {
    const { event } = await (await create()).json<any>();
    const path = `/api/calendar/events/${event.id}`;
    const results = await Promise.all([http(path, "PATCH", { title: "Edited", expectedUpdatedAt: event.updatedAt }), http(path, "DELETE", { expectedUpdatedAt: event.updatedAt })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const latest = await (await http(path)).json<any>();
    expect(Date.parse(latest.updatedAt)).toBeGreaterThan(Date.parse(event.updatedAt));
    expect((await http(path, "DELETE", { expectedUpdatedAt: event.updatedAt })).status).toBe(409);
    const canceled = await (await http(path, "DELETE", { expectedUpdatedAt: latest.updatedAt })).json<any>();
    expect(canceled.status).toBe("canceled");
  });
  it("advances internal focus status versions even if the clock goes backward", async () => {
    const { event } = await (await create()).json<any>();
    const service = new CalendarService(new CalendarRepository(env.DB), { now: () => new Date(1) });
    const next = await service.setStatus("a", event.id, "completed");
    expect(Date.parse(next.updatedAt)).toBe(Date.parse(event.updatedAt) + 1);
  });
});
