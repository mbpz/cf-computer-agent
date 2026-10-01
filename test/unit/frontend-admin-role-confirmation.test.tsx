// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRolesPage } from "../../frontend/pages/admin/roles-page";
import type { AdminRole } from "../../frontend/lib/admin-roles-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");



describe("role permission and membership confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const roles: AdminRole[] = [
    { id: "editor", key: "editor", name: "Editor", description: "Private role", allowBits: "0x1", memberCount: 1, assignedMemberIds: ["member-old"], status: "active", isSystem: false },
    { id: "reviewer", key: "reviewer", name: "Reviewer", description: "Reviews", allowBits: "0x0", memberCount: 0, assignedMemberIds: [], status: "active", isSystem: false },
  ];
  let callbacks: { onSave: ReturnType<typeof vi.fn>; onAssignMember: ReturnType<typeof vi.fn>; onUnassignMember: ReturnType<typeof vi.fn>; onSelect: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/roles" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    callbacks = { onSave: vi.fn(), onAssignMember: vi.fn(), onUnassignMember: vi.fn(), onSelect: vi.fn() };
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(props: Partial<React.ComponentProps<typeof AdminRolesPage>> = {}) { await act(async () => root.render(<AdminRolesPage state={{ kind: "ready", roles }} locale={locale} {...callbacks} {...props} />)); }
  function button(label: string) { const found = [...container.querySelectorAll("button")].find(el => el.textContent === label); expect(found, label).toBeTruthy(); return found as HTMLButtonElement; }
  async function click(label: string) { await act(async () => button(label).click()); }
  async function press(selector: string) { const el = container.querySelector(selector) as HTMLButtonElement; expect(el, selector).not.toBeNull(); await act(async () => el.click()); }
  async function input(value: string) { const el = container.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new browser.Event("input", { bubbles: true })); }); }
  const dialog = () => container.querySelector('[role="alertdialog"]');
  const operationLabel = { save: "Save permissions", assign: "Assign member", unassign: "Remove" };
  async function prepare(operation: keyof typeof operationLabel) {
    await mount(); if (operation === "save") await press('input[aria-label="Use workspace tasks"]');
    if (operation === "assign") await input("member-new");
    await click(operationLabel[operation]);
  }
  it.each(["save", "assign", "unassign"] as const)("confirms %s once with the exact target and impact", async operation => {
    await prepare(operation);
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull(); expect(dialog()?.textContent).toContain("Editor");
    expect(browser.document.activeElement?.textContent).toBe("Cancel");
    if (operation === "save") { expect(dialog()?.textContent).toContain("Use workspace tasks"); expect(dialog()?.textContent).toContain("0x100001"); expect(dialog()?.textContent).toContain("1"); }
    else expect(dialog()?.textContent).toContain(operation === "assign" ? "member-new" : "member-old");
    const confirm = dialog()!.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await act(async () => { confirm.click(); confirm.click(); });
    const callback = callbacks[operation === "save" ? "onSave" : operation === "assign" ? "onAssignMember" : "onUnassignMember"];
    expect(callback).toHaveBeenCalledTimes(1); expect(callback).toHaveBeenCalledWith(roles[0], operation === "save" ? "0x100001" : operation === "assign" ? "member-new" : "member-old");
    expect(dialog()).toBeNull();
  });
  it("does not clear a newer member draft when an earlier assignment settles", async () => {
    let finish!: (value: boolean) => void;
    callbacks.onAssignMember.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
    await prepare("assign"); await click("Confirm change");
    await input("member-later");
    await act(async () => finish(true));
    expect((container.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement).value).toBe("member-later");
    expect(callbacks.onAssignMember).toHaveBeenCalledTimes(1);
  });
  it.each(["save", "assign", "unassign"] as const)("canceling %s keeps the draft without writing", async operation => {
    await prepare(operation); expect(dialog()).not.toBeNull(); await press('[data-cancel-action]');
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    if (operation === "save") expect((container.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).checked).toBe(true);
    if (operation === "assign") expect((container.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement).value).toBe("member-new");
  });
  it.each(["permissions", "member draft"])("requires explicit discard when switching with %s", async draft => {
    await mount(); if (draft === "permissions") await press('input[aria-label="Use workspace tasks"]'); else await input("member-new");
    const reviewer = [...container.querySelectorAll("button")].find(el => el.textContent?.startsWith("Reviewer")) as HTMLButtonElement;
    await act(async () => reviewer.click());
    expect(callbacks.onSelect).not.toHaveBeenCalled(); expect(dialog()).not.toBeNull(); expect(dialog()?.textContent).toContain("Reviewer");
    await press('[data-cancel-action]'); expect(callbacks.onSelect).not.toHaveBeenCalled();
    await act(async () => reviewer.click()); await press('[data-confirm-action]');
    expect(callbacks.onSelect).toHaveBeenCalledWith("reviewer");
    expect((container.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).checked).toBe(false);
    expect((container.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement).value).toBe("");
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });
  it.each(["refresh", "saving", "blocked", "denied"])("drops an old confirmation after %s", async change => {
    await prepare("save"); const old = dialog()?.querySelector('[data-confirm-action]') as HTMLButtonElement; expect(old).toBeTruthy();
    const props = change === "refresh" ? { state: { kind: "ready" as const, roles: roles.map(role => ({ ...role })) } }
      : change === "saving" ? { saving: true } : change === "blocked" ? { writeBlocked: true } : { state: { kind: "forbidden" as const } };
    await mount(props); expect(dialog()).toBeNull(); await act(async () => old.click()); expect(callbacks.onSave).not.toHaveBeenCalled();
    await mount(); expect(dialog()).toBeNull();
  });
  it("blocks membership changes while permission edits are unsaved", async () => {
    await mount(); await input("member-new"); await press('input[aria-label="Use workspace tasks"]');
    expect(button("Assign member").disabled).toBe(true); expect(button("Remove").disabled).toBe(true);
    expect(container.textContent).toContain("Save or revert permission changes");
  });
  it("blocks role switching during a pending write", async () => {
    await mount({ saving: true }); const reviewer = [...container.querySelectorAll("button")].find(el => el.textContent?.startsWith("Reviewer")) as HTMLButtonElement;
    expect(reviewer.disabled).toBe(true); await act(async () => reviewer.click()); expect(callbacks.onSelect).not.toHaveBeenCalled();
  });
});
