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
  assignedMemberIds: ["member-1"],
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
    expect(normalizeAdminRole({ id: "r1", key: "editor", name: "Editor", allowBits: "0x3", memberCount: 2, assignedMemberIds: ["member-1"], status: "active", isSystem: false })).toMatchObject({ id: "r1", allowBits: "0x3", memberCount: 2, assignedMemberIds: ["member-1"] });
    expect(normalizeAdminRole({ id: "r2", key: "bad", name: "Bad", allowBits: "not-mask" })).toBeNull();
    expect(normalizeAdminRole({ id: "r3", key: "bad", name: "Bad", allowBits: "0x1", memberCount: -1 })).toBeNull();
  });

  it("renders member assignment controls for a custom role", () => {
    const customRole: AdminRole = { ...role, id: "role-editor", key: "editor", name: "Editor", isSystem: false, assignedMemberIds: ["member-1"] };
    const html = renderToStaticMarkup(
      <AdminRolesPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "ready", roles: [customRole] }} onAssignMember={vi.fn()} onUnassignMember={vi.fn()} />,
    );
    expect(html).toContain("Assigned members");
    expect(html).toContain("member-1");
    expect(html).toContain("Assign member");
    expect(html).not.toContain("undefined");
  });
});
