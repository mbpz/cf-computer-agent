import { describe, expect, it } from "vitest";
import { moduleForPath, WORKBENCH_MODULES, type WorkbenchModuleKey } from "../../shared/workbench-modules";
import { WORKSPACE_ROUTE_CAPABILITIES } from "../../shared/workspace-route-capabilities";

describe("workbench module registry", () => {
  it("keeps unique ordered modules with translated entry labels", () => {
    expect(WORKBENCH_MODULES.map((module) => module.key)).toEqual<WorkbenchModuleKey[]>([
      "workbench", "knowledge", "work", "collaboration", "assets", "data", "admin",
    ]);
    expect(new Set(WORKBENCH_MODULES.map((module) => module.order)).size).toBe(WORKBENCH_MODULES.length);
    for (const module of WORKBENCH_MODULES) {
      expect(module.labelKey).toMatch(/^[A-Z][A-Z0-9_]+$/u);
      expect(module.entryPath).toMatch(/^\//u);
    }
  });

  it("maps every ready route to a known module", () => {
    const keys = new Set(WORKBENCH_MODULES.map((module) => module.key));
    for (const route of WORKSPACE_ROUTE_CAPABILITIES) {
      expect(keys.has(route.moduleKey), `${route.id} has an unknown module`).toBe(true);
    }
  });

  it("resolves paths without guessing unknown routes", () => {
    expect(moduleForPath("/")?.key).toBe("workbench");
    expect(moduleForPath("/knowledge")?.key).toBe("knowledge");
    expect(moduleForPath("/admin/analytics")?.key).toBe("data");
    expect(moduleForPath("/not-a-route")).toBeUndefined();
  });
});
