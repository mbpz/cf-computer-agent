// @vitest-environment node
import React, { act } from "react";
import { chooseOption } from "./helpers/listbox";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsPage } from "../../frontend/pages/settings-page";
import { createLocaleRuntime, LOCALE_STORAGE_KEY, type LocaleRuntime } from "../../frontend/lib/i18n";
import { THEME_STORAGE_KEY } from "../../frontend/lib/theme";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("settings page", () => {
  it("renders account and appearance controls without undefined values", () => {
    const html = renderToStaticMarkup(<SettingsPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} email="admin@example.com" role="admin" />);
    expect(html).toContain("Settings");
    expect(html).toContain("admin@example.com");
    expect(html).toContain("Appearance");
    expect(html).not.toContain("undefined");
  });

  it("opens with one titled h1 above the preference cards", () => {
    const html = renderToStaticMarkup(<SettingsPage locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })} email="admin@example.com" role="contributor" />);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<h1[^>]*>设置<\/h1>/u);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("管理工作区偏好设置。"));
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf(">账号<"));
    // The language preference keeps its historical accessible name, and the picker
    // is beUI's listbox trigger rather than a native select.
    expect(html).toContain('class="sr-only">语言</span>');
    expect(html).not.toContain("<select");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-label="语言"');
  });
});

describe("settings persistence boundary", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let language: LocaleRuntime;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/settings" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    // Deferred: react-dom/client must load after the node:vm mocks above.
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    language = createLocaleRuntime({ navigatorLanguage: "en" });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function mount() { await act(async () => root.render(<SettingsPage locale={language} email="admin@example.com" role="admin" />)); await flush(); }
  function button(label: string) { const found = [...container.querySelectorAll("button")].find((item) => item.textContent === label); expect(found, label).toBeTruthy(); return found as HTMLButtonElement; }
  const save = () => container.querySelector<HTMLElement>("[data-settings-save]")!;

  it("shows pending, then the persisted result, for a theme choice", async () => {
    await mount();
    expect(save().getAttribute("data-settings-save")).toBe("idle");
    act(() => button("Dark").click());
    // The write has not settled yet, so the page reports pending rather than saved.
    expect(save().getAttribute("data-settings-save")).toBe("saving");
    expect(save().getAttribute("data-settings-save-preference")).toBe("theme");
    await flush();
    expect(save().getAttribute("data-settings-save")).toBe("saved");
    expect(browser.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(button("Dark").getAttribute("aria-pressed")).toBe("true");
  });

  it("reports an unsaved theme honestly and recovers on retry", async () => {
    const blocked = vi.spyOn(browser.localStorage, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    await mount();
    await act(async () => button("Dark").click()); await flush();
    expect(save().getAttribute("data-settings-save")).toBe("failed");
    expect(save().getAttribute("data-settings-save-preference")).toBe("theme");
    expect(save().textContent).toContain("could not be saved");
    expect(browser.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    blocked.mockRestore();
    await act(async () => button("Try again").click()); await flush();
    expect(save().getAttribute("data-settings-save")).toBe("saved");
    expect(browser.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("keeps the language failure recoverable without claiming it was saved", async () => {
    const blocked = vi.spyOn(browser.localStorage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await mount();
    await chooseOption(container.querySelector('[aria-haspopup="listbox"]'), "简体中文"); await flush();
    expect(save().getAttribute("data-settings-save")).toBe("failed");
    expect(save().getAttribute("data-settings-save-preference")).toBe("language");
    expect(language.locale).toBe("zh-CN");
    expect(browser.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    blocked.mockRestore();
    await act(async () => button("重试").click()); await flush();
    expect(save().getAttribute("data-settings-save")).toBe("saved");
    expect(browser.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
  });
});

async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
