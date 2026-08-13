/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("workspace assets", () => {
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
});
