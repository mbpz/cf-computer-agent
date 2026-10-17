// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MENU_LABEL_KEYS } from "../../shared/admin-menu-fields";
import { WORKSPACE_ROUTE_CAPABILITIES, type WorkspaceRouteCapability } from "../../shared/workspace-route-capabilities";

// Routes whose copy intentionally lives outside the admin menu registry.
// `/settings` is opened from the shell account menu and stripped from the
// navigation tree by withoutSettings(), so it must never be offered as an
// admin-managed menu label. Every other registry label key must be editable
// through the admin menu editor, which only offers MENU_LABEL_KEYS.
const LABEL_KEY_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  settings: "SHELL_SETTINGS",
});

describe("admin menu label registry integrity", () => {
  it("keeps the canonical label key list free of duplicates", () => {
    expect(new Set(MENU_LABEL_KEYS).size).toBe(MENU_LABEL_KEYS.length);
  });

  it("registers every workspace route label key in MENU_LABEL_KEYS", () => {
    const labels = new Set<string>(MENU_LABEL_KEYS);
    const missing = WORKSPACE_ROUTE_CAPABILITIES
      .filter((route) => !(route.id in LABEL_KEY_EXCEPTIONS))
      .filter((route) => !labels.has(route.labelKey))
      .map((route) => `${route.id}:${route.labelKey}`);
    expect(missing).toEqual([]);
  });

  it("nests the knowledge family under one registry entry", () => {
    const routes: readonly WorkspaceRouteCapability[] = WORKSPACE_ROUTE_CAPABILITIES;
    const knowledge = routes.find((route) => route.id === "knowledge");
    expect(knowledge).toMatchObject({
      path: "/knowledge", labelKey: "NAV_KNOWLEDGE_BASE", availability: "ready", capability: "knowledge:read",
    });
    expect(knowledge?.parentRouteId).toBeUndefined();
    const children = routes.filter((route) => route.parentRouteId === "knowledge");
    // Registry order is the family's menu order; the seeded rows use the same
    // positions under menu-knowledge (migrations/0031 and 0074).
    expect(children.map((route) => route.id)).toEqual(["search", "agent", "submit", "my-submissions"]);
    // Only the knowledge family is nested, and every declared parent is a real entry.
    expect(routes.filter((route) => route.parentRouteId !== undefined)).toHaveLength(children.length);
    for (const route of routes) {
      if (route.parentRouteId === undefined) continue;
      expect(routes.some((candidate) => candidate.id === route.parentRouteId), `${route.id} parent`).toBe(true);
    }
    // Nesting is structure only: no URL, availability, module or capability moves.
    expect(children.map((route) => [route.path, route.availability, route.capability, route.moduleKey, route.requiredPermission])).toEqual([
      ["/search", "ready", "knowledge:read", "knowledge", undefined],
      ["/agent", "ready", "knowledge:read", "knowledge", undefined],
      ["/submit", "ready", "submission:create", "knowledge", undefined],
      ["/my-submissions", "ready", "submission:read-own", "knowledge", undefined],
    ]);
    // `/submit` is the one nested route without a navigation entry; the row is
    // hidden by migrations/0075 and the fallback tree reads this same flag.
    expect(children.filter((route) => route.hiddenFromNavigation).map((route) => route.id)).toEqual(["submit"]);
  });

  it("keeps the documented label key exception list minimal, known and real", () => {
    const labels = new Set<string>(MENU_LABEL_KEYS);
    const unregisteredRoutes = WORKSPACE_ROUTE_CAPABILITIES.filter((route) => !labels.has(route.labelKey));
    expect(unregisteredRoutes.map((route) => [route.id, route.labelKey])).toEqual(Object.entries(LABEL_KEY_EXCEPTIONS));
    for (const [id, labelKey] of Object.entries(LABEL_KEY_EXCEPTIONS)) {
      const route = WORKSPACE_ROUTE_CAPABILITIES.find((candidate) => candidate.id === id);
      expect(route, `${id} must stay a registered route for its documented exception`).toBeDefined();
      expect(route!.labelKey).toBe(labelKey);
    }
  });
});
