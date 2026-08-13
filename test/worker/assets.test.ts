/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MIGRATIONS } from "../fixtures/d1";

describe("workspace assets", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind("member-contributor", "asset-contributor", "contributor@example.test", "contributor", "active", "2026-08-14T00:00:00.000Z", "2026-08-14T00:00:00.000Z")
      .run();
  });

  it("serves the protected unified shell and its explicit navigation module", async () => {
    const page = await SELF.fetch("https://example.test/");
    const html = await page.text();

    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("x-request-id")).toBeTruthy();
    expect(html).toContain('id="app-shell"');
    expect(html).toContain('id="primary-navigation"');
    expect(html).toContain('src="/app.js"');
    expect(html).not.toMatch(/localStorage|APP_TOKEN|设置令牌|authorization/i);

    const navigation = await SELF.fetch("https://example.test/navigation.js");
    expect(navigation.status).toBe(200);
    await expect(navigation.text()).resolves.toContain("navigationForSession");
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
    const app = createApp({
      verifyAccessJwt: async () => ({ kind: "member", sub: "asset-contributor", email: "contributor@example.test" }),
    });
    const context = createExecutionContext();
    const response = await app.fetch!(new Request("https://example.test/api/admin/members", {
      headers: { "cf-access-jwt-assertion": "fixture" },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
