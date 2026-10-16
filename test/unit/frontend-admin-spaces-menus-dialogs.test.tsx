// @vitest-environment node
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { SpacesPage } from "../../frontend/pages/admin/spaces-page";
import { AdminMenusPage } from "../../frontend/pages/admin/menus-page";
import type { AdminMenu } from "../../frontend/lib/admin-menus-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const collection = { id: "collection-1", name: "Collection", parentId: null, description: "", status: "active" as const, position: 0, updatedAt: "2026-09-28T00:00:00.000Z" };
const space = { id: "space-1", name: "Space", slug: "space", description: "", status: "active" as const, position: 0, updatedAt: "2026-09-28T00:00:00.000Z", collections: [collection] };
const menu: AdminMenu = { id: "custom", key: "custom", parentId: null, labelKey: "NAV_HOME", path: "/private-menu", icon: null, groupName: "workspace", position: 1, requiredBits: "0x0", status: "active", visible: true, isSystem: false, children: [] };

describe("spaces and menus overlays", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/spaces" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  function setInput(selector: string, value: string) {
    const el = container.querySelector(selector) as HTMLInputElement;
    expect(el, selector).toBeTruthy();
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new browser.Event("input", { bubbles: true }));
  }
  function buttonByText(text: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === text) as HTMLButtonElement | undefined; }
  async function click(element: HTMLElement | undefined | null) { expect(element, "clickable").toBeTruthy(); await act(async () => element!.click()); }

  async function renderSpaces(onManage = vi.fn().mockResolvedValue(true), onCreate = vi.fn().mockResolvedValue(true)) {
    await act(async () => root.render(<SpacesPage spaces={[space]} locale={locale} onManage={onManage} onCreate={onCreate} />));
    return { onManage, onCreate };
  }
  async function renderMenus(onUpdate = vi.fn(), onCreate = vi.fn()) {
    await act(async () => root.render(<AdminMenusPage state={{ kind: "ready", menus: [menu] }} locale={locale} onUpdate={onUpdate} onDelete={vi.fn()} onCreate={onCreate} />));
    return { onUpdate, onCreate };
  }

  it("opens the create-space overlay from its trigger, renders the fields and closes on cancel", async () => {
    await renderSpaces();
    expect(container.querySelector("[data-space-create-dialog]")).toBeNull();
    const trigger = container.querySelector("[data-space-create-open]") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-space-create-dialog]")).toHaveLength(1);
    expect(container.querySelector("#admin-space-name")).toBeTruthy();
    expect(container.querySelector("#admin-space-slug")).toBeTruthy();
    await click(container.querySelector("[data-space-create-cancel]") as HTMLButtonElement);
    expect(container.querySelector("[data-space-create-dialog]")).toBeNull();
  });

  it("opens the edit-space overlay from its trigger and closes on cancel", async () => {
    await renderSpaces();
    expect(container.querySelector("[data-space-edit-dialog]")).toBeNull();
    const trigger = buttonByText("Edit space: Space")!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    await click(trigger);
    expect(container.querySelectorAll("[data-space-edit-dialog]")).toHaveLength(1);
    expect(container.querySelector("#admin-record-name")).toBeTruthy();
    expect(container.querySelector("#admin-record-status")).toBeTruthy();
    await click(container.querySelector("[data-space-edit-cancel]") as HTMLButtonElement);
    expect(container.querySelector("[data-space-edit-dialog]")).toBeNull();
  });

  it("opens the create-menu overlay from its trigger, renders the fields and closes on cancel", async () => {
    await renderMenus();
    expect(container.querySelector("[data-menu-create-dialog]")).toBeNull();
    const trigger = container.querySelector("[data-menu-create-open]") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    await click(trigger);
    expect(container.querySelectorAll("[data-menu-create-dialog]")).toHaveLength(1);
    expect(container.querySelector('[name="key"]')).toBeTruthy();
    expect(container.querySelector('[name="path"]')).toBeTruthy();
    expect(container.querySelector('[name="parentId"]')).toBeTruthy();
    await click(container.querySelector("[data-menu-create-cancel]") as HTMLButtonElement);
    expect(container.querySelector("[data-menu-create-dialog]")).toBeNull();
  });

  it("opens the edit-menu overlay and writes the same payload on save", async () => {
    const { onUpdate } = await renderMenus(vi.fn().mockResolvedValue(true));
    expect(container.querySelector("[data-menu-edit-dialog]")).toBeNull();
    await click(container.querySelector("[data-menu-edit-open]") as HTMLButtonElement);
    expect(container.querySelectorAll("[data-menu-edit-dialog]")).toHaveLength(1);
    await act(async () => setInput('[name="path"]', "/changed"));
    await click(buttonByText("Save menu"));
    expect(onUpdate).not.toHaveBeenCalled();
    await click(buttonByText("Confirm change"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toBe(menu);
    expect(onUpdate.mock.calls[0][1]).toMatchObject({ path: "/changed", expected: { path: "/private-menu", position: 1 } });
    expect(container.querySelector("[data-menu-edit-dialog]")).toBeNull();
  });
});
