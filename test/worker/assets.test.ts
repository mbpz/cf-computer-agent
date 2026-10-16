/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { WORKSPACE_ROUTE_CAPABILITIES } from "../../shared/workspace-route-capabilities";
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
    const csp = page.headers.get("content-security-policy") || "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(csp).toContain("connect-src 'self'");
    expect(page.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
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

  it("serves the real hashed public studio binaries without making APIs public", async () => {
    const manifestResponse = await SELF.fetch("https://example.test/manifest.json");
    const manifest = await manifestResponse.json() as Record<string, { file: string }>;
    const sizes: Record<string, number> = {};
    let compressedBytes = new Uint8Array();
    for (const source of ["workbench.glb", "workbench.glb.gz", "poster-desktop.webp", "poster-mobile.webp"]) {
      const key = Object.keys(manifest).find(value => value.endsWith(`/workbench-landing/${source}`));
      expect(key, `missing built asset ${source}`).toBeTruthy();
      const file = manifest[key!].file;
      const response = await SELF.fetch(`https://example.test/${file}`);
      expect(response.status, file).toBe(200);
      expect(response.headers.get("content-type"), file).not.toContain("text/html");
      const bytes = new Uint8Array(await response.arrayBuffer());
      sizes[source] = bytes.length;
      const header = new TextDecoder().decode(bytes.slice(0, 12));
      if (source.endsWith(".glb.gz")) {
        // The browser inflates this itself, so the wire bytes must be a real gzip stream.
        expect(response.headers.get("content-type")).toMatch(/^(application\/gzip|application\/octet-stream)(;|$)/);
        expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
        compressedBytes = bytes;
      } else if (source.endsWith(".glb")) {
        expect(response.headers.get("content-type")).toMatch(/^(model\/gltf-binary|application\/octet-stream)(;|$)/);
        expect(header.slice(0, 4)).toBe("glTF");
      } else {
        expect(response.headers.get("content-type")).toMatch(/^image\/webp(;|$)/);
        expect(header.slice(0, 4)).toBe("RIFF");
        expect(header.slice(8, 12)).toBe("WEBP");
      }
    }
    // Shipping the uncompressed model is what made slow links time out on the edge.
    expect(compressedBytes.length).toBeLessThan(sizes["workbench.glb"]! * 0.5);
    for (const path of ["/assets/missing-studio-model.glb", "/assets/missing-studio-poster.webp"]) {
      expect((await SELF.fetch(`https://example.test${path}`)).status).toBe(404);
    }
    const api = await SELF.fetch("https://example.test/api/knowledge");
    expect(api.status).toBe(401);
  });

  it.each(WORKSPACE_ROUTE_CAPABILITIES.filter(({ availability }) => availability === "ready").map(({ path }) => path))
  ("serves React for every ready registry route %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('id="root"');
    const csp = response.headers.get("content-security-policy") || "";
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(csp).toContain("connect-src 'self'");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it.each(["/knowledge/knowledge-1", "/messages/thread-1", "/admin/submissions/submission-1", "/admin/knowledge/knowledge-1", "/admin/roles/new", "/admin/roles/role-1"]) ("serves React for bounded parameter route %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('id="root"');
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("bounds the role detail shell path at 128 characters", async () => {
    // `/admin/roles/new` is a fixed path; the detail pattern keeps the same bound as the
    // other parameter paths, so something longer stays a 404 page rather than being served
    // the shell with an unrenderable id.
    const oversize = await SELF.fetch(`https://example.test/admin/roles/${"x".repeat(129)}`);
    expect(oversize.status).toBe(404);
  });

  it("bounds the knowledge item shell path at 128 characters", async () => {
    // The client page kind accepts any safe id; the shell is only served inside the
    // bound the other parameter paths use, so a longer path stays a 404 page.
    const oversize = await SELF.fetch(`https://example.test/admin/knowledge/${"x".repeat(129)}`);
    expect(oversize.status).toBe(404);
    await expect(oversize.text()).resolves.not.toContain('id="root"');
  });

  it("serves the same anonymous shell for /login as for /", async () => {
    const login = await SELF.fetch("https://example.test/login");
    expect(login.status).toBe(200);
    expect(login.headers.get("content-type")).toContain("text/html");
    const loginHtml = await login.text();
    expect(loginHtml).toContain('id="root"');
    expect(loginHtml).toContain("/assets/");

    const root = await SELF.fetch("https://example.test/");
    expect(root.status).toBe(200);
    await expect(root.text()).resolves.toBe(loginHtml);
  });

  it("keeps an unknown path a 404 with no shell body", async () => {
    const response = await SELF.fetch("https://example.test/unknown-xyz");
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain('id="root"');
    expect(body).toBe("");
  });

  it.each(["/knowledge/knowledge-1/revisions/revision-1", "/admin/submissions/submission-1/publish", "/admin/publications/recover", "/not-a-workspace-route"]) ("does not broaden the SPA allowlist to %s", async (path) => {
    const response = await SELF.fetch(`https://example.test${path}`);
    expect(response.status).toBe(404);
  });

  it("keeps API authorization server-authoritative", async () => {
    const response = await SELF.fetch("https://example.test/api/admin/members");
    expect(response.status).toBe(401);
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
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
