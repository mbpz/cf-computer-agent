// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRoleDetailPage } from "../../frontend/pages/admin/role-detail-page";
import { AdminRoleCreatePage } from "../../frontend/pages/admin/create-role-page";
import type { AdminRole } from "../../frontend/lib/admin-roles-data";
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
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
  let callbacks: { onSave: ReturnType<typeof vi.fn>; onAssignMember: ReturnType<typeof vi.fn>; onUnassignMember: ReturnType<typeof vi.fn> };
  let created: ReturnType<typeof vi.fn>;
  let onCreated: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/roles/editor" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    callbacks = { onSave: vi.fn(), onAssignMember: vi.fn(), onUnassignMember: vi.fn() };
    created = vi.fn(async () => true);
    onCreated = vi.fn();
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mountDetail(props: Partial<React.ComponentProps<typeof AdminRoleDetailPage>> = {}) { await act(async () => root.render(<AdminRoleDetailPage state={{ kind: "ready", roles }} roleId="editor" locale={locale} {...callbacks} {...props} />)); }
  async function mountCreate(props: Partial<React.ComponentProps<typeof AdminRoleCreatePage>> = {}) { await act(async () => root.render(<AdminRoleCreatePage locale={locale} onCreate={created} onCreated={onCreated} {...props} />)); }
  function button(label: string) { const found = [...document.querySelectorAll("button")].find(el => el.textContent === label); expect(found, label).toBeTruthy(); return found as HTMLButtonElement; }
  async function click(label: string) { await act(async () => button(label).click()); }
  async function press(selector: string) { const el = document.querySelector(selector) as HTMLButtonElement; expect(el, selector).not.toBeNull(); await act(async () => el.click()); }
  async function input(label: string, value: string) { const el = document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement; expect(el, label).not.toBeNull(); await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new browser.Event("input", { bubbles: true })); }); }
  const dialog = () => document.querySelector('[role="alertdialog"]');
  const operationLabel = { save: "Save permissions", assign: "Assign member", unassign: "Remove" };
  async function prepare(operation: keyof typeof operationLabel) {
    await mountDetail(); if (operation === "save") await press('input[aria-label="Use workspace tasks"]');
    if (operation === "assign") await input("Assigned members", "member-new");
    await click(operationLabel[operation]);
  }
  function unloadWarns() { const e = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(e); return e.defaultPrevented; }

  it.each(["Role key", "Role name", "Permission mask"])("protects the create input %s from navigation and unload until committed discard", async label => {
    await mountCreate(); expect(unloadWarns()).toBe(false);
    await act(async () => { await input(label, "draft"); writeWorkspaceHistory("push", "/tasks"); });
    expect(browser.location.pathname).toBe("/admin/roles/editor"); expect(unloadWarns()).toBe(true);
    expect(dialog()).not.toBeNull(); await press('[data-cancel-action]');
    expect(unloadWarns()).toBe(true);
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await press('[data-confirm-action]');
    expect(browser.location.pathname).toBe("/tasks"); expect(unloadWarns()).toBe(false);
    expect(created).not.toHaveBeenCalled();
  });

  it.each(["Assigned members", "permissions"])("protects the detail input %s from navigation and unload until committed discard", async label => {
    await mountDetail(); expect(unloadWarns()).toBe(false);
    await act(async () => {
      if (label === "permissions") (document.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).click();
      else await input(label, "draft");
      writeWorkspaceHistory("push", "/tasks");
    });
    expect(browser.location.pathname).toBe("/admin/roles/editor"); expect(unloadWarns()).toBe(true);
    expect(dialog()).not.toBeNull(); await press('[data-cancel-action]');
    expect(unloadWarns()).toBe(true);
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await press('[data-confirm-action]');
    expect(browser.location.pathname).toBe("/tasks"); expect(unloadWarns()).toBe(false);
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
  });

  it("does not discard a role draft when another final guard denies leaving", async () => {
    await mountDetail(); await input("Assigned members", "member-new"); let deny = false;
    const stop = registerWorkspaceLeaveGuard(() => ({ kind: deny ? "block" : "allow" }));
    try {
      await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); deny = true; await press('[data-confirm-action]');
      expect(browser.location.pathname).toBe("/admin/roles/editor");
      expect((document.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement).value).toBe("member-new");
      expect(unloadWarns()).toBe(true);
    } finally { stop(); }
  });

  it("blocks navigation while an action confirmation is open", async () => {
    await prepare("save"); await act(async () => { writeWorkspaceHistory("push", "/tasks"); });
    expect(browser.location.pathname).toBe("/admin/roles/editor");
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    await click("Cancel"); expect(unloadWarns()).toBe(true);
  });

  it("blocks actions during a leave decision and keeps the creation draft", async () => {
    await mountCreate();
    await act(async () => { await input("Role key", "custom"); await input("Role name", "Custom"); writeWorkspaceHistory("push", "/tasks"); button("Create role").click(); });
    expect(created).not.toHaveBeenCalled(); await press('[data-cancel-action]');
    expect((document.querySelector('input[aria-label="Role key"]') as HTMLInputElement).value).toBe("custom"); expect(unloadWarns()).toBe(true);
  });

  it("preserves a newer creation draft after a late successful response", async () => {
    let finish!: (ok: boolean) => void;
    const create = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })); await mountCreate({ onCreate: create });
    await act(async () => { await input("Role key", "custom"); await input("Role name", "Custom"); }); await click("Create role");
    await act(async () => { await input("Role name", "Newer name"); }); await act(async () => finish(true));
    expect((document.querySelector('input[aria-label="Role name"]') as HTMLInputElement).value).toBe("Newer name"); expect(unloadWarns()).toBe(true);
  });

  it("submits the latest creation snapshot once and then navigates back to the list", async () => {
    let finish!: (ok: boolean) => void;
    const create = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })); await mountCreate({ onCreate: create });
    await act(async () => { await input("Role key", "custom"); await input("Role name", "Custom"); });
    await act(async () => { await input("Role name", "Latest"); button("Create role").click(); button("Create role").click(); });
    expect(create).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledWith({ key: "custom", name: "Latest", allowBits: "0x0" });
    await act(async () => finish(true));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect((document.querySelector('input[aria-label="Role key"]') as HTMLInputElement).value).toBe("");
    expect(unloadWarns()).toBe(false);
  });

  it("keeps a creation draft dirty across an authoritative re-render", async () => {
    await mountCreate(); await act(async () => { await input("Role key", "custom"); await input("Role name", "Custom"); });
    await mountCreate();
    expect((document.querySelector('input[aria-label="Role key"]') as HTMLInputElement).value).toBe("custom");
    expect(unloadWarns()).toBe(true);
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await press('[data-confirm-action]');
    expect((document.querySelector('input[aria-label="Role key"]') as HTMLInputElement).value).toBe("");
    expect(unloadWarns()).toBe(false);
  });

  it("preserves independent unsaved permissions when the authoritative list refreshes", async () => {
    await mountDetail(); await press('input[aria-label="Use workspace tasks"]');
    await mountDetail({ state: { kind: "ready", roles: roles.map(role => ({ ...role })) } });
    expect((document.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).checked).toBe(true);
    expect(unloadWarns()).toBe(true);
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await press('[data-confirm-action]');
    expect((document.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).checked).toBe(false); expect(unloadWarns()).toBe(false);
  });

  it("does not restore an old creation result into a newly mounted form", async () => {
    let finish!: (ok: boolean) => void;
    await mountCreate({ onCreate: () => new Promise<boolean>(resolve => { finish = resolve; }) });
    await act(async () => { await input("Role key", "custom"); await input("Role name", "Custom"); }); await click("Create role");
    await mountCreate(); await mountCreate();
    await act(async () => { await input("Role name", "New scope"); finish(true); });
    expect((document.querySelector('input[aria-label="Role name"]') as HTMLInputElement).value).toBe("New scope"); expect(unloadWarns()).toBe(true);
  });

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
    await input("Assigned members", "member-later");
    await act(async () => finish(true));
    expect((document.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement).value).toBe("member-later");
    expect(callbacks.onAssignMember).toHaveBeenCalledTimes(1);
  });

  it.each(["save", "assign", "unassign"] as const)("canceling %s keeps the draft without writing", async operation => {
    await prepare(operation); expect(dialog()).not.toBeNull(); await press('[data-cancel-action]');
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    if (operation === "save") expect((document.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).checked).toBe(true);
    if (operation === "assign") expect((document.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement).value).toBe("member-new");
  });

  it.each(["permissions", "member draft"])("requires explicit discard when leaving with %s", async draft => {
    await mountDetail(); if (draft === "permissions") await press('input[aria-label="Use workspace tasks"]'); else await input("Assigned members", "member-new");
    await act(async () => { writeWorkspaceHistory("push", "/admin/roles/reviewer"); });
    expect(browser.location.pathname).toBe("/admin/roles/editor"); expect(dialog()).not.toBeNull();
    await press('[data-cancel-action]'); expect(browser.location.pathname).toBe("/admin/roles/editor");
    await act(async () => { writeWorkspaceHistory("push", "/admin/roles/reviewer"); }); await press('[data-confirm-action]');
    expect(browser.location.pathname).toBe("/admin/roles/reviewer");
    expect((document.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('input[aria-label="Assigned members"]') as HTMLInputElement).value).toBe("");
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it.each(["refresh", "saving", "blocked", "denied"])("drops an old confirmation after %s", async change => {
    await prepare("save"); const old = dialog()?.querySelector('[data-confirm-action]') as HTMLButtonElement; expect(old).toBeTruthy();
    const props = change === "refresh" ? { state: { kind: "ready" as const, roles: roles.map(role => ({ ...role })) } }
      : change === "saving" ? { saving: true } : change === "blocked" ? { writeBlocked: true } : { state: { kind: "forbidden" as const } };
    await mountDetail(props); expect(dialog()).toBeNull(); await act(async () => old.click()); expect(callbacks.onSave).not.toHaveBeenCalled();
    await mountDetail(); expect(dialog()).toBeNull();
  });

  it("blocks membership changes while permission edits are unsaved", async () => {
    await mountDetail(); await input("Assigned members", "member-new"); await press('input[aria-label="Use workspace tasks"]');
    expect(button("Assign member").disabled).toBe(true); expect(button("Remove").disabled).toBe(true);
    expect(container.textContent).toContain("Save or revert permission changes");
  });

  it("lets the default administrator add a missing workbench permission without dropping menu permissions", async () => {
    const adminRole: AdminRole = { id: "role-admin", key: "admin", name: "Administrator", description: "Full workspace governance", allowBits: "0x17ffff", memberCount: 1, assignedMemberIds: ["me"], status: "active", isSystem: true };
    await mountDetail({ state: { kind: "ready", roles: [adminRole] }, roleId: "role-admin" });
    const vm = document.querySelector('input[aria-label="Use workspace VM"]') as HTMLInputElement;
    const read = document.querySelector('input[aria-label="Read knowledge"]') as HTMLInputElement;
    const tasks = document.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement;
    expect(vm.disabled).toBe(false); expect(vm.checked).toBe(false);
    expect(tasks.disabled).toBe(true); expect(tasks.checked).toBe(true);
    expect(read.disabled).toBe(true);
    expect(button("Save permissions").disabled).toBe(true);
    await act(async () => vm.click());
    expect(button("Save permissions").disabled).toBe(false);
    await click("Save permissions"); await press('[data-confirm-action]');
    expect(callbacks.onSave).toHaveBeenCalledWith(adminRole, "0x37ffff");
  });

  it("locks the editor while a write is pending", async () => {
    await mountDetail({ saving: true });
    expect(button("Saving…").disabled).toBe(true);
    expect(button("Assign member").disabled).toBe(true);
  });
});
