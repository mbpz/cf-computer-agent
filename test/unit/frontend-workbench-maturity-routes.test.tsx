// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { WORKBENCH_MATURITY_CAPABILITIES } from "../../shared/workbench-maturity-capabilities";
import { mountApp, mountAuthenticatedApp, type MountedApp, waitForApp } from "../helpers/authenticated-app-harness";

type RouteId = (typeof WORKBENCH_MATURITY_CAPABILITIES)[number]["routeId"];

const PERMISSION_MASK_BY_ROUTE = {
  home: "0x0",
  submit: "0x0",
  knowledge: "0x0",
  search: "0x0",
  agent: "0x0",
  "my-submissions": "0x0",
  tasks: "0x100000",
  boards: "0x100000",
  settings: "0x0",
  admin: "0x0",
  "admin-submissions": "0x0",
  "admin-duplicates": "0x0",
  "admin-assets": "0x0",
  "admin-members": "0x0",
  "admin-roles": "0x0",
  "admin-menus": "0x0",
  "admin-spaces": "0x0",
  "admin-audit": "0x0",
  "admin-analytics": "0x0",
  notifications: "0x0",
  messages: "0x0",
  "knowledge-reader": "0x0",
  "message-thread": "0x0",
  "admin-submission-detail": "0x0",
} as const satisfies Record<RouteId, string>;

const DIRECT_PATH_BY_PARAMETERIZED_ROUTE = {
  "knowledge-reader": "/knowledge/knowledge-route-audit",
  "message-thread": "/messages/thread-route-audit",
  "admin-submission-detail": "/admin/submissions/submission-route-audit",
} as const satisfies Partial<Record<RouteId, string>>;

describe("workbench maturity route entry audit", () => {
  let journey: MountedApp | undefined;

  afterEach(async () => {
    await journey?.unmount();
    journey = undefined;
  });

  for (const capability of WORKBENCH_MATURITY_CAPABILITIES.filter((record) => record.routePattern === undefined)) {
    it(`${capability.routeId} is reachable from its permitted rendered entry`, async () => {
      journey = await mountAuthenticatedApp({
        url: "https://app.test/",
        role: capability.requiredRole === "admin" ? "admin" : "contributor",
        permissionMask: PERMISSION_MASK_BY_ROUTE[capability.routeId],
        fetch: createRouteAuditFetch(capability.routeId),
      });
      if (capability.routeId === "settings") {
        await act(async () => (journey!.container.querySelector("[data-account-trigger]") as HTMLElement).click());
        await waitForApp(() => journey!.container.querySelector('[data-route-id="settings"]') !== null);
      }
      const entry = journey.container.querySelector(`[data-route-id="${capability.routeId}"]`) as HTMLElement | null;
      expect(entry).not.toBeNull();
      await act(async () => entry!.click());
      await waitForApp(() => journey!.browser.location.pathname === capability.pathname);
      expect(journey.browser.location.pathname).toBe(capability.pathname);
      expect(journey.container.querySelector(`main [data-page-route-id="${capability.routeId}"]`)).not.toBeNull();
    });
  }

  for (const capability of WORKBENCH_MATURITY_CAPABILITIES.filter((record) => record.routePattern !== undefined)) {
    it(`${capability.routeId} renders directly under its owning entry`, async () => {
      const directPath = DIRECT_PATH_BY_PARAMETERIZED_ROUTE[capability.routeId];
      expect(directPath).toBeDefined();
      journey = await mountAuthenticatedApp({
        url: `https://app.test${directPath}`,
        role: capability.requiredRole === "admin" ? "admin" : "contributor",
        permissionMask: PERMISSION_MASK_BY_ROUTE[capability.routeId],
        fetch: createRouteAuditFetch(capability.routeId),
      });
      expect(journey.container.querySelector(`[data-route-id="${capability.parentRouteId}"]`)).not.toBeNull();
      expect(journey.container.querySelector(`main [data-page-route-id="${capability.routeId}"]`)).not.toBeNull();
      expect(journey.container.querySelector(`[data-route-id="${capability.routeId}"]`)).toBeNull();
    });
  }
});

