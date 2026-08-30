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
  it("keeps only language controls in the top-right and puts account actions in the desktop footer", () => {
    const html = renderToStaticMarkup(
      <AppShell session={contributor} pathname="/knowledge" locale={createLocaleRuntime({ navigatorLanguage: "en" })} logoutPending logoutError="Session ended">
        <h1>Knowledge</h1>
      </AppShell>,
    );
    const topbar = html.match(/<header data-shell-topbar[\s\S]*?<\/header>/u)?.[0] ?? "";
    const primaryNavigation = html.match(/<nav data-shell-sidebar-scroll[\s\S]*?<\/nav>/u)?.[0] ?? "";
    expect(html).toContain("data-shell-sidebar");
    expect(html).toContain("data-shell-topbar");
    expect(topbar).toContain('aria-label="Language"');
    expect(topbar).not.toContain("reader@example.com");
    expect(topbar).not.toContain("Settings");
    expect(topbar).not.toContain("Signing out");
    expect(html).toContain("data-shell-account-footer");
    expect(html).toContain("reader@example.com");
    expect(html).toContain("Member");
    expect(html).toContain("Settings");
    expect(html).toContain("Light");
    expect(html).toContain("Dark");
    expect(html).toContain("System");
    expect(html).toContain("Signing out");
    expect(html).toContain("Session ended");
    expect(primaryNavigation).not.toContain("Settings");
    expect(html).not.toContain("Cloudflare free tier");
    expect(html).toContain("Knowledge");
    expect(html).not.toContain("undefined");
    expect(html).toContain('data-shell-root="true"');
    expect(html).toContain("lg:h-dvh");
    expect(html).toContain("lg:overflow-hidden");
    expect(html).toContain('data-shell-sidebar-scroll="true"');
    expect(html).toContain("min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain scroll-p-1 p-1");
    expect(html).toContain("shrink-0 border-t");
    expect(html).toContain('data-shell-content-scroll="true"');
    expect(html).toContain("lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain");
    expect(html).toContain("max-w-[1440px]");
    expect(html).toContain("lg:px-6 lg:py-5");
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

  it("renders a server-capability-shaped 403 state for a direct admin path", () => {
    const html = renderToStaticMarkup(
      <AppShell session={contributor} pathname="/admin/members" locale={createLocaleRuntime()}>
        <p>Admin content must not render</p>
      </AppShell>,
    );
    expect(html).toContain("403: Access denied");
    expect(html).not.toContain("Admin content must not render");
  });

  it("applies the same guard to parameterized admin review routes", () => {
    const html = renderToStaticMarkup(
      <AppShell session={contributor} pathname="/admin/submissions/sub-1" locale={createLocaleRuntime()}>
        <p>Review content must not render</p>
      </AppShell>,
    );
    expect(html).toContain("403: Access denied");
    expect(html).not.toContain("Review content must not render");
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
    expect(html).not.toContain("NAV_");
  });

  it("translates every admin navigation label in English and Chinese", () => {
    const routes = ["Review queue", "Asset queue", "Members", "Spaces", "Audit log"];
    const english = renderToStaticMarkup(<AppShell session={{ ...contributor, member: { ...contributor.member, role: "admin" }, capabilities: ["submission:read-all", "member:manage", "knowledge:read", "knowledge:review", "space:manage", "audit:read"] }} pathname="/admin" locale={createLocaleRuntime({ navigatorLanguage: "en" })}><p>Admin</p></AppShell>);
    for (const label of routes) expect(english).toContain(label);
    expect(english).not.toMatch(/NAV_[A-Z_]+/u);
    const chinese = renderToStaticMarkup(<AppShell session={{ ...contributor, member: { ...contributor.member, role: "admin" }, capabilities: ["submission:read-all", "member:manage", "knowledge:read", "knowledge:review", "space:manage", "audit:read"] }} pathname="/admin" locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })}><p>管理</p></AppShell>);
    for (const label of ["审核队列", "原件队列", "成员管理", "空间管理", "审计日志"]) expect(chinese).toContain(label);
    expect(chinese).not.toMatch(/NAV_[A-Z_]+/u);
  });
});
