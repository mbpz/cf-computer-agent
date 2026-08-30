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
    expect(html).toContain("Settings");
    expect(html).toContain("Light");
    expect(html).toContain("Dark");
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

  it("keeps the mobile Sheet focus viewport padded inside its scroll boundary", async () => {
    await act(async () => root.render(<AppShell session={admin} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>));
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
    expect(dialog?.textContent).toContain("Settings");
    expect(dialog?.textContent).toContain("Log out");
  });

  it("does not restore Tasks through the navigation-load failure fallback without its permission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const session = { ...admin, capabilities: ["knowledge:read"], permissionMask: "0x0" };
    await act(async () => root.render(<AppShell session={session} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.querySelector('a[href="/tasks"]')).toBeNull();
  });

  it("keeps collapsed desktop account actions visible and keyboard reachable", async () => {
    const onNavigate = vi.fn();
    const onLogout = vi.fn();
    await act(async () => root.render(<AppShell session={admin} pathname="/" locale={createLocaleRuntime()} onNavigate={onNavigate} onLogout={onLogout}><p>Home</p></AppShell>));

    const collapse = container.querySelector("[data-shell-collapse-toggle]") as HTMLButtonElement;
    await act(async () => collapse.click());

    expect(container.querySelector("[data-shell-account-footer]")).toBeNull();
    const accountTrigger = container.querySelector("[data-shell-collapsed-account-trigger]") as HTMLElement;
    expect(accountTrigger).not.toBeNull();
    expect(accountTrigger.tagName).toBe("SUMMARY");
    expect(accountTrigger.tabIndex).not.toBe(-1);
    expect(accountTrigger.getAttribute("class")).not.toContain("sr-only");
    await act(async () => { accountTrigger.focus(); accountTrigger.click(); });
    expect(document.activeElement).toBe(accountTrigger);

    const menu = container.querySelector("[data-shell-collapsed-account-menu]") as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.textContent).toContain("admin@example.com");
    expect(menu.textContent).toContain("Settings");
    const settings = Array.from(menu.querySelectorAll("button")).find((button) => button.textContent?.includes("Settings"))!;
    await act(async () => settings.click());
    expect(onNavigate).toHaveBeenCalledWith("/settings");

    const dark = Array.from(menu.querySelectorAll("button")).find((button) => button.textContent?.includes("Dark"))!;
    await act(async () => dark.click());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    const logout = Array.from(menu.querySelectorAll("button")).find((button) => button.textContent?.includes("Log out"))!;
    await act(async () => logout.click());
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("preserves logout pending and error states in collapsed desktop account actions", async () => {
    await act(async () => root.render(<AppShell session={admin} pathname="/" locale={createLocaleRuntime()} logoutPending logoutError="Logout failed"><p>Home</p></AppShell>));
    await act(async () => (container.querySelector("[data-shell-collapse-toggle]") as HTMLButtonElement).click());
    await act(async () => (container.querySelector("[data-shell-collapsed-account-trigger]") as HTMLElement).click());

    const menu = container.querySelector("[data-shell-collapsed-account-menu]") as HTMLElement;
    expect(menu.querySelector('[role="alert"]')?.textContent).toBe("Logout failed");
    const logout = Array.from(menu.querySelectorAll("button")).find((button) => button.textContent?.includes("Signing out"));
    expect(logout).toBeDefined();
    expect(logout?.disabled).toBe(true);
  });
});
