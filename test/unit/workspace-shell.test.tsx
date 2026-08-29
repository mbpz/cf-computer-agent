// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

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
    function AppNavigationHarness() {
      const [pathname, setPathname] = useState("/");
      const navigate = (path: string) => { window.history.pushState({}, "", path); setPathname(path); };
      return <AppShell session={admin} pathname={pathname} locale={createLocaleRuntime()} onNavigate={navigate}><p>{pathname}</p></AppShell>;
    }
    await act(async () => root.render(<AppNavigationHarness />));
    scrollTo.mockClear();

    const knowledgeLink = container.querySelector('a[href="/knowledge"]') as HTMLAnchorElement;
    await act(async () => knowledgeLink.click());

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(container.querySelector("[data-shell-content-scroll]")).not.toBeNull();
  });

  it("resets for canonical primary queries but ignores modal URL state and ordinary rerenders", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    window.history.replaceState({}, "", "/knowledge");
    const shell = <AppShell session={admin} pathname="/knowledge" locale={createLocaleRuntime()}><p>Knowledge</p></AppShell>;
    await act(async () => root.render(shell));
    scrollTo.mockClear();

    await act(async () => root.render(<AppShell session={admin} pathname="/knowledge" locale={createLocaleRuntime()}><p>Modal state changed</p></AppShell>));
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => window.history.pushState({}, "", "/knowledge?dialog=item-1"));
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => window.history.pushState({}, "", "/knowledge?dialog=item-1&page=2&pageSize=50"));
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
    expect(focusViewport?.getAttribute("class")).toContain("scroll-py-2");
    expect(focusViewport?.getAttribute("class")).toContain("p-0.5");
    expect(focusViewport?.querySelector('button[aria-label="Close navigation"]')).not.toBeNull();
  });
});
