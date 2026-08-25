/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

let sessionToken: string;

describe("React workspace assets", () => {
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

  it("serves the React entry with security headers and no credentials", async () => {
    const page = await SELF.fetch("https://example.test/");
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("x-request-id")).toBeTruthy();
    expect(html).toContain('id="root"');
    expect(html).toContain("/assets/");
    expect(html).not.toMatch(/APP_TOKEN|AUTOMATION_SECRET|GITHUB_OAUTH_CLIENT_SECRET|Cf-Access-Jwt-Assertion|Cloudflare Access|authorization/iu);
  });

  it("serves and scans every manifest-declared React asset", async () => {
    const manifestResponse = await SELF.fetch("https://example.test/manifest.json");
    expect(manifestResponse.status).toBe(200);
    const manifest = await manifestResponse.json() as Record<string, { file?: string; css?: string[] }>;
    const assetPaths = new Set<string>(["/index.html", "/manifest.json"]);
    for (const entry of Object.values(manifest)) {
      if (entry.file) assetPaths.add(`/${entry.file}`);
      for (const css of entry.css ?? []) assetPaths.add(`/${css}`);
    }
    for (const path of assetPaths) {
      const response = await SELF.fetch(`https://example.test${path}`);
      const source = await response.text();
      expect(response.status, path).toBe(200);
      expect(source, path).not.toMatch(/APP_TOKEN|AUTOMATION_SECRET|GITHUB_OAUTH_CLIENT_SECRET|CF_ACCESS_CLIENT|Cf-Access-Jwt-Assertion|Cloudflare Access/iu);
    }
  });

  it.each(["/submit", "/knowledge", "/search", "/agent", "/admin/assets", "/admin/members"]) ("serves React for known deep link %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('id="root"');
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it.each(["/knowledge/knowledge-1", "/admin/submissions/submission-1"]) ("serves React for bounded parameter route %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('id="root"');
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it.each(["/knowledge/knowledge-1/revisions/revision-1", "/admin/submissions/submission-1/publish", "/admin/publications/recover", "/not-a-workspace-route"]) ("does not broaden the SPA allowlist to %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);
    expect(response.status).toBe(404);
  });

  it("keeps API authorization server-authoritative", async () => {
    const response = await SELF.fetch("https://example.test/api/admin/members");
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("keeps authenticated contributor admin API access forbidden", async () => {
    const app = createApp();
    const context = createExecutionContext();
    const response = await app.fetch!(new Request("https://example.test/api/admin/members", {
      headers: { cookie: `__Host-memory-session=${sessionToken}` },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});
