// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MENU_LABEL_KEYS } from "../../shared/admin-menu-fields";
import { WORKSPACE_ROUTE_CAPABILITIES } from "../../shared/workspace-route-capabilities";

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
