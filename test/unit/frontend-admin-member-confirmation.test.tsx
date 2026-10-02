// @vitest-environment node
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { MembersPage } from "../../frontend/pages/admin/members-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("member access confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const initial = [{ id: "m1", email: "target@example.test", role: "contributor", status: "active" }];
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/admin/members" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(props: Partial<React.ComponentProps<typeof MembersPage>> = {}) {
    await act(async () => root.render(<MembersPage locale={locale} members={initial} {...props} />));
  }
  async function click(selector: string) {
    const button = container.querySelector(selector) as HTMLButtonElement;
    expect(button, selector).not.toBeNull(); await act(async () => button.click()); return button;
  }
  it.each(["cancel", "confirm"])("blocks shared navigation and unload until the member action is %s", async (outcome) => {
    const update = vi.fn(); await mount({ onStatusChange: update });
    await click('button[aria-label]');
    await act(async () => writeWorkspaceHistory("push", "/home"));
    expect(browser.location.pathname).toBe("/admin/members");
    expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await click(outcome === "cancel" ? '[data-cancel-action]' : '[data-confirm-action]');
    expect(update).toHaveBeenCalledTimes(outcome === "cancel" ? 0 : 1);
    const clean = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await act(async () => writeWorkspaceHistory("push", "/home"));
    expect(browser.location.pathname).toBe("/home");
  });
  it("guards same-batch action admission and cleans up the guard on unmount", async () => {
    const update = vi.fn(); await mount({ onStatusChange: update });
    await act(async () => { (container.querySelector('button[aria-label]') as HTMLButtonElement).click(); writeWorkspaceHistory("push", "/home"); });
    expect(browser.location.pathname).toBe("/admin/members");
    const oldConfirm = container.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await act(async () => root.render(<div>Signed out</div>));
    await act(async () => oldConfirm.click()); expect(update).not.toHaveBeenCalled();
    await act(async () => writeWorkspaceHistory("push", "/home")); expect(browser.location.pathname).toBe("/home");
  });
  it.each(["active", "disabled"])("requires explicit confirmation for %s member access", async (status) => {
    const update = vi.fn(); await mount({ members: [{ ...initial[0]!, status }], onStatusChange: update });
    const trigger = container.querySelector('button[aria-label]') as HTMLButtonElement; trigger.focus();
    await act(async () => trigger.click());
    expect(update).not.toHaveBeenCalled();
    const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("target@example.test");
    expect(dialog?.textContent).toContain(status === "active" ? "prevent" : "allow");
    expect(browser.document.activeElement?.textContent).toBe("Cancel");
    expect(container.querySelector('section')?.hasAttribute('inert')).toBe(true);
    const confirm = dialog!.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await act(async () => { confirm.click(); confirm.click(); });
    expect(update).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledWith("m1", status === "active" ? "disabled" : "active");
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it.each(["cancel", "escape"])("%s makes no write and restores trigger focus", async (action) => {
    const update = vi.fn(); await mount({ onStatusChange: update });
    const trigger = container.querySelector('button[aria-label]') as HTMLButtonElement; trigger.focus();
    await act(async () => trigger.click());
    const dialog = container.querySelector('[role="alertdialog"]')!; expect(dialog).not.toBeNull();
    if (action === "cancel") await click('[data-cancel-action]');
    else await act(async () => dialog.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect(update).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(browser.document.activeElement).toBe(trigger);
  });
  it.each(["replacement", "pending", "row pending", "forbidden", "loading", "filter"])("invalidates a confirmation after %s changes", async (change) => {
    const update = vi.fn(); await mount({ onStatusChange: update }); await click('button[aria-label]');
    const oldConfirm = container.querySelector('[data-confirm-action]') as HTMLButtonElement; expect(oldConfirm).not.toBeNull();
    const props = change === "replacement" ? { members: initial.map(item => ({ ...item })) }
      : change === "pending" ? { pending: true } : change === "row pending" ? { pendingIds: ["m1"] }
      : change === "forbidden" ? { forbidden: true, error: "Denied" } : change === "loading" ? { loading: true }
      : { status: "active" as const };
    await mount({ onStatusChange: update, ...props });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => oldConfirm.click()); expect(update).not.toHaveBeenCalled();
    await mount({ onStatusChange: update }); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("keeps Tab inside the confirmation and renders Chinese impact text", async () => {
    await mount({ locale: createLocaleRuntime({ navigatorLanguage: "zh-CN" }), onStatusChange: vi.fn() });
    await click('button[aria-label]'); const dialog = container.querySelector('[role="alertdialog"]')!; expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("取消"); expect(dialog.textContent).toContain("访问");
    const key = async (shiftKey: boolean) => act(async () => dialog.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true }) as unknown as Event));
    await key(true); expect(browser.document.activeElement?.hasAttribute('data-confirm-action')).toBe(true);
    await key(false); expect(browser.document.activeElement?.hasAttribute('data-cancel-action')).toBe(true);
  });
  it("does not offer changes for administrators or unavailable status", async () => {
    await mount({ members: [{ ...initial[0]!, role: "admin" }, { ...initial[0]!, id: "m2", status: undefined }], onStatusChange: vi.fn() });
    expect(container.querySelector('button[aria-label]')).toBeNull();
  });
});
