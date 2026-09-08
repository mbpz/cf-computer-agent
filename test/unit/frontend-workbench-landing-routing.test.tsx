// @vitest-environment node
import { describe, expect, it } from "vitest";
import { act } from "react";
import { mountApp, mountAuthenticatedApp, waitForApp } from "../helpers/authenticated-app-harness";

const errorResponse = (status: number, code: string) => Response.json({ error: { code, message: "Session unavailable", retryable: false } }, { status });

function demoNetworkBoundary() {
  const calls: string[] = [];
  const unexpected: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = typeof input === "object" && "url" in input ? input : undefined;
    const url = new URL(request?.url ?? String(input), "https://app.test/");
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.href}`;
    calls.push(key);
    if (url.origin === "https://app.test" && !url.search) {
      if (method === "GET" && url.pathname === "/api/session") return errorResponse(401, "AUTH_REQUIRED");
      if (method === "POST" && url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (method === "GET" && /^\/(?:frontend\/assets\/workbench-landing\/workbench|assets\/workbench-[\w-]+)\.glb$/.test(url.pathname)) return new Response(null, { status: 404 });
    }
    unexpected.push(key);
    throw new Error(`UNEXPECTED_REQUEST:${key}`);
  };
  return { fetch, calls, unexpected };
}

describe("demo request allowlist", () => {
  it.each([
    ["https://untrusted.example/api/telemetry/pageview", "POST"],
    ["https://app.test/api/session", "DELETE"],
    ["https://untrusted.example/assets/workbench-example.glb", "GET"],
    ["https://app.test/api/knowledge", "GET"],
  ])("records and rejects %s %s", async (url, method) => {
    const boundary = demoNetworkBoundary();
    await expect(boundary.fetch(new Request(url, { method }))).rejects.toThrow("UNEXPECTED_REQUEST");
    expect(boundary.unexpected).toEqual([`${method} ${url}`]);
  });
  it("normalizes URL, Request and init method overrides", async () => {
    const boundary = demoNetworkBoundary();
    expect((await boundary.fetch(new URL("https://app.test/api/session"))).status).toBe(401);
    expect((await boundary.fetch(new Request("https://app.test/api/session", { method: "DELETE" }), { method: "GET" })).status).toBe(401);
    expect((await boundary.fetch("/api/telemetry/pageview", { method: "post" })).status).toBe(204);
    expect(boundary.unexpected).toEqual([]);
  });
});

describe("public knowledge studio authentication boundary", () => {
  it("shows the public experience only at an anonymously authenticated root", async () => {
    const calls: string[] = [];
    const app = await mountApp({ url: "https://app.test/", fetch: async (input) => {
      const path = String(input); calls.push(path);
      if (path === "/api/session") return errorResponse(401, "AUTH_REQUIRED");
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      throw new Error(`UNEXPECTED_REQUEST:${path}`);
    } });
    try {
      await waitForApp(() => Boolean(app.container.querySelector("[data-workbench-landing]")));
      expect(app.container.querySelector("[data-shell-root]")).toBeNull();
      expect(app.container.querySelector('a[href="/auth/github"]')).not.toBeNull();
      expect(calls).toContain("/api/session");
      expect(calls.every(path => ["/api/session", "/api/telemetry/pageview"].includes(path))).toBe(true);
    } finally { await app.unmount(); }
  });

  it("keeps anonymous deep links on the existing login page", async () => {
    const app = await mountApp({ url: "https://app.test/knowledge/example", fetch: async (input) => {
      if (String(input) === "/api/session") return errorResponse(401, "AUTH_REQUIRED");
      if (String(input) === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      throw new Error(`UNEXPECTED_REQUEST:${input}`);
    } });
    try {
      await waitForApp(() => Boolean(app.container.querySelector("[data-login-page]")));
      expect(app.container.querySelector("[data-workbench-landing]")).toBeNull();
    } finally { await app.unmount(); }
  });

  it("runs the full fictional journey and every hotspot without business requests", async () => {
    const { fetch, calls, unexpected } = demoNetworkBoundary();
    const app = await mountApp({ url: "https://app.test/", fetch });
    // Keep alternate Happy DOM egress paths inside this test's boundary too.
    app.browser.fetch = fetch as typeof app.browser.fetch;
    app.browser.navigator.sendBeacon = (url) => {
      unexpected.push(`BEACON ${String(url)}`);
      return false;
    };
    app.browser.XMLHttpRequest.prototype.open = function (_method, url) {
      unexpected.push(`XHR ${String(url)}`);
      throw new Error("UNEXPECTED_XHR");
    };
    const click = async (selector: string) => {
      const button = app.container.querySelector<HTMLButtonElement>(selector);
      expect(button, selector).not.toBeNull();
      expect(button?.disabled, selector).toBe(false);
      await act(async () => button!.click());
    };
    const step = () => app.container.querySelector("[data-demo-step]")?.getAttribute("data-demo-step");
    try {
      await waitForApp(() => Boolean(app.container.querySelector("[data-workbench-landing]")));
      await click('[data-demo-action="start"]');
      expect(step()).toBe("capture");
      await click('[data-demo-action="capture"]');
      await click('[data-demo-action="next"]');
      expect(step()).toBe("library");
      await click('[data-demo-action="open-source"]');
      expect(app.container.querySelector("article[data-source-id]")).not.toBeNull();
      await click('[data-demo-action="next"]');
      expect(step()).toBe("answer");
      await click('[data-demo-action="show-answer"]');
      await click('button[data-citation-id="cite-filing"]');
      expect(app.container.querySelector('[data-paragraph-id="p2"][data-cited]')).not.toBeNull();
      await click('[data-demo-action="citation-back"]');
      await click('[data-demo-action="next"]');
      expect(step()).toBe("action");
      await click('[data-demo-action="complete-task"]');
      await click('[data-demo-action="next"]');
      expect(step()).toBe("complete");
      for (const feature of ["capture", "library", "answer", "action", "updates"]) {
        await click(`[data-feature="${feature}"]`);
        expect(app.container.querySelector('[role="dialog"]')).not.toBeNull();
        await click('[data-demo-action="close"]');
      }
      await click('[data-demo-action="replay"]');
      expect(step()).toBe("capture");
      expect(unexpected).toEqual([]);
      expect(calls).toContain("GET https://app.test/api/session");
      expect(calls.filter(call => call.includes("/api/")).every(call => ["GET https://app.test/api/session", "POST https://app.test/api/telemetry/pageview"].includes(call))).toBe(true);
    } finally { await app.unmount(); }
  });

  it.each([[500, "SERVER_ERROR"], [401, "MEMBER_NOT_ALLOWED"]])("does not disguise session error %s/%s as a demo", async (status, code) => {
    const app = await mountApp({ url: "https://app.test/", fetch: async (input) => {
      if (String(input) === "/api/session") return errorResponse(Number(status), String(code));
      throw new Error(`UNEXPECTED_REQUEST:${input}`);
    } });
    try {
      await waitForApp(() => Boolean(app.container.querySelector('[role="alert"]')));
      expect(app.container.querySelector("[data-workbench-landing]")).toBeNull();
      expect(app.container.querySelector("[data-login-page]")).not.toBeNull();
    } finally { await app.unmount(); }
  });

  it("keeps signed-in root inside the original workbench shell", async () => {
    const app = await mountAuthenticatedApp({ url: "https://app.test/", role: "contributor", permissionMask: "0x0", fetch: async (input) => {
      if (String(input) === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      return Response.json({ items: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    } });
    try {
      await waitForApp(() => Boolean(app.container.querySelector("[data-shell-root]")));
      expect(app.container.querySelector("[data-workbench-landing]")).toBeNull();
    } finally { await app.unmount(); }
  });
});
