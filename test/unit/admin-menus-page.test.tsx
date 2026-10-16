// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import type { Window as HappyDomWindow } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { AdminMenusPage } from "../../frontend/pages/admin/menus-page";
import type { AdminMenu } from "../../frontend/lib/admin-menus-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom and react-dom must resolve after the vm mocks above are installed, so the
// loader stays lazy here; a static import would bind the unusable module first.
const { Window } = await import("happy-dom");
const { createRoot } = await import("react-dom/client");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });

function menu(overrides: Partial<AdminMenu> = {}): AdminMenu {
  return { id: "custom", parentId: null, key: "custom", labelKey: "NAV_HOME", path: "/custom", icon: null, groupName: "workspace", position: 1, requiredBits: "0x0", status: "active", visible: true, isSystem: false, children: [], ...overrides };
}

describe("AdminMenusPage", () => {
  it("renders a nested menu tree and protects system entries", () => {
    const onUpdate = vi.fn();
    const menus = [{ ...menu({ id: "root", key: "workspace", path: null, isSystem: true }), children: [menu({ id: "custom", parentId: "root", path: "/custom" })] }];
    const view = AdminMenusPage({ locale, state: { kind: "ready", menus }, onUpdate });
    expect(view).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  describe("delete impact", () => {
    let browser: HappyDomWindow; let container: HTMLElement; let root: Root; let onDelete: Mock;

    beforeEach(async () => {
      browser = new Window({ url: "https://app.test/admin/menus" });
      for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
      container = browser.document.createElement("div") as unknown as HTMLElement;
      browser.document.body.append(container as unknown as Node);
      root = createRoot(container);
      onDelete = vi.fn();
    });
    afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

    async function mount(menus: readonly AdminMenu[]): Promise<void> {
      await act(async () => root.render(<AdminMenusPage state={{ kind: "ready", menus }} locale={locale} onUpdate={vi.fn()} onDelete={onDelete} onCreate={vi.fn()} />));
    }
    const dialog = () => container.querySelector('[role="alertdialog"]');
    const deleteButtons = () => [...container.querySelectorAll("button")].filter((item) => item.textContent === "Delete");
    /** The action button in the row whose treeitem label contains `rowText`. The
     * treeitem role sits on the row's own button, so row actions live on its wrapper. */
    function rowButton(rowText: string, label: string): HTMLButtonElement {
      const row = [...container.querySelectorAll('[role="treeitem"]')].find((item) => item.textContent?.includes(rowText))?.parentElement;
      const button = row ? [...row.querySelectorAll("button")].find((item) => item.textContent === label) : undefined;
      expect(button, `${label} in ${rowText}`).toBeTruthy();
      return button as HTMLButtonElement;
    }

    it("keeps the page header, toolbar hooks and tree rows", async () => {
      await mount([menu({ id: "root", key: "workspace", path: null, isSystem: true, children: [menu({ id: "child", key: "child", parentId: "root" })] })]);
      expect(container.textContent).toContain("Menu tree");
      expect(container.textContent).toContain("Navigation hierarchy");
      expect(container.querySelector("[data-menu-create-open]")).toBeTruthy();
      expect(container.querySelector("[data-menu-edit-open]")).toBeTruthy();
      expect(deleteButtons()).toHaveLength(1);
    });

    it("shows the nested impact before a parent deletion is confirmed", async () => {
      const parent = menu({
        id: "parent",
        key: "parent",
        path: "/parent",
        children: [
          menu({ id: "child-a", key: "child-a", parentId: "parent" }),
          menu({ id: "child-b", key: "child-b", parentId: "parent", children: [menu({ id: "grandchild", key: "grandchild", parentId: "child-b" })] }),
        ],
      });
      await mount([parent]);
      await act(async () => rowButton("/parent", "Delete").click());
      expect(dialog()?.textContent).toContain("3 nested entries");
      expect(dialog()?.textContent).toContain("child-a, child-b, grandchild");
      expect(onDelete).not.toHaveBeenCalled();
      await act(async () => (dialog()!.querySelector("[data-confirm-action]") as HTMLButtonElement).click());
      expect(onDelete).toHaveBeenCalledExactlyOnceWith(parent);
    });

    it("keeps the delete action away from system subtrees and shows no impact", async () => {
      await mount([menu({ id: "governance", key: "governance", path: null, isSystem: true, children: [menu({ id: "mixed", key: "mixed", parentId: "governance", children: [menu({ id: "system-child", key: "system-child", parentId: "mixed", isSystem: true })] })] })]);
      expect(deleteButtons()).toHaveLength(0);
      expect(container.querySelector("[data-menu-create-open]")).toBeTruthy();
      expect(dialog()).toBeNull();
    });
  });
});
