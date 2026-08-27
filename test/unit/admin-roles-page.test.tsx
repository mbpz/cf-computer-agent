// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminRolesPage } from "../../frontend/pages/admin/roles-page";
import { normalizeAdminRole, type AdminRole } from "../../frontend/lib/admin-roles-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const role: AdminRole = {
  id: "role-admin",
  key: "admin",
  name: "Administrator",
  description: "Full workspace governance",
  allowBits: "0x7ffff",
  memberCount: 1,
  status: "active",
  isSystem: true,
};

describe("admin role permission matrix", () => {
  it("renders role selection, grouped permissions and a hexadecimal mask", () => {
    const html = renderToStaticMarkup(
      <AdminRolesPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "ready", roles: [role] }} onSelect={vi.fn()} onSave={vi.fn()} />,
    );
    expect(html).toContain("Roles &amp; permissions");
    expect(html).toContain("Knowledge");
    expect(html).toContain("knowledge:read");
    expect(html).toContain("0x7ffff");
    expect(html).not.toContain("undefined");
  });

  it("normalizes malformed API role rows instead of exposing unsafe values", () => {
    expect(normalizeAdminRole({ id: "r1", key: "editor", name: "Editor", allowBits: "0x3", memberCount: 2, status: "active", isSystem: false })).toMatchObject({ id: "r1", allowBits: "0x3", memberCount: 2 });
    expect(normalizeAdminRole({ id: "r2", key: "bad", name: "Bad", allowBits: "not-mask" })).toBeNull();
    expect(normalizeAdminRole({ id: "r3", key: "bad", name: "Bad", allowBits: "0x1", memberCount: -1 })).toBeNull();
  });
});
