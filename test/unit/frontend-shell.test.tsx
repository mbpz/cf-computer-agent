// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { routeAccessAllowed } from "../../frontend/lib/route-access";

const contributor = {
  member: { id: "member-1", email: "reader@example.com", role: "contributor" as const },
  capabilities: ["knowledge:read", "submission:create", "submission:read-own"],
  logoutUrl: "/auth/logout",
};

describe("frontend application shell", () => {
  it("keeps only language controls in the top-right and a closed account trigger in the desktop footer", () => {
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
    expect(topbar).toContain('data-command-palette-trigger="true"');
    expect(topbar).toContain("Command palette");
    expect(html).not.toContain('data-shell-module-navigation');
    expect(html).not.toContain('data-context-rail');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(topbar).not.toContain("reader@example.com");
    expect(topbar).not.toContain("Settings");
    expect(topbar).not.toContain("Signing out");
    expect(html).toContain("data-shell-account-footer");
    expect(html).toContain("reader@example.com");
    expect(html).toContain("Member");
    expect(html).toContain('data-account-trigger="true"');
    expect(html).not.toContain('data-account-menu="true"');
    expect(html).not.toContain('data-account-settings="true"');
    expect(html).not.toContain('data-theme-option="true"');
    expect(html).not.toContain('data-account-logout="true"');
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

  it("keeps the work graph discoverable in the authenticated fallback sidebar", () => {
    const html = renderToStaticMarkup(
      <AppShell session={{ ...contributor, permissionMask: "0x100000" }} pathname="/graph" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Graph</h1>
      </AppShell>,
    );
    expect(html).toContain('href="/graph"');
    expect(html).toContain("Work graph");
  });

  it("hides Graph in the sidebar and forbids its direct page without the task permission", () => {
    const session = { ...contributor, permissionMask: "0x0" };
    const navigation = renderToStaticMarkup(<AppShell session={session} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>);
    const direct = renderToStaticMarkup(<AppShell session={session} pathname="/graph" locale={createLocaleRuntime()}><p>Graph content must not render</p></AppShell>);

    expect(navigation).not.toContain('href="/graph"');
    expect(direct).toContain("403: Access denied");
    expect(direct).not.toContain("Graph content must not render");
  });

  it("keeps the knowledge family nested under one fallback entry", () => {
    const html = renderToStaticMarkup(
      <AppShell session={contributor} pathname="/knowledge" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Knowledge</h1>
      </AppShell>,
    );
    const navigation = html.match(/<nav data-shell-sidebar-scroll[\s\S]*?<\/nav>/u)?.[0] ?? "";
    // The fallback tree derives the family from the shared registry's parentRouteId,
    // so it has to render the server tree's nesting: one depth-1 `/knowledge` entry
    // with its visible related entries as depth-2 children. `/submit` owns no entry
    // (migrations/0075 hides the row and the registry marks the route
    // `hiddenFromNavigation`), so the composer is reached from 我的提交 instead.
    const nodes = navigation.split("data-nav-node").slice(1).map((segment) => ({
      depth: /data-nav-depth="(\d+)"/u.exec(segment)?.[1],
      routeId: /data-route-id="([^"]+)"/u.exec(segment)?.[1],
    }));
    expect(nodes).toEqual([
      { depth: "1", routeId: "home" },
      { depth: "1", routeId: "knowledge" },
      { depth: "2", routeId: "search" },
      { depth: "2", routeId: "agent" },
      { depth: "2", routeId: "my-submissions" },
    ]);
    expect(navigation).not.toContain('href="/submit"');
  });

  it("hides the knowledge children the fallback session cannot reach", () => {
    const html = renderToStaticMarkup(
      <AppShell session={{ ...contributor, capabilities: ["knowledge:read"] }} pathname="/knowledge" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Knowledge</h1>
      </AppShell>,
    );
    const navigation = html.match(/<nav data-shell-sidebar-scroll[\s\S]*?<\/nav>/u)?.[0] ?? "";
    const nodes = navigation.split("data-nav-node").slice(1).map((segment) => ({
      depth: /data-nav-depth="(\d+)"/u.exec(segment)?.[1],
      routeId: /data-route-id="([^"]+)"/u.exec(segment)?.[1],
    }));
    // knowledge:read reaches the family entry and its two read-only children only;
    // the entry is still its own destination, so `/knowledge` remains clickable.
    expect(nodes).toEqual([
      { depth: "1", routeId: "home" },
      { depth: "1", routeId: "knowledge" },
      { depth: "2", routeId: "search" },
      { depth: "2", routeId: "agent" },
    ]);
    expect(navigation).not.toContain('href="/submit"');
    expect(navigation).not.toContain('href="/my-submissions"');
  });

  it("does not render admin navigation for a contributor", () => {
    const html = renderToStaticMarkup(
      <AppShell session={contributor} pathname="/" locale={createLocaleRuntime()}>
        <p>Home</p>
      </AppShell>,
    );
    expect(html).not.toContain("Administration");
    expect(html).not.toContain("Members");
    expect(html).not.toContain("Administration");
    expect(html).not.toContain("Site analytics");
  });

  it("keeps authorized administration destinations in the single primary navigation", () => {
    // `/api/admin/analytics/overview` requires audit:read, so that is what the nav entry
    // is gated on; analytics:read alone must not surface a destination the API refuses.
    const html = renderToStaticMarkup(<AppShell session={{ ...contributor, member: { ...contributor.member, role: "admin" }, capabilities: ["submission:read-all", "audit:read", "knowledge:read"] }} pathname="/admin/analytics" locale={createLocaleRuntime({ navigatorLanguage: "en" })}><p>Analytics</p></AppShell>);
    expect(html).toContain("Administration");
    expect(html).toContain("Site analytics");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("undefined");
    const analyticsOnly = renderToStaticMarkup(<AppShell session={{ ...contributor, member: { ...contributor.member, role: "admin" }, capabilities: ["submission:read-all", "analytics:read", "knowledge:read"] }} pathname="/admin/analytics" locale={createLocaleRuntime({ navigatorLanguage: "en" })}><p>Analytics</p></AppShell>);
    expect(analyticsOnly).toContain("Administration");
  });

  it("gates the analytics route on the capability its API requires", () => {
    // `/api/admin/analytics/overview` requires audit:read; analytics:read alone must not
    // grant the route, otherwise the navigation offers a destination the API refuses.
    const admin = { ...contributor, member: { ...contributor.member, role: "admin" as const } };
    expect(routeAccessAllowed({ ...admin, capabilities: ["submission:read-all", "analytics:read", "knowledge:read"] }, { capability: "audit:read" })).toBe(false);
    expect(routeAccessAllowed({ ...admin, capabilities: ["submission:read-all", "audit:read", "knowledge:read"] }, { capability: "audit:read" })).toBe(true);
    // The permission-mask fallback keeps working for sessions that carry the bit
    // (`audit:read` is bit 13, `analytics:read` is bit 14).
    expect(routeAccessAllowed({ ...admin, capabilities: [], permissionMask: "0x2000" }, { capability: "audit:read" })).toBe(true);
    expect(routeAccessAllowed({ ...admin, capabilities: [], permissionMask: "0x4000" }, { capability: "audit:read" })).toBe(false);
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

  it("hides Tasks in the initial fallback and forbids its direct page without the task permission", () => {
    const session = { ...contributor, permissionMask: "0x0" };
    const navigation = renderToStaticMarkup(<AppShell session={session} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>);
    const direct = renderToStaticMarkup(<AppShell session={session} pathname="/tasks" locale={createLocaleRuntime()}><p>Task content must not render</p></AppShell>);

    expect(navigation).not.toContain('href="/tasks"');
    expect(direct).toContain("403: Access denied");
    expect(direct).not.toContain("Task content must not render");
  });

  it("keeps Tasks in the initial fallback and allows its direct page with the task permission", () => {
    const session = { ...contributor, permissionMask: "0x100000" };
    const navigation = renderToStaticMarkup(<AppShell session={session} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>);
    const direct = renderToStaticMarkup(<AppShell session={session} pathname="/tasks" locale={createLocaleRuntime()}><p>Task content</p></AppShell>);

    expect(navigation).toContain('href="/tasks"');
    expect(direct).toContain("Task content");
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
