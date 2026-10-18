// @vitest-environment node
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { PublicWorkbenchPage } from "../../frontend/pages/workbench-landing/public-workbench-page";
import * as scene from "../../frontend/pages/workbench-landing/workbench-scene";

// The existing Workers test pool does not expose node:vm constructors.
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");
let browser: InstanceType<typeof Window>;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  browser = new Window({ url: "https://app.test/" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "KeyboardEvent", "MutationObserver", "IntersectionObserver"] as const) {
    vi.stubGlobal(key, key === "window" ? browser : browser[key]);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await browser.happyDOM.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function click(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  act(() => { button!.focus(); button!.click(); });
}
// The locale switcher is a custom listbox: open the trigger, then choose the
// option whose row label matches. Options stay mounted while closed, so the
// `aria-expanded` check keeps the choice a real interaction.
function chooseLocale(label: string) {
  const trigger = host.querySelector<HTMLButtonElement>(".workbench-locale");
  expect(trigger, ".workbench-locale").not.toBeNull();
  expect(trigger!.getAttribute("aria-expanded")).toBe("false");
  click(".workbench-locale");
  expect(trigger!.getAttribute("aria-expanded")).toBe("true");
  const option = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    .find(node => node.textContent?.includes(label));
  expect(option, label).not.toBeNull();
  act(() => { option!.focus(); option!.click(); });
  expect(host.querySelector(".workbench-locale")?.textContent).toContain(label);
}
const action = (name: string) => `button[data-demo-action="${name}"]`;

describe("public knowledge studio", () => {
  it("sends a new scene cycle only for start and replay, not feature navigation or pause", () => {
    let snapshot: { cycleId?: number; feature: unknown; captured: boolean } | undefined;
    // The page only offers its pause control and angle rail for a live scene.
    vi.spyOn(scene, "WorkbenchScene").mockImplementation(props => {
      snapshot = props.snapshot;
      useEffect(() => { props.onStatus?.("ready"); }, []);
      return null;
    });
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    expect(snapshot?.cycleId).toBe(0);
    click('button[data-feature="library"]');
    click(action("close"));
    expect(snapshot?.cycleId).toBe(0);
    click(action("start"));
    expect(snapshot).toMatchObject({ cycleId: 1, feature: "capture", captured: false });
    click(action("capture"));
    click(action("close"));
    click(action("pause"));
    expect(snapshot).toMatchObject({ cycleId: 1, captured: true });
    click(action("replay"));
    expect(snapshot).toMatchObject({ cycleId: 2, feature: "capture", captured: false });
    click(action("close"));
    click(action("start"));
    expect(snapshot?.cycleId).toBe(3);
  });
  it("applies the existing saved theme without adding demo storage", () => {
    browser.localStorage.setItem("memory-garden-theme", "dark");
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(browser.localStorage.length).toBe(1);
  });

  it("follows system theme changes when there is no saved preference", () => {
    let matches = true;
    let change: (() => void) | undefined;
    const removeEventListener = vi.fn();
    vi.spyOn(browser, "matchMedia").mockImplementation((query: string) => ({
      get matches() { return query.includes("color-scheme") && matches; },
      addEventListener: (_: string, listener: () => void) => { if (query.includes("color-scheme")) change = listener; },
      removeEventListener,
    }) as unknown as MediaQueryList);
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    act(() => { matches = false; change?.(); });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(browser.localStorage.length).toBe(0);
  });
  it("exposes a controlled pause toggle alongside a live scene", () => {
    vi.spyOn(scene, "WorkbenchScene").mockImplementation(props => {
      useEffect(() => { props.onStatus?.("ready"); }, []);
      return null;
    });
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    expect(host.querySelector('[data-demo-action="pause"]')?.getAttribute("aria-pressed")).toBe("false");
    click(action("pause"));
    expect(host.querySelector('[data-demo-action="pause"]')?.getAttribute("aria-pressed")).toBe("true");
    click(action("pause"));
    expect(host.querySelector('[data-demo-action="pause"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("offers no pause control or angle rail until the scene reports itself live", () => {
    vi.spyOn(scene, "WorkbenchScene").mockImplementation(() => null);
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    expect(host.querySelector('[data-demo-action="pause"]')).toBeNull();
    expect(host.querySelector('.workbench-views [role="tab"]')).toBeNull();
    expect(host.querySelector(".workbench-scene-controls")).toBeNull();

    let report: ((value: "ready") => void) | undefined;
    vi.spyOn(scene, "WorkbenchScene").mockImplementation(props => {
      report = props.onStatus as ((value: "ready") => void) | undefined;
      return null;
    });
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    act(() => report?.("ready"));
    expect(host.querySelector('[data-demo-action="pause"]')).not.toBeNull();
    const tab = host.querySelector<HTMLButtonElement>('.workbench-views [role="tab"]');
    expect(tab).not.toBeNull();
    expect(tab!.getAttribute("aria-selected")).not.toBeNull();
  });
  it("renders an honest Chinese static demo and the two-method sign-in entry without canvas", () => {
    const html = renderToStaticMarkup(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })} />);
    expect(html).toContain("示例演示 · 不读取你的个人数据");
    expect(html).toContain("体验知识之旅");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('href="/auth/github"');
    expect(html).toContain("使用邮箱和密码创建账户");
    expect(html).toContain("<picture ");
    expect(html).not.toContain("<canvas");
  });

  it("routes every landing sign-in entry to the login page without a GitHub short-circuit", () => {
    const html = renderToStaticMarkup(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />);
    expect(html).toContain("Log in to your workbench");
    expect(html.match(/href="\/login"/g)).toHaveLength(2);
    expect(html).not.toContain("/auth/github");
  });

  it("completes and replays the gated HTML journey without fetching or storing demo data", () => {
    const fetch = vi.fn(() => { throw new Error("No demo network calls allowed"); });
    vi.stubGlobal("fetch", fetch);
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    click(action("start"));
    expect(host.querySelector<HTMLButtonElement>(action("next"))!.disabled).toBe(true);
    click(action("capture"));
    click(action("next"));
    expect(host.querySelector('[data-demo-step="library"]')).not.toBeNull();
    click(action("open-source"));
    expect(host.textContent).toContain("Keep the original source with each item.");
    click(action("next"));
    click(action("show-answer"));
    click('button[data-citation-id="cite-filing"]');
    expect(host.querySelector('[data-source-id="filing-guide"] [data-paragraph-id="p2"]')?.textContent).toContain("Keep the original source");
    click(action("citation-back"));
    click(action("next"));
    expect(host.querySelector<HTMLButtonElement>(action("next"))!.disabled).toBe(true);
    click(action("complete-task"));
    expect(host.textContent).toContain("Done in this demo");
    click(action("next"));
    expect(host.querySelector('[data-demo-step="complete"]')).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    click(action("replay"));
    expect(host.querySelector('[data-demo-step="capture"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>(action("next"))!.disabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(browser.localStorage.length).toBe(0);
    expect(browser.sessionStorage.length).toBe(0);
  });

  it("switches the locale listbox and preserves guided progress", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    act(() => root.render(<PublicWorkbenchPage locale={locale} />));
    click(action("start"));
    click(action("capture"));
    click(action("close"));
    chooseLocale("简体中文");
    expect(host.querySelector("main")?.lang).toBe("zh-CN");
    expect(host.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')?.textContent).toContain("简体中文");
    expect(host.querySelector('[data-demo-step="capture"]')).not.toBeNull();
    expect(host.textContent).toContain("已在本地收集示例资料");
    click(action("next"));
    expect(host.querySelector('[data-demo-step="library"]')).not.toBeNull();
  });

  it.each(["capture", "library", "answer", "action", "updates"])("opens the real %s feature button without advancing the guided journey", feature => {
    act(() => root.render(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    expect(document.body.style.overflow).toBe("");
    const selector = `button[data-feature="${feature}"]`;
    click(selector);
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.body.style.overflow).toBe("hidden");
    expect(host.querySelector("main > div")?.hasAttribute("inert")).toBe(true);
    expect(host.querySelector('[data-demo-step="overview"]')).not.toBeNull();
    expect(host.querySelector(action("next"))).toBeNull();
    if (feature === "answer") {
      click(action("show-answer"));
      click('button[data-citation-id="cite-filing"]');
      expect(host.querySelector('[data-source-id="filing-guide"] [data-cited]')?.textContent).toContain("Keep the original source");
    }
    click(action("close"));
    expect(document.activeElement).toBe(host.querySelector(selector));
    expect(host.querySelector("main > div")?.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("sets the document language from a stored non-default locale when the landing mounts", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en", storedLocale: "zh-CN" });
    act(() => root.render(<PublicWorkbenchPage locale={locale} />));
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(host.querySelector("main")?.lang).toBe("zh-CN");
    expect(locale.locale).toBe("zh-CN");
  });

  it("updates the document language when the landing language selector switches locale", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    act(() => root.render(<PublicWorkbenchPage locale={locale} />));
    expect(document.documentElement.lang).toBe("en");
    chooseLocale("简体中文");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(locale.locale).toBe("zh-CN");
    chooseLocale("English");
    expect(document.documentElement.lang).toBe("en");
  });

});
