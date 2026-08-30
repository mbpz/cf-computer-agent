// @vitest-environment node
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../frontend/components/ui/dropdown-menu";
import { menuKeyAction } from "../../frontend/lib/menu-keyboard";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");
const browser = new Window({ url: "https://app.test/" });
vi.stubGlobal("window", browser);
vi.stubGlobal("document", browser.document);
vi.stubGlobal("navigator", browser.navigator);
vi.stubGlobal("history", browser.history);
vi.stubGlobal("location", browser.location);
vi.stubGlobal("Node", browser.Node);
vi.stubGlobal("Element", browser.Element);
vi.stubGlobal("HTMLElement", browser.HTMLElement);
vi.stubGlobal("Event", browser.Event);
vi.stubGlobal("CustomEvent", browser.CustomEvent);
vi.stubGlobal("FocusEvent", browser.FocusEvent);
vi.stubGlobal("PointerEvent", browser.PointerEvent);
vi.stubGlobal("KeyboardEvent", browser.KeyboardEvent);
vi.stubGlobal("ResizeObserver", browser.ResizeObserver);
vi.stubGlobal("getComputedStyle", browser.getComputedStyle.bind(browser));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const { AppShell } = await import("../../frontend/components/shell/app-shell");

describe("dropdown keyboard contract", () => {
  it.each([
    ["Escape", "close"],
    ["Home", "first"],
    ["End", "last"],
    ["ArrowDown", "next"],
    ["ArrowUp", "previous"],
    ["Enter", null],
  ] as const)("maps %s to %s", (key, expected) => {
    expect(menuKeyAction(key)).toBe(expected);
  });

  it("emits menu semantics and keyboard-safe items", () => {
    const html = renderToStaticMarkup(<DropdownMenu><DropdownMenuTrigger aria-label="Open">Open</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>One</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('tabindex="-1"');
  });

  it("promotes ready collaboration routes over stale disabled server navigation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tree: [{
      id: "menu-workspace", key: "workspace", labelKey: "SHELL_GROUP_WORKSPACE", path: null, icon: null, groupName: "workspace", availability: "ready", children: [{
        id: "menu-home", key: "home", labelKey: "NAV_HOME", path: "/", icon: "House", groupName: "workspace", availability: "ready", children: [],
      }, {
        id: "menu-notifications", key: "notifications", labelKey: "NAV_NOTIFICATIONS", path: "/notifications", icon: null, groupName: "workspace", availability: "coming_soon", disabledReason: "not_implemented", children: [],
      }, {
        id: "menu-messages", key: "messages", labelKey: "NAV_MESSAGES", path: "/messages", icon: null, groupName: "workspace", availability: "coming_soon", disabledReason: "not_implemented", children: [],
      }],
    }] }), { status: 200, headers: { "content-type": "application/json" } })));
    const host = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(host as unknown as Node);
    const root = createRoot(host);
    act(() => root.render(<AppShell session={{ member: { id: "m1", email: "member@example.test", role: "contributor" }, capabilities: ["knowledge:read"], permissionMask: "0x0", logoutUrl: "/logout" }} pathname="/" locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })}><div /></AppShell>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(host.querySelector('a[href="/notifications"]')?.textContent).toContain("通知");
    expect(host.querySelector('a[href="/messages"]')?.textContent).toContain("消息");
    expect(host.querySelector('[data-nav-availability="coming_soon"] [aria-disabled="true"]')).toBeNull();
    const collapse = host.querySelector<HTMLButtonElement>("[data-shell-collapse-toggle]")!;
    await act(async () => collapse.click());
    expect(host.querySelector('a[href="/messages"]')).not.toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });
});
