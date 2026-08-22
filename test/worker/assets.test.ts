/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";
import { SHIPPED_PUBLIC_ASSETS } from "../fixtures/public-assets";

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
    expect(html).toContain('<html lang="en">');
    expect(html).not.toMatch(/localStorage|APP_TOKEN|AUTOMATION_SECRET|设置令牌|authorization|cdn-cgi\/access\/logout|Cloudflare Access|Access 会话/i);

  });

  it.each(SHIPPED_PUBLIC_ASSETS)("serves and scans every shipped public asset: %s", async (assetPath) => {
    const response = await SELF.fetch(`https://example.test/${assetPath}`);
    const source = new TextDecoder().decode(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(source).not.toMatch(
      /APP_TOKEN|AUTOMATION_SECRET|GITHUB_OAUTH_CLIENT_SECRET|CF_ACCESS_CLIENT|ACCESS_TEAM_DOMAIN|ACCESS_AUD|x-automation-|github[_ -]?(?:access[_ -]?)?token|cdn-cgi\/access|Cf-Access-Jwt-Assertion|Cloudflare Access|Access 会话/iu,
    );
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

  it.each([
    "/knowledge/knowledge-1",
    "/knowledge/knowledge-1?revision=revision-1&chunk=chunk-1",
    "/admin/submissions/submission-1",
  ])("serves the shell with security headers for the M1 deep link %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('id="app-shell"');
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it.each([
    "/knowledge/knowledge-1/revisions/revision-1",
    "/admin/submissions/submission-1/publish",
    "/admin/publications/recover",
  ])("does not broaden the SPA allowlist to the non-UI path %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);

    expect(response.status).toBe(404);
  });

  it("ships the M1 browser contract without executable data sinks or internal request fields", async () => {
    const [response, uiResponse] = await Promise.all([
      SELF.fetch("https://example.test/app.js"),
      SELF.fetch("https://example.test/workspace-ui.js"),
    ]);
    const source = `${await response.text()}\n${await uiResponse.text()}`;

    expect(response.status).toBe(200);
    expect(uiResponse.status).toBe(200);
    expect(source).toContain("/api/knowledge");
    expect(source).toContain("/api/knowledge/search");
    expect(source).toContain("/api/knowledge/chat");
    expect(source).toContain("/api/admin/publications/recover");
    expect(source).toContain("Idempotency-Key");
    expect(source).not.toMatch(/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(/u);
    expect(source).not.toMatch(/normalizedPath|contentSha256|sourceVersionId/u);
    expect(source).not.toMatch(/function markdownLocations|^\s*const locations = markdownLocations/mu);
    expect(source).toContain("closeOpenDialogs");
    expect(source.match(/closeOpenDialogs\(\)/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("createMutationController");
    expect(source).toContain("createOptionPageController");
    expect(source).toContain("createPagedOptionControl");
    expect(source).toContain("Load more ${safeLabel} options");
  });

  it("ships responsive reader, review-dialog, focus, and reduced-motion styles", async () => {
    const response = await SELF.fetch("https://example.test/styles.css");
    const source = await response.text();

    expect(response.status).toBe(200);
    expect(source).toContain(".reader-grid");
    expect(source).toContain(".review-dialog");
    expect(source).toContain(".validation-summary");
    expect(source).toContain("button.danger");
    expect(source).toContain("@media (max-width: 760px)");
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
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
