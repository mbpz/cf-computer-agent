import { describe, expect, it } from "vitest";
import { buildMenuTree, type MenuRow } from "../../src/authorization/menu-tree";
import { permissionMaskFor } from "../../src/authorization/permission-bitmap";

const rows: MenuRow[] = [
  { id: "workspace", parentId: null, key: "workspace", labelKey: "NAV_WORKSPACE", path: null, icon: "House", groupName: "workspace", position: 0, requiredBits: "0x0", status: "active", visible: 1, isSystem: 1 },
  { id: "knowledge", parentId: "workspace", key: "knowledge", labelKey: "NAV_KNOWLEDGE_BASE", path: "/knowledge", icon: "BookOpen", groupName: "workspace", position: 1, requiredBits: "0x1", status: "active", visible: 1, isSystem: 1 },
  { id: "analytics", parentId: "admin", key: "analytics", labelKey: "NAV_SITE_ANALYTICS", path: "/admin/analytics", icon: "ChartLine", groupName: "admin", position: 2, requiredBits: "0x4000", status: "active", visible: 1, isSystem: 1 },
  { id: "admin", parentId: null, key: "admin", labelKey: "NAV_ADMINISTRATION", path: null, icon: "ShieldCheck", groupName: "admin", position: 1, requiredBits: "0x200", status: "active", visible: 1, isSystem: 1 },
];

describe("menu tree", () => {
  it("filters by required bits and keeps stable parent/position ordering", () => {
    const contributor = buildMenuTree(rows, permissionMaskFor(["knowledge:read"]));
    expect(contributor.map((node) => node.key)).toEqual(["workspace"]);
    expect(contributor[0]?.children.map((node) => node.key)).toEqual(["knowledge"]);

    const admin = buildMenuTree(rows, permissionMaskFor(["knowledge:read", "member:manage", "analytics:read"]));
    expect(admin.map((node) => node.key)).toEqual(["workspace", "admin"]);
    expect(admin[1]?.children.map((node) => node.key)).toEqual(["analytics"]);
  });

  it("rejects duplicate paths, cycles and trees deeper than four levels", () => {
    const duplicate = [...rows, { ...rows[1], id: "knowledge-copy" }];
    expect(() => buildMenuTree(duplicate, 0n)).toThrow("MENU_PATH_DUPLICATE");
    expect(() => buildMenuTree([
      { ...rows[0], parentId: "admin" },
      { ...rows[3], parentId: "workspace" },
    ], 0n)).toThrow("MENU_TREE_CYCLE");
    const deep = Array.from({ length: 5 }, (_, index) => ({ ...rows[0], id: `n${index}`, key: `n${index}`, parentId: index === 0 ? null : `n${index - 1}`, path: index === 4 ? "/deep" : null }));
    expect(() => buildMenuTree(deep, 0n)).toThrow("MENU_TREE_DEPTH");
  });

  it("rejects malformed rows instead of silently exposing an orphan", () => {
    expect(() => buildMenuTree([{ ...rows[1], parentId: "missing" }], 0n)).toThrow("MENU_PARENT_NOT_FOUND");
    expect(() => buildMenuTree([{ ...rows[1], requiredBits: "not-a-mask" }], 0n)).toThrow("PERMISSION_MASK_INVALID");
  });
});