describe("workbench maturity role and direct-route audit", () => {
  let journey: MountedApp | undefined;

  afterEach(async () => {
    await journey?.unmount();
    journey = undefined;
  });

  it("renders Login instead of the workbench for an anonymous session", async () => {
    journey = await mountApp({
      url: "https://app.test/admin",
      fetch: async (input) => {
        if (String(input) === "/api/session") return apiError(401, "UNAUTHORIZED");
        if (String(input) === "/api/telemetry/pageview") return new Response(null, { status: 204 });
        throw new Error(`unexpected anonymous request: ${String(input)}`);
      },
    });
    await waitForApp(() => journey!.container.querySelector("[data-login-page]") !== null);
    expect(journey.container.querySelector("[data-shell-root]")).toBeNull();
  });

  it("keeps contributor sessions out of administration entries and direct pages", async () => {
    journey = await mountAuthenticatedApp({
      url: "https://app.test/admin",
      role: "contributor",
      permissionMask: "0x100000",
      fetch: createRouteAuditFetch("admin"),
    });
    expect(journey.container.querySelector('[data-route-id="admin"]')).toBeNull();
    expect(journey.container.querySelector('[data-page-route-id="admin"]')?.getAttribute("data-page-state")).toBe("forbidden");
    expect(journey.container.textContent).not.toContain("Administration overview");
  });

  it("projects permitted administration entries for an admin session", async () => {
    journey = await mountAuthenticatedApp({
      url: "https://app.test/",
      role: "admin",
      permissionMask: "0x0",
      fetch: createRouteAuditFetch("admin"),
    });
    for (const routeId of ["admin", "admin-submissions", "admin-duplicates", "admin-assets", "admin-members", "admin-roles", "admin-menus", "admin-spaces", "admin-audit", "admin-analytics"]) {
      expect(journey.container.querySelector(`[data-route-id="${routeId}"]`), routeId).not.toBeNull();
    }
  });

  it("removes a revoked task entry and rejects its direct route", async () => {
    journey = await mountAuthenticatedApp({
      url: "https://app.test/tasks",
      role: "contributor",
      permissionMask: "0x0",
      fetch: createRouteAuditFetch("tasks"),
    });
    expect(journey.container.querySelector('[data-route-id="tasks"]')).toBeNull();
    expect(journey.container.querySelector('[data-page-route-id="tasks"]')?.getAttribute("data-page-state")).toBe("forbidden");
  });

  it("does not expose a context-revoked message thread after its APIs reject access", async () => {
    const requests: string[] = [];
    journey = await mountAuthenticatedApp({
      url: "https://app.test/messages/thread-route-audit",
      role: "contributor",
      permissionMask: "0x0",
      fetch: async (input) => {
        const path = String(input);
        requests.push(path);
        if (path === "/api/navigation") return apiError(503, "NAVIGATION_AUDIT_FALLBACK");
        if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
        if (path.startsWith("/api/discussions/thread-route-audit")) return apiError(403, "DISCUSSION_CONTEXT_FORBIDDEN");
        throw new Error(`unexpected context audit request: ${path}`);
      },
    });
    await waitForApp(() => journey!.container.querySelector('main [role="alert"]') !== null);
    expect(requests).toContain("/api/discussions/thread-route-audit");
    expect(requests).toContain("/api/discussions/thread-route-audit/messages?limit=20");
    expect(journey.container.querySelector("#discussion-composer")).toBeNull();
  });
});

describe("workbench maturity async-state audit", () => {
  let journey: MountedApp | undefined;

  afterEach(async () => {
    await journey?.unmount();
    journey = undefined;
  });

  for (const state of ["loading", "error", "empty"] as const) {
    it(`exposes the existing task ${state} state to the route audit`, async () => {
      journey = await mountAuthenticatedApp({
        url: "https://app.test/tasks",
        role: "contributor",
        permissionMask: PERMISSION_MASK_BY_ROUTE.tasks,
        fetch: createTaskStateAuditFetch(state),
      });
      await waitForApp(() => journey!.container.querySelector(`main [data-page-state="${state}"]`) !== null);
      expect(journey.container.querySelector(`main [data-page-state="${state}"]`)).not.toBeNull();
      if (state === "error") expect(journey.container.querySelector('main [role="alert"] button')).not.toBeNull();
    });
  }
});

function createRouteAuditFetch(routeId: RouteId): typeof globalThis.fetch {
  switch (routeId) {
    case "home": case "submit": case "knowledge": case "search": case "agent": case "my-submissions":
    case "tasks": case "boards": case "settings": case "admin": case "admin-submissions":
    case "admin-duplicates": case "admin-assets": case "admin-members": case "admin-roles":
    case "admin-menus": case "admin-spaces": case "admin-audit": case "admin-analytics":
    case "notifications": case "messages": case "knowledge-reader": case "message-thread":
    case "admin-submission-detail":
      return async (input) => {
        const path = String(input);
        if (path === "/api/navigation") return apiError(503, "NAVIGATION_AUDIT_FALLBACK");
        if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
        if (path === "/api/knowledge/recent?limit=8") return Response.json({ items: [] });
        throw new Error(`unplanned ${routeId} route-audit request: ${path}`);
      };
  }
}

function createTaskStateAuditFetch(state: "loading" | "error" | "empty"): typeof globalThis.fetch {
  return async (input) => {
    const path = String(input);
    if (path === "/api/navigation") return apiError(503, "NAVIGATION_AUDIT_FALLBACK");
    if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
    if (path.startsWith("/api/tasks?")) {
      if (state === "loading") return new Promise<Response>(() => undefined);
      if (state === "error") return apiError(503, "TASKS_RETRYABLE_AUDIT_ERROR");
      return Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    }
    throw new Error(`unexpected task state audit request: ${path}`);
  };
}

function apiError(status: number, code: string): Response {
  return Response.json({ error: { code, message: code, retryable: false, requestId: "route-audit" } }, { status });
}
