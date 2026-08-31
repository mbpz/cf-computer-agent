// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { canonicalWorkspaceLocationKey, readWorkspaceLocation, WORKSPACE_LOCATION_CHANGE_EVENT, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const admin = {
  member: { id: "admin-1", email: "admin@example.com", role: "admin" as const },
  capabilities: [
    "knowledge:read", "submission:create", "submission:read-own", "submission:read-all",
    "knowledge:review", "member:manage", "space:manage", "audit:read", "analytics:read",
  ],
  permissionMask: "0x100000",
  logoutUrl: "/auth/logout",
};

describe("shadcn workspace shell", () => {
  let container: HTMLDivElement;
  let root: Root;
  let browser: InstanceType<typeof Window>;

  beforeEach(() => {
    browser = new Window({ url: "https://app.test/" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history);
    vi.stubGlobal("location", browser.location);
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    browser.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a collapsible workspace rail with AI knowledge and site analytics entries", () => {
    const html = renderToStaticMarkup(
      <AppShell session={admin} pathname="/admin/analytics" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Site analytics</h1>
      </AppShell>,
    );
    expect(html).toContain('data-shell-sidebar-state="expanded"');
    expect(html).toContain("Collapse sidebar");
    expect(html).toContain("AI knowledge base");
    expect(html).toContain("Knowledge search");
    expect(html).toContain("AI assistant");
    expect(html).toContain("Governance");
    expect(html).toContain("Site analytics");
    expect(html).toContain("admin@example.com");
    expect(html).not.toContain("data-account-settings");
    expect(html).not.toContain("data-theme-option");
    expect(html).not.toContain("data-account-logout");
    expect(html).toContain("data-shell-topbar");
    expect(html).not.toContain("undefined");
    expect(html).toContain("data-breadcrumb");
  });

  it("keeps the independent site analytics menu admin-only", () => {
    const html = renderToStaticMarkup(
      <AppShell session={{ ...admin, member: { ...admin.member, role: "contributor" }, capabilities: ["knowledge:read"] }} pathname="/" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Workspace</h1>
      </AppShell>,
    );
    expect(html).not.toContain("Site analytics");
    expect(html).not.toContain("Governance");
  });

  it("projects authorized collaboration links into the global top bar without duplicating the sidebar", () => {
    const html = renderToStaticMarkup(
      <AppShell session={admin} pathname="/" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Workspace</h1>
      </AppShell>,
    );
    const collaborationNavigation = html.match(/<nav[^>]*data-shell-collaboration-navigation[^>]*>[\s\S]*?<\/nav>/u)?.[0] ?? "";
    const sidebarNavigation = html.match(/<nav[^>]*data-shell-sidebar-scroll[^>]*>[\s\S]*?<\/nav>/u)?.[0] ?? "";

    expect(Array.from(collaborationNavigation.matchAll(/<a[^>]*href="([^"]+)"/gu), (match) => match[1]))
      .toEqual(["/tasks", "/boards", "/notifications", "/messages"]);
    expect(collaborationNavigation).toContain('aria-label="Collaboration navigation"');
    expect(collaborationNavigation.match(/<svg/g)?.length).toBe(4);
    expect(collaborationNavigation.match(/min-h-10/g)?.length).toBe(4);
    expect(sidebarNavigation).not.toContain('href="/tasks"');
    expect(sidebarNavigation).not.toContain('href="/boards"');
    expect(sidebarNavigation).not.toContain('href="/notifications"');
    expect(sidebarNavigation).not.toContain('href="/messages"');
  });

  it("omits collaboration links whose route access is denied", () => {
    const html = renderToStaticMarkup(
      <AppShell session={{ ...admin, permissionMask: "0x0" }} pathname="/" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Workspace</h1>
      </AppShell>,
    );
    const collaborationNavigation = html.match(/<nav[^>]*data-shell-collaboration-navigation[^>]*>[\s\S]*?<\/nav>/u)?.[0] ?? "";

    expect(Array.from(collaborationNavigation.matchAll(/<a[^>]*href="([^"]+)"/gu), (match) => match[1]))
      .toEqual(["/notifications", "/messages"]);
  });

  it("selects the collaboration parent for boards and message threads while keeping links outside the mobile sheet", () => {
    const boardsHtml = renderToStaticMarkup(
      <AppShell session={admin} pathname="/boards" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Boards</h1>
      </AppShell>,
    );
    const messagesHtml = renderToStaticMarkup(
      <AppShell session={admin} pathname="/messages/thread-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })}>
        <h1>Messages</h1>
      </AppShell>,
    );

    expect(boardsHtml).toMatch(/<a(?=[^>]*href="\/boards")(?=[^>]*aria-current="page")/u);
    expect(messagesHtml).toMatch(/<a(?=[^>]*href="\/messages")(?=[^>]*aria-current="page")/u);
    expect(messagesHtml).toMatch(/<header[^>]*data-shell-topbar[\s\S]*data-shell-collaboration-navigation/u);
    expect(messagesHtml).toMatch(/<a(?=[^>]*href="\/messages")(?=[^>]*aria-label="Messages")/u);
  });

  it("navigates collaboration quick links to canonical paths without stale queries", async () => {
    const onNavigate = vi.fn();
    window.history.replaceState({}, "", "/notifications?page=2&read=unread");
    await act(async () => root.render(<AppShell session={admin} pathname="/notifications" locale={createLocaleRuntime()} onNavigate={onNavigate}><p>Notifications</p></AppShell>));
    await act(async () => (container.querySelector('[data-shell-collaboration-navigation] a[href="/notifications"]') as HTMLAnchorElement).click());
    expect(onNavigate).toHaveBeenLastCalledWith("/notifications");

    window.history.replaceState({}, "", "/messages?page=2&cursor=cursor_2");
    await act(async () => root.render(<AppShell session={admin} pathname="/messages" locale={createLocaleRuntime()} onNavigate={onNavigate}><p>Messages</p></AppShell>));
    await act(async () => (container.querySelector('[data-shell-collaboration-navigation] a[href="/messages"]') as HTMLAnchorElement).click());
    expect(onNavigate).toHaveBeenLastCalledWith("/messages");
  });

  it("resets exactly once through the real navigation link and App onNavigate pattern", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    function AppNavigationHarness() {
      const [location, setLocation] = useState(readWorkspaceLocation);
      useEffect(() => { const update = () => setLocation(readWorkspaceLocation()); window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update); return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update); }, []);
      return <AppShell session={admin} pathname={location.pathname} contentScrollKey={canonicalWorkspaceLocationKey(location)} locale={createLocaleRuntime()} onNavigate={(path) => writeWorkspaceHistory("push", path)}><p>{location.pathname}</p></AppShell>;
    }
    await act(async () => root.render(<AppNavigationHarness />));
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
    scrollTo.mockClear();

    const knowledgeLink = container.querySelector('a[href="/knowledge"]') as HTMLAnchorElement;
    await act(async () => knowledgeLink.click());

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(container.querySelector("[data-shell-content-scroll]")).not.toBeNull();
  });

  it("resets exactly once when a pathname prop changes without a history write", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    const renderShell = (pathname: string) => <AppShell session={admin} pathname={pathname} locale={createLocaleRuntime()}><p>{pathname}</p></AppShell>;
    await act(async () => root.render(renderShell("/knowledge")));
    scrollTo.mockClear();

    await act(async () => root.render(renderShell("/tasks")));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("resets for canonical primary queries but ignores modal URL state and ordinary rerenders", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    window.history.replaceState({}, "", "/knowledge");
    function AppLocationHarness() {
      const [location, setLocation] = useState(readWorkspaceLocation);
      useEffect(() => { const update = () => setLocation(readWorkspaceLocation()); window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update); return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update); }, []);
      return <AppShell session={admin} pathname={location.pathname} contentScrollKey={canonicalWorkspaceLocationKey(location)} locale={createLocaleRuntime()}><p>{window.location.search}</p></AppShell>;
    }
    await act(async () => root.render(<AppLocationHarness />));
    scrollTo.mockClear();

    await act(async () => writeWorkspaceHistory("push", "/knowledge?dialog=item-1"));
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => writeWorkspaceHistory("push", "/knowledge?dialog=item-1&page=2&pageSize=50"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("includes discussion cursor and context state in the canonical content scroll key", () => {
    const base = canonicalWorkspaceLocationKey({ pathname: "/messages", search: "" });
    expect(canonicalWorkspaceLocationKey({ pathname: "/messages", search: "?dialog=compose" })).toBe(base);
    expect(canonicalWorkspaceLocationKey({ pathname: "/messages", search: "?page=2&limit=50&cursor=cursor_2" })).not.toBe(base);
    expect(canonicalWorkspaceLocationKey({ pathname: "/messages", search: "?contextKind=task&contextId=task-1" })).not.toBe(base);
    expect(canonicalWorkspaceLocationKey({ pathname: "/messages/thread-1", search: "?page=2&cursor=cursor_2" }))
      .not.toBe(canonicalWorkspaceLocationKey({ pathname: "/messages/thread-1", search: "" }));
  });

  it("keeps the mobile Sheet focus viewport padded inside its scroll boundary", async () => {
    const onNavigate = vi.fn();
    await act(async () => root.render(<AppShell session={admin} pathname="/" locale={createLocaleRuntime()} onNavigate={onNavigate}><p>Home</p></AppShell>));
    const trigger = container.querySelector("[data-sheet-open] summary") as HTMLElement;
    await act(async () => trigger.click());

    const dialog = container.querySelector('[role="dialog"]');
    const focusViewport = dialog?.querySelector("[data-shell-mobile-focus-viewport]");
    expect(focusViewport).not.toBeNull();
    expect(focusViewport?.getAttribute("class")).toContain("scroll-p-1");
    expect(focusViewport?.getAttribute("class")).toContain("p-1");
    expect(focusViewport?.querySelector('button[aria-label="Close navigation"]')).not.toBeNull();
    expect(dialog?.querySelector("[data-shell-mobile-account-footer]")).not.toBeNull();
    expect(dialog?.textContent).toContain("admin@example.com");
    expect(dialog?.textContent).toContain("Administrator");
    expect(dialog?.querySelector("[data-account-trigger]")).not.toBeNull();
    expect(dialog?.querySelector("[data-account-menu]")).toBeNull();
    expect(dialog?.querySelector("[data-account-settings]")).toBeNull();
    expect(dialog?.querySelector("[data-theme-option]")).toBeNull();
    expect(dialog?.querySelector("[data-account-logout]")).toBeNull();

    const accountTrigger = dialog?.querySelector('[data-account-trigger-variant="mobile"]') as HTMLButtonElement;
    await act(async () => accountTrigger.click());
    const menu = dialog?.querySelector("[data-account-menu]") as HTMLElement;
    const settings = menu.querySelector('[data-account-settings]') as HTMLButtonElement;
    expect(container.querySelectorAll("[data-account-menu]")).toHaveLength(1);
    await act(async () => menu.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true })));
    expect(dialog?.querySelector("[data-account-menu]")).not.toBeNull();
    await act(async () => settings.click());
    expect(onNavigate).toHaveBeenCalledWith("/settings");
  });

  it("does not restore Tasks through the navigation-load failure fallback without its permission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const session = { ...admin, capabilities: ["knowledge:read"], permissionMask: "0x0" };
    await act(async () => root.render(<AppShell session={session} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.querySelector('a[href="/tasks"]')).toBeNull();
  });

  it("keeps the shared collapsed account trigger keyboard reachable and reveals actions only after opening", async () => {
    const onNavigate = vi.fn();
    const onLogout = vi.fn();
    await act(async () => root.render(<AppShell session={admin} pathname="/" locale={createLocaleRuntime()} onNavigate={onNavigate} onLogout={onLogout}><p>Home</p></AppShell>));

    const collapse = container.querySelector("[data-shell-collapse-toggle]") as HTMLButtonElement;
    await act(async () => collapse.click());

    expect(container.querySelector("[data-shell-account-footer]")).toBeNull();
    const accountTrigger = container.querySelector('[data-account-trigger-variant="collapsed"]') as HTMLElement;
    expect(accountTrigger).not.toBeNull();
    expect(accountTrigger.tagName).toBe("BUTTON");
    expect(accountTrigger.tabIndex).not.toBe(-1);
    expect(accountTrigger.getAttribute("class")).not.toContain("sr-only");
    expect(container.querySelector("[data-account-menu]")).toBeNull();
    await act(async () => { accountTrigger.focus(); accountTrigger.click(); });
    expect(document.activeElement).toBe(accountTrigger);

    const menu = container.querySelector("[data-account-menu]") as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.textContent).toContain("admin@example.com");
    expect(menu.textContent).toContain("Settings");
    expect(menu.querySelector('[data-account-settings]')).not.toBeNull();
    expect(menu.querySelectorAll('[data-theme-option]')).toHaveLength(3);
    const logout = menu.querySelector('[data-account-logout]') as HTMLButtonElement;
    expect(logout).not.toBeNull();
    expect(logout.getAttribute("role")).toBe("menuitem");
    const light = menu.querySelector('[data-theme-option="light"]') as HTMLButtonElement;
    await act(async () => { light.focus(); light.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    expect(document.activeElement).toBe(logout);
    const settings = menu.querySelector('[data-account-settings]') as HTMLButtonElement;
    await act(async () => settings.click());
    expect(onNavigate).toHaveBeenCalledWith("/settings");
    expect(container.querySelector("[data-account-menu]")).toBeNull();

    await act(async () => accountTrigger.click());
    for (const mode of ["light", "dark", "system"] as const) {
      const themeOption = container.querySelector(`[data-theme-option="${mode}"]`) as HTMLButtonElement;
      await act(async () => themeOption.click());
      expect(window.localStorage.getItem("memory-garden-theme")).toBe(mode);
      expect(container.querySelector("[data-account-menu]")).toBeNull();
      if (mode !== "system") await act(async () => accountTrigger.click());
    }

    await act(async () => accountTrigger.click());
    const retryableLogout = container.querySelector('[data-account-logout]') as HTMLButtonElement;
    await act(async () => retryableLogout.click());
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-account-menu]")).not.toBeNull();
  });

  it("keeps failed logout retryable after its pending state resolves", async () => {
    const onLogout = vi.fn();
    const renderShell = (logoutPending: boolean, logoutError: string | null) => <AppShell session={admin} pathname="/" locale={createLocaleRuntime()} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError}><p>Home</p></AppShell>;
    await act(async () => root.render(renderShell(false, null)));
    await act(async () => (container.querySelector('[data-account-trigger-variant="expanded"]') as HTMLElement).click());

    const initialLogout = container.querySelector('[data-account-logout]') as HTMLButtonElement;
    await act(async () => initialLogout.click());
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-account-menu]")).not.toBeNull();

    await act(async () => root.render(renderShell(true, null)));
    const pendingLogout = container.querySelector('[data-account-logout]') as HTMLButtonElement;
    expect(pendingLogout.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => root.render(renderShell(false, "Logout failed")));
    const failedLogout = container.querySelector('[data-account-logout]') as HTMLButtonElement;
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Logout failed");
    expect(failedLogout.disabled).toBe(false);
    await act(async () => failedLogout.click());
    expect(onLogout).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-account-menu]")).not.toBeNull();
  });

  it("keeps expanded account content within the viewport boundary", async () => {
    await act(async () => root.render(<AppShell session={admin} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>));
    await act(async () => (container.querySelector('[data-account-trigger-variant="expanded"]') as HTMLButtonElement).click());
    const menu = container.querySelector("[data-account-menu]") as HTMLElement;
    expect(menu.className).toContain("left-0");
    expect(menu.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(menu.className).toContain("w-[min(18rem,calc(100vw-2rem))]");
  });

  it("coordinates Account and Language menus and closes either on pathname changes", async () => {
    const renderShell = (pathname: string) => <AppShell session={admin} pathname={pathname} locale={createLocaleRuntime()}><p>{pathname}</p></AppShell>;
    await act(async () => root.render(renderShell("/")));
    const accountTrigger = container.querySelector('[data-account-trigger-variant="expanded"]') as HTMLButtonElement;
    const languageTrigger = container.querySelector('[aria-label="Language"]') as HTMLButtonElement;

    await act(async () => accountTrigger.click());
    expect(container.querySelector('[data-account-menu]')).not.toBeNull();
    await act(async () => languageTrigger.click());
    expect(container.querySelector('[data-account-menu]')).toBeNull();
    expect(container.querySelector('[data-menu-id="language"] [role="menu"]')).not.toBeNull();

    await act(async () => root.render(renderShell("/knowledge")));
    expect(container.querySelector('[data-menu-id="language"] [role="menu"]')).toBeNull();

    await act(async () => accountTrigger.click());
    expect(container.querySelector('[data-account-menu]')).not.toBeNull();
    await act(async () => root.render(renderShell("/tasks")));
    expect(container.querySelector('[data-account-menu]')).toBeNull();
  });
});
