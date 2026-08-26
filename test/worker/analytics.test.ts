/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

describe("site analytics", () => {
  let contributor = "";
  let admin = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('analytics-contributor', 'subject-analytics-contributor', 'analytics-contributor@example.test', 'contributor', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
       ('analytics-admin', 'subject-analytics-admin', 'analytics-admin@example.test', 'admin', 'active', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
    ).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date("2026-08-26T00:00:00.000Z") });
    contributor = (await sessions.create((await members.findById("analytics-contributor"))!)).token;
    admin = (await sessions.create((await members.findById("analytics-admin"))!)).token;
  });

  it("records anonymous and signed-in visits without returning visitor identifiers", async () => {
    expect((await api("/api/telemetry/pageview", undefined, { method: "POST", body: JSON.stringify({ path: "/" }), headers: { "user-agent": "test-browser", "cf-connecting-ip": "203.0.113.10" } })).status).toBe(202);
    expect((await api("/api/telemetry/pageview", contributor, { method: "POST", body: JSON.stringify({ path: "/knowledge" }), headers: { "user-agent": "test-browser", "cf-connecting-ip": "203.0.113.10" } })).status).toBe(202);
    const response = await api("/api/admin/analytics/overview?days=7", admin);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ totals: { pageViews: 2, uniqueVisitors: 1, loginUsers: 1 } });
    expect(JSON.stringify(body)).not.toContain("203.0.113.10");
    expect(JSON.stringify(body)).not.toContain("visitorHash");
  });

  it("keeps the overview admin-only and validates the public collector", async () => {
    const forbidden = await api("/api/admin/analytics/overview", contributor);
    expect(forbidden.status).toBe(403);
    const invalid = await api("/api/telemetry/pageview", undefined, { method: "POST", body: JSON.stringify({ path: "https://evil.example" }) });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "TELEMETRY_INVALID" } });
    const crossOrigin = await api("/api/telemetry/pageview", undefined, { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ path: "/" }) });
    expect(crossOrigin.status).toBe(403);
  });
});

async function api(path: string, token: string | undefined, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  if (!headers.has("origin")) headers.set("origin", "https://memory.crgmhrc.asia");
  const request = new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
