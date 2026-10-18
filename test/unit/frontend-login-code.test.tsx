// @vitest-environment node
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../frontend/lib/api";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { LoginPage } from "../../frontend/pages/login-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// Static happy-dom imports are hoisted above the vm factory and fail on the
// class reference; the DOM must load after the mock is installed.
const { Window } = await import("happy-dom");

describe("email code login", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/login" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = (await import("react-dom/client")).createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  function setValue(selector: string, value: string) {
    const input = container.querySelector(selector) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new browser.Event("input", { bubbles: true }));
  }
  async function submitForm() {
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
  }
  async function requestCode(email = "new@example.test") {
    await act(async () => setValue("#login-email", email));
    await submitForm();
  }
  function otpInput() { return container.querySelector("[data-otp-input] input") as HTMLInputElement; }
  async function typeCode(value: string) {
    for (const key of value) {
      await act(async () => {
        otpInput().dispatchEvent(new browser.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    }
  }
  function buttonByText(text: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === text) as HTMLButtonElement | undefined; }

  it("keeps GitHub and posts the exact request-code body before showing the OTP field", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const submit = vi.fn();
    await act(async () => root.render(<LoginPage locale={locale} requestCode={request} submit={submit} navigate={vi.fn()} />));
    expect(container.textContent).toContain("Continue with GitHub");
    expect(container.textContent).toContain("Sign in with your email");
    expect(otpInput()).toBeNull();
    await requestCode(" New@Example.test ");
    expect(request).toHaveBeenCalledWith("New@Example.test");
    expect(container.textContent).toContain("If that address can sign in, a code is on its way.");
    expect(container.textContent).toContain("new@example.test".replace("new@example.test", "New@Example.test"));
    expect(otpInput()).toBeTruthy();
  });

  it("types six digits, auto-submits the exact code and navigates home", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const submit = vi.fn().mockResolvedValue({ id: "m2", email: "new@example.test", role: "contributor" });
    const navigate = vi.fn();
    await act(async () => root.render(<LoginPage locale={locale} requestCode={request} submit={submit} navigate={navigate} />));
    await requestCode();
    await typeCode("123456");
    expect(submit).toHaveBeenCalledWith("new@example.test", "123456");
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("shows one generic message for a rejected code and allows a retry", async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new ApiRequestError("EMAIL_LOGIN_INVALID", "invalid", 401, false))
      .mockResolvedValueOnce({ id: "m2", email: "new@example.test", role: "contributor" });
    const navigate = vi.fn();
    await act(async () => root.render(<LoginPage locale={locale} requestCode={vi.fn().mockResolvedValue(undefined)} submit={submit} navigate={navigate} />));
    await requestCode();
    await typeCode("111111");
    expect(container.textContent).toContain("That code is not valid. Request a new one if it has expired.");
    expect(container.textContent).not.toContain("expired code");
    await typeCode("222222");
    await submitForm();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("distinguishes a disabled account and an unavailable email provider", async () => {
    const disabled = vi.fn().mockRejectedValue(new ApiRequestError("MEMBER_DISABLED", "disabled", 403, false));
    await act(async () => root.render(<LoginPage locale={locale} requestCode={vi.fn().mockResolvedValue(undefined)} submit={disabled} navigate={vi.fn()} />));
    await requestCode();
    await typeCode("123456");
    expect(container.textContent).toContain("This account is disabled. Contact an administrator.");

    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client");
    root = (await import("react-dom/client")).createRoot(container);
    const unavailable = vi.fn().mockRejectedValue(new ApiRequestError("EMAIL_LOGIN_UNAVAILABLE", "off", 503, false));
    await act(async () => root.render(<LoginPage locale={locale} requestCode={unavailable} navigate={vi.fn()} />));
    await requestCode();
    expect(container.textContent).toContain("Email sign-in is not configured for this workspace.");
    expect(otpInput()).toBeNull();
  });

  it("shows the delivery failure returned by a configured but failing provider", async () => {
    const request = vi.fn().mockRejectedValue(new ApiRequestError("EMAIL_LOGIN_DELIVERY_FAILED", "down", 503, true));
    await act(async () => root.render(<LoginPage locale={locale} requestCode={request} navigate={vi.fn()} />));
    await requestCode();
    expect(container.textContent).toContain("The code could not be sent. Try again in a moment.");
    expect(otpInput()).toBeNull();
  });

  it("starts the resend countdown and returns to the email step", async () => {
    await act(async () => root.render(<LoginPage locale={locale} requestCode={vi.fn().mockResolvedValue(undefined)} navigate={vi.fn()} />));
    await requestCode();
    const resend = buttonByText("Resend in 60s");
    expect(resend?.disabled).toBe(true);
    const change = buttonByText("Use a different email");
    await act(async () => change!.click());
    expect(container.querySelector("#login-email")).toBeTruthy();
    expect(otpInput()).toBeNull();
  });

  it("hides the email form when the provider is not configured", async () => {
    await act(async () => root.render(<LoginPage locale={locale} emailCodeEnabled={false} navigate={vi.fn()} />));
    expect(container.textContent).toContain("Email sign-in is not configured for this workspace.");
    expect(container.querySelector("#login-email")).toBeNull();
  });

  it("keeps the GitHub button when email login is hidden", async () => {
    await act(async () => root.render(<LoginPage locale={locale} githubEnabled={false} emailCodeEnabled={false} navigate={vi.fn()} />));
    expect(container.textContent).not.toContain("Continue with GitHub");
    expect(container.textContent).toContain("GitHub sign-in is not configured");
  });
});
