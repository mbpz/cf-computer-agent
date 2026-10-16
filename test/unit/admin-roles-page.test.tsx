// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminRolesPage } from "../../frontend/pages/admin/roles-page";
import { AdminRoleDetailPage } from "../../frontend/pages/admin/role-detail-page";
import { AdminRoleCreatePage } from "../../frontend/pages/admin/create-role-page";
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

const locale = () => createLocaleRuntime({ navigatorLanguage: "en" });

describe("admin role list", () => {
  it("renders the role list as a table with a link to each role's detail page", () => {
    const html = renderToStaticMarkup(<AdminRolesPage locale={locale()} state={{ kind: "ready", roles: [role] }} />);
    expect(html).toContain("Roles &amp; permissions");
    expect(html).toContain("Administrator");
    expect(html).toContain('href="/admin/roles/role-admin"');
    expect(html).toContain("0x7ffff");
    expect(html).not.toContain("undefined");
  });

  it("surfaces the permission detail page from the list action", () => {
    const html = renderToStaticMarkup(<AdminRolesPage locale={locale()} state={{ kind: "ready", roles: [role] }} />);
    expect(html).toContain("Create role");
  });
});

describe("admin role permission detail", () => {
  it("renders the selected role, grouped permissions and a hexadecimal mask", () => {
    const html = renderToStaticMarkup(
      <AdminRoleDetailPage locale={locale()} state={{ kind: "ready", roles: [role] }} roleId="role-admin" onSave={vi.fn()} />,
    );
    expect(html).toContain("Roles &amp; permissions");
    expect(html).toContain("Knowledge");
    expect(html).toContain("knowledge:read");
    expect(html).toContain("0x7ffff");
    expect(html).not.toContain("undefined");
  });

  it("normalizes malformed API role rows instead of exposing unsafe values", () => {
    expect(normalizeAdminRole({ id: "r1", key: "editor", name: "Editor", description: "", allowBits: "0x3", memberCount: 1, assignedMemberIds: ["member-1"], status: "active", isSystem: false })).toMatchObject({ id: "r1", description: "", allowBits: "0x3", memberCount: 1, assignedMemberIds: ["member-1"] });
    expect(normalizeAdminRole({ id: "r1", key: "editor", name: "Editor", allowBits: "0x3", memberCount: 1, assignedMemberIds: ["member-1"], status: "active", isSystem: false })).toBeNull();
    expect(normalizeAdminRole({ ...role, memberCount: 2 })).toBeNull();
    expect(normalizeAdminRole({ id: "r2", key: "bad", name: "Bad", allowBits: "not-mask" })).toBeNull();
    expect(normalizeAdminRole({ id: "r3", key: "bad", name: "Bad", allowBits: "0x1", memberCount: -1 })).toBeNull();
  });

  it("renders member assignment controls for a custom role", () => {
    const customRole: AdminRole = { ...role, id: "role-editor", key: "editor", name: "Editor", isSystem: false, assignedMemberIds: ["member-1"] };
    const html = renderToStaticMarkup(
      <AdminRoleDetailPage locale={locale()} state={{ kind: "ready", roles: [customRole] }} roleId="role-editor" onAssignMember={vi.fn()} onUnassignMember={vi.fn()} />,
    );
    expect(html).toContain("Assigned members");
    expect(html).toContain("member-1");
    expect(html).toContain("Assign member");
    expect(html).not.toContain("undefined");
  });

  it("falls back to an unavailable state for an unknown role id", () => {
    const html = renderToStaticMarkup(<AdminRoleDetailPage locale={locale()} state={{ kind: "ready", roles: [role] }} roleId="missing" />);
    expect(html).toContain("Role unavailable");
  });

  it("renders exactly one titled h1 on each role page through the shared header", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["Roles &amp; permissions", renderToStaticMarkup(<AdminRolesPage locale={locale()} state={{ kind: "ready", roles: [role] }} />)],
      ["Create role", renderToStaticMarkup(<AdminRoleCreatePage locale={locale()} />)],
      ["Roles &amp; permissions", renderToStaticMarkup(<AdminRoleDetailPage locale={locale()} state={{ kind: "ready", roles: [role] }} roleId="role-admin" />)],
    ];
    for (const [title, html] of cases) {
      expect((html.match(/<h1/g) ?? []).length, title).toBe(1);
      expect(html, title).toContain(title);
    }
  });
});
