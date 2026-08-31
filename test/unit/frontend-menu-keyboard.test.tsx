// @vitest-environment node
import { act, useState } from "react";
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
    const closedHtml = renderToStaticMarkup(<DropdownMenu><DropdownMenuTrigger aria-label="Open">Open</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>One</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    const html = renderToStaticMarkup(<DropdownMenu defaultOpen><DropdownMenuTrigger aria-label="Open">Open</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>One</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    expect(closedHtml).toContain('aria-expanded="false"');
    expect(closedHtml).not.toContain('role="menu"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('tabindex="-1"');
  });

  it("opens a controlled menu and dismisses only for outside pointers", () => {
    const onOpenChange = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      const handleOpenChange = (next: boolean) => {
        onOpenChange(next);
        setOpen(next);
      };
      return <><DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger>Language</DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem>English</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu><button data-outside type="button">Outside</button></>;
    }

    const host = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(host as unknown as Node);
    const root = createRoot(host);
    act(() => root.render(<Harness />));
    const trigger = host.querySelector<HTMLButtonElement>("button:not([data-outside])")!;
    expect(host.querySelector('[role="menu"]')).toBeNull();

    act(() => trigger.click());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const menu = host.querySelector<HTMLDivElement>('[role="menu"]')!;
    expect(menu).not.toBeNull();

    act(() => menu.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true })));
    expect(onOpenChange).toHaveBeenCalledTimes(1);

    act(() => host.querySelector<HTMLButtonElement>("[data-outside]")!.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true })));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("returns focus on Escape and moves among enabled menu items", () => {
    const host = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(host as unknown as Node);
    const root = createRoot(host);
    act(() => root.render(<DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Language</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>English</DropdownMenuItem>
        <DropdownMenuItem disabled>Disabled</DropdownMenuItem>
        <DropdownMenuItem>Chinese</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>));
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    const [english, , chinese] = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

    act(() => english.focus());
    act(() => english.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(browser.document.activeElement).toBe(chinese);
    act(() => chinese.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(browser.document.activeElement).toBe(english);
    act(() => english.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(browser.document.activeElement).toBe(chinese);
    act(() => chinese.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(browser.document.activeElement).toBe(trigger);
    act(() => root.unmount());
    host.remove();
  });

  it("dismisses when focus completes outside the menu", async () => {
    const host = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(host as unknown as Node);
    const root = createRoot(host);
    act(() => root.render(<><DropdownMenu defaultOpen><DropdownMenuTrigger>Language</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>English</DropdownMenuItem></DropdownMenuContent></DropdownMenu><button type="button" data-outside>Outside</button></>));
    const item = host.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    const outside = host.querySelector<HTMLButtonElement>("[data-outside]")!;
    act(() => item.focus());
    await act(async () => outside.focus());
    expect(host.querySelector('[role="menu"]')).toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });

  it("focuses the first enabled item when a trigger opens from the keyboard", () => {
    const host = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(host as unknown as Node);
    const root = createRoot(host);
    act(() => root.render(<DropdownMenu><DropdownMenuTrigger>Language</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem disabled>Disabled</DropdownMenuItem><DropdownMenuItem>English</DropdownMenuItem></DropdownMenuContent></DropdownMenu>));
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    const english = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find((item) => item.textContent === "English");
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    expect(browser.document.activeElement).toBe(english);
    act(() => root.unmount());
    host.remove();
  });

  it("closes after enabled selection but keeps disabled items open and inert", () => {
    const onSelect = vi.fn();
    const onDisabledSelect = vi.fn();
    const host = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(host as unknown as Node);
    const root = createRoot(host);
    act(() => root.render(<DropdownMenu defaultOpen><DropdownMenuTrigger>Language</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={onSelect}>English</DropdownMenuItem></DropdownMenuContent></DropdownMenu>));
    act(() => host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="menu"]')).toBeNull();

    act(() => root.render(<DropdownMenu key="disabled-menu" defaultOpen><DropdownMenuTrigger>Language</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem disabled onClick={onDisabledSelect}>Disabled</DropdownMenuItem></DropdownMenuContent></DropdownMenu>));
    const disabledItem = host.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    act(() => disabledItem.click());
    expect(onDisabledSelect).not.toHaveBeenCalled();
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("coordinates shell menus and dismisses either menu with an outside pointer", async () => {
    const host = browser.document.createElement("div") as unknown as HTMLDivElement;
    browser.document.body.append(host as unknown as Node);
    const root = createRoot(host);
    await act(async () => root.render(<AppShell session={{ member: { id: "m1", email: "member@example.com", role: "contributor" }, capabilities: ["knowledge:read"], logoutUrl: "/logout" }} pathname="/" locale={createLocaleRuntime()}><div /></AppShell>));
    const accountTrigger = host.querySelector<HTMLButtonElement>('[data-account-trigger-variant="expanded"]')!;
    const languageTrigger = host.querySelector<HTMLButtonElement>('[aria-label="Language"]')!;

    await act(async () => accountTrigger.click());
    expect(host.querySelector('[data-menu-id="account"] [role="menu"]')).not.toBeNull();
    await act(async () => languageTrigger.click());
    expect(host.querySelector('[data-menu-id="account"] [role="menu"]')).toBeNull();
    expect(host.querySelector('[data-menu-id="language"] [role="menu"]')).not.toBeNull();
    await act(async () => host.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true })));
    expect(host.querySelector('[data-menu-id="language"] [role="menu"]')).toBeNull();

    await act(async () => accountTrigger.click());
    expect(host.querySelector('[data-menu-id="account"] [role="menu"]')).not.toBeNull();
    await act(async () => host.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true })));
    expect(host.querySelector('[data-menu-id="account"] [role="menu"]')).toBeNull();
    await act(async () => root.unmount());
    host.remove();
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
