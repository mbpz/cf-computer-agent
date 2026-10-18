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
// The DOM must load after the vm mock is installed.
const { Window } = await import("happy-dom");

const PASSWORD = "correct horse battery staple";

describe("password login page", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/login" });
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
  async function submit() {
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
  }
  function toggle() { return container.querySelector("[data-login-mode-toggle]") as HTMLButtonElement; }

  it("logs in with the exact email and password", async () => {
    const login = vi.fn().mockResolvedValue({ id: "m1", email: "new@example.test", role: "contributor" });
    const navigate = vi.fn();
    await act(async () => root.render(<LoginPage locale={locale} login={login} navigate={navigate} />));
    await act(async () => setValue("#login-email", " New@Example.test "));
    await act(async () => setValue("#login-password", PASSWORD));
    await submit();
    expect(login).toHaveBeenCalledWith("New@Example.test", PASSWORD);
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("switches to registration, validates confirmation and enters the workspace", async () => {
    const register = vi.fn().mockResolvedValue({ id: "m2", email: "new@example.test", role: "contributor" });
    const navigate = vi.fn();
    await act(async () => root.render(<LoginPage locale={locale} register={register} navigate={navigate} />));
    await act(async () => toggle().click());
    expect(container.querySelector("#login-password-confirm")).toBeTruthy();
    await act(async () => setValue("#login-email", "new@example.test"));
    await act(async () => setValue("#login-password", PASSWORD));
    await act(async () => setValue("#login-password-confirm", "different password value"));
    await submit();
    expect(register).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Passwords do not match.");
    await act(async () => setValue("#login-password-confirm", PASSWORD));
    await submit();
    expect(register).toHaveBeenCalledWith("new@example.test", PASSWORD);
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("resets a forgotten password with a new password only", async () => {
    const reset = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(<LoginPage locale={locale} reset={reset} navigate={vi.fn()} />));
    await act(async () => (container.querySelector("[data-login-forgot]") as HTMLButtonElement).click());
    expect(container.textContent).toContain("Reset your password");
    expect(container.querySelector("#login-recovery-code")).toBeNull();
    await act(async () => setValue("#login-email", "new@example.test"));
    await act(async () => setValue("#login-password", "another password value"));
    await act(async () => setValue("#login-password-confirm", "another password value"));
    await submit();
    expect(reset).toHaveBeenCalledWith("new@example.test", "another password value");
    expect(container.textContent).toContain("Password reset. Sign in with your new password.");
    expect(container.textContent).toContain("Sign in with email");
  });

  it("rejects a short password before calling the server", async () => {
    const register = vi.fn();
    await act(async () => root.render(<LoginPage locale={locale} register={register} navigate={vi.fn()} />));
    await act(async () => toggle().click());
    await act(async () => setValue("#login-email", "new@example.test"));
    await act(async () => setValue("#login-password", "short"));
    await act(async () => setValue("#login-password-confirm", "short"));
    await submit();
    expect(register).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Use a password of 12-128 characters.");
  });

  it("maps rejected, locked, taken and rate-limited failures", async () => {
    const cases: Array<[ApiRequestError, string]> = [
      [new ApiRequestError("PASSWORD_LOGIN_INVALID", "", 401, false), "Email or password is incorrect."],
      [new ApiRequestError("PASSWORD_LOGIN_LOCKED", "", 429, true), "Too many attempts. Try again in 15 minutes."],
      [new ApiRequestError("MEMBER_DISABLED", "", 403, false), "This account is disabled. Contact an administrator."],
    ];
    for (const [failure, text] of cases) {
      await act(async () => root.render(<LoginPage locale={locale} login={vi.fn().mockRejectedValue(failure)} navigate={vi.fn()} />));
      await act(async () => setValue("#login-email", "new@example.test"));
      await act(async () => setValue("#login-password", PASSWORD));
      await submit();
      expect(container.textContent, failure.code).toContain(text);
    }

    await act(async () => root.unmount());
    root = (await import("react-dom/client")).createRoot(container);
    for (const [failure, text] of [
      [new ApiRequestError("REGISTRATION_EMAIL_TAKEN", "", 409, false), "This email already has an account. Sign in instead."],
      [new ApiRequestError("REGISTRATION_RATE_LIMITED", "", 429, true), "Too many registration attempts. Try again later."],
    ] as const) {
      await act(async () => root.render(<LoginPage locale={locale} register={vi.fn().mockRejectedValue(failure)} navigate={vi.fn()} />));
      await act(async () => toggle().click());
      await act(async () => setValue("#login-email", "new@example.test"));
      await act(async () => setValue("#login-password", PASSWORD));
      await act(async () => setValue("#login-password-confirm", PASSWORD));
      await submit();
      expect(container.textContent, failure.code).toContain(text);
      await act(async () => root.unmount());
      root = (await import("react-dom/client")).createRoot(container);
    }
  });

  it("hides GitHub when unavailable but keeps the password form", async () => {
    await act(async () => root.render(<LoginPage locale={locale} githubEnabled={false} navigate={vi.fn()} />));
    expect(container.textContent).not.toContain("Continue with GitHub");
    expect(container.textContent).toContain("GitHub sign-in is not configured");
    expect(container.querySelector("#login-password")).toBeTruthy();
  });
});
