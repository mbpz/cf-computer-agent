// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../frontend/lib/api";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { LoginPage } from "../../frontend/pages/login-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("login code form", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  function setValue(selector: string, value: string) {
    const input = container.querySelector(selector) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new browser.Event("input", { bubbles: true }));
  }
  function submitButton() { return container.querySelector('button[type="submit"]') as HTMLButtonElement; }
  async function fill(email: string, code: string) {
    await act(async () => setValue("#login-code-email", email));
    await act(async () => setValue("#login-code-code", code));
  }
  async function submitForm() {
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
  }

  it("keeps the GitHub button and posts the exact contract body", async () => {
    const submit = vi.fn().mockResolvedValue({ id: "m2", email: "new@example.test", role: "contributor" });
    const navigate = vi.fn();
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    await act(async () => root.render(<LoginPage locale={locale} submit={submit} navigate={navigate} />));
    expect(container.textContent).toContain("Continue with GitHub");
    expect(submitButton().disabled).toBe(true);
    await fill("new@example.test", "CODE-1234");
    await submitForm();
    expect(submit).toHaveBeenCalledWith("new@example.test", "CODE-1234");
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("shows one generic message for a 401 verification failure", async () => {
    const submit = vi.fn().mockRejectedValue(new ApiRequestError("CODE_LOGIN_INVALID", "invalid", 401, false));
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    await act(async () => root.render(<LoginPage locale={locale} submit={submit} navigate={vi.fn()} />));
    await fill("new@example.test", "WRONG");
    await submitForm();
    expect(container.textContent).toContain("That email and code combination was not accepted.");
    expect(container.textContent).not.toContain("expired");
  });

  it("shows a distinct message for a malformed request", async () => {
    const submit = vi.fn().mockRejectedValue(new ApiRequestError("CODE_LOGIN_REQUEST_INVALID", "invalid input", 400, false));
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    await act(async () => root.render(<LoginPage locale={locale} submit={submit} navigate={vi.fn()} />));
    await fill("new@example.test", "x");
    await submitForm();
    expect(container.textContent).toContain("Enter both your email and the one-time code.");
  });

  it("hides the GitHub button when GitHub sign-in is unavailable but keeps the code form", async () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    await act(async () => root.render(<LoginPage locale={locale} githubEnabled={false} submit={vi.fn()} />));
    expect(container.textContent).not.toContain("Continue with GitHub");
    expect(container.textContent).toContain("Sign in with code");
  });
});
