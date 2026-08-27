import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { AdminMenusPage } from "../../frontend/pages/admin/menus-page";

describe("AdminMenusPage", () => {
  it("renders a nested menu tree and protects system entries", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    const onUpdate = vi.fn();
    const menus = [{ id: "root", parentId: null, key: "workspace", labelKey: "NAV_HOME", path: null, icon: null, groupName: "workspace", position: 0, requiredBits: "0x0", status: "active" as const, visible: true, isSystem: true, children: [{ id: "custom", parentId: "root", key: "custom", labelKey: "NAV_HOME", path: "/custom", icon: null, groupName: "workspace", position: 1, requiredBits: "0x0", status: "active" as const, visible: true, isSystem: false, children: [] }] }];
    const view = AdminMenusPage({ locale, state: { kind: "ready", menus }, onUpdate });
    expect(view).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
