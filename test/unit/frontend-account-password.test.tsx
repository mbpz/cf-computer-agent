// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../frontend/lib/api";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { ChangePasswordCard } from "../../frontend/components/settings/change-password-card";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("settings password card", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/settings" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function mount(changePassword = vi.fn().mockResolvedValue(undefined)) {
    await act(async () => root.render(<ChangePasswordCard locale={locale} changePassword={changePassword} />));
    return changePassword;
  }
  async function settle(work?: () => void) {
    await act(async () => { work?.(); const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 0); await promise; for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
  }
  function input(selector: string): HTMLInputElement {
    const element = container.querySelector(selector);
    expect(element, selector).toBeTruthy();
    return element as HTMLInputElement;
  }
  async function type(selector: string, value: string) {
    const control = input(selector);
    await act(async () => {
      control.value = value;
      const reactPropsKey = Object.keys(control).find((key) => key.startsWith("__reactProps$"));
      const reactProps = reactPropsKey ? (control as unknown as Record<string, { onChange?: (event: { currentTarget: HTMLInputElement; target: HTMLInputElement }) => void }>)[reactPropsKey] : undefined;
      reactProps?.onChange?.({ currentTarget: control, target: control });
    });
  }
  async function submit() {
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
  }

  it("changes an existing password with the current password and confirms success", async () => {
    const changePassword = await mount();
    await type("#settings-current-password", "old correct horse");
    await type("#settings-new-password", "new correct horse");
    await type("#settings-confirm-password", "new correct horse");
    await submit();
    await settle();
    expect(changePassword).toHaveBeenCalledWith("old correct horse", "new correct horse");
    expect(container.querySelector('[data-settings-password-status="changed"]')?.textContent).toContain("Password changed");
    expect(input("#settings-current-password").value).toBe("");
  });

  it("sets a first password without a current password", async () => {
    const changePassword = await mount();
    await type("#settings-new-password", "first correct horse");
    await type("#settings-confirm-password", "first correct horse");
    await submit();
    await settle();
    expect(changePassword).toHaveBeenCalledWith("", "first correct horse");
  });

  it("rejects a weak or mismatched new password before any write", async () => {
    const changePassword = await mount();
    await type("#settings-new-password", "short");
    await type("#settings-confirm-password", "short");
    await submit();
    await settle();
    expect(changePassword).not.toHaveBeenCalled();
    expect(container.querySelector("[data-settings-password-error]")?.textContent).toContain("12–128");
    await type("#settings-new-password", "new correct horse");
    await type("#settings-confirm-password", "different horse");
    await submit();
    await settle();
    expect(changePassword).not.toHaveBeenCalled();
    expect(container.querySelector("[data-settings-password-error]")?.textContent).toContain("do not match");
  });

  it("maps a rejected current password to a visible in-place error", async () => {
    const changePassword = vi.fn().mockRejectedValue(new ApiRequestError("PASSWORD_CHANGE_INVALID", "Current password is invalid", 401, false));
    await mount(changePassword);
    await type("#settings-current-password", "wrong");
    await type("#settings-new-password", "new correct horse");
    await type("#settings-confirm-password", "new correct horse");
    await submit();
    await settle();
    expect(container.querySelector("[data-settings-password-error]")?.textContent).toContain("current password is incorrect");
  });
});
