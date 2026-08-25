// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const contributor = {
  member: { id: "member-1", email: "reader@example.com", role: "contributor" as const },
  capabilities: ["knowledge:read", "submission:create", "submission:read-own"],
  logoutUrl: "/auth/logout",
};

describe("frontend application shell", () => {
  it("keeps navigation left and account controls in the top-right", () => {
    const html = renderToStaticMarkup(
      <AppShell session={contributor} pathname="/knowledge" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Knowledge</h1>
      </AppShell>,
    );
    expect(html).toContain("data-shell-sidebar");
    expect(html).toContain("data-shell-topbar");
    expect(html).toContain('aria-label="Language"');
    expect(html).toContain("Log out");
    expect(html).toContain("Knowledge");
    expect(html).not.toContain("undefined");
  });

  it("does not render admin navigation for a contributor", () => {
    const html = renderToStaticMarkup(
      <AppShell session={contributor} pathname="/" locale={createLocaleRuntime()}>
        <p>Home</p>
      </AppShell>,
    );
    expect(html).not.toContain("Administration");
    expect(html).not.toContain("Members");
  });

  it("renders admin navigation only for an admin capability set", () => {
    const html = renderToStaticMarkup(
      <AppShell session={{ ...contributor, member: { ...contributor.member, role: "admin" }, capabilities: ["submission:read-all", "member:manage", "knowledge:read"] }} pathname="/admin/members" locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })}>
        <p>成员</p>
      </AppShell>,
    );
    expect(html).toContain("管理");
    expect(html).toContain("成员");
    expect(html).not.toContain("undefined");
  });
});
