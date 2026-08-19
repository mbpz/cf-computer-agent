/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

let sessionToken: string;

describe("workspace assets", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind("member-contributor", "github:301", "contributor@example.test", "contributor", "active", "2026-08-14T00:00:00.000Z", "2026-08-14T00:00:00.000Z")
      .run();
    const repository = new MembersRepository(env.DB);
    const member = await repository.findById("member-contributor");
    sessionToken = (await new SessionService(env.DB, repository, { waitUntil: () => undefined }).create(member!)).token;
  });

  it("serves a public unified shell with no browser credential or Access remnants", async () => {
    const page = await SELF.fetch("https://example.test/");
    const html = await page.text();

    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("x-request-id")).toBeTruthy();
    expect(html).toContain('id="app-shell"');
    expect(html).toContain('id="primary-navigation"');
    expect(html).toContain('src="/app.js"');
    expect(html).not.toMatch(/localStorage|APP_TOKEN|AUTOMATION_SECRET|设置令牌|authorization|cdn-cgi\/access\/logout|Cloudflare Access|Access 会话/i);

    const navigation = await SELF.fetch("https://example.test/navigation.js");
    expect(navigation.status).toBe(200);
    await expect(navigation.text()).resolves.toContain("navigationForSession");

    const app = await SELF.fetch("https://example.test/app.js");
    const appSource = await app.text();
    expect(app.status).toBe(200);
    expect(appSource).not.toMatch(/APP_TOKEN|AUTOMATION_SECRET|x-automation-|github[_ -]?token|cdn-cgi\/access\/logout|Cloudflare Access|Access 会话/i);
  });

  it("leaves authorization authoritative on the server for direct admin API access", async () => {
    const response = await SELF.fetch("https://example.test/api/admin/members");

    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it.each(["/submit", "/knowledge", "/admin/members"])("serves the shell for the known deep link %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('id="app-shell"');
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("does not turn an unknown non-API path into a shell route", async () => {
    const response = await SELF.fetch("https://example.test/not-a-workspace-route");

    expect(response.status).toBe(404);
  });

  it("still returns a server-authoritative 403 to an authenticated contributor", async () => {
    const app = createApp();
    const context = createExecutionContext();
    const response = await app.fetch!(new Request("https://example.test/api/admin/members", {
      headers: { cookie: `__Host-memory-session=${sessionToken}` },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
