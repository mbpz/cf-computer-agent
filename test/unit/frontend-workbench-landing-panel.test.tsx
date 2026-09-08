// @vitest-environment node
import { act, useReducer } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { PublicWorkbenchPage } from "../../frontend/pages/workbench-landing/public-workbench-page";
import { WorkbenchFeaturePanel } from "../../frontend/pages/workbench-landing/workbench-feature-panel";
import { demoReducer, initialDemoState } from "../../frontend/pages/workbench-landing/workbench-demo-state";

// Match the repository's Happy DOM adapter for the Workers test pool.
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");
let browser: InstanceType<typeof Window>;
let root: Root;
let host: HTMLDivElement;
const locale = createLocaleRuntime({ navigatorLanguage: "en" });
function Harness() {
  const [state, dispatch] = useReducer(demoReducer, undefined, initialDemoState);
  return <><button data-trigger onClick={() => dispatch({ type: "open", feature: "answer" })}>Ask with sources</button>
    <WorkbenchFeaturePanel locale={locale} state={state} dispatch={dispatch} /></>;
}
beforeEach(() => {
  browser = new Window({ url: "https://app.test/" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "KeyboardEvent", "MutationObserver", "IntersectionObserver"] as const) {
    vi.stubGlobal(key, key === "window" ? browser : browser[key]);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(async () => {
  act(() => root.unmount());
  expect(document.body.style.overflow).not.toBe("hidden");
  host.remove();
  await browser.happyDOM.close();
  vi.unstubAllGlobals();
});
function click(selector: string) {
  const button = host.querySelector<HTMLElement>(selector);
  expect(button, selector).not.toBeNull();
  act(() => { button!.focus(); button!.click(); });
}
function key(value: string, shiftKey = false) {
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true })));
}
const action = (name: string) => `[data-demo-action="${name}"]`;

describe("knowledge feature modal", () => {
  it("exposes one labelled, described modal and focuses inside it", () => {
    click("[data-trigger]");
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(host.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toContain("sources");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toContain("No live AI");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
  it("closes via its explicit close button", () => {
    click("[data-trigger]"); click(action("close"));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("closes on Escape", () => {
    click("[data-trigger]"); key("Escape");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("closes when the overlay itself is clicked", () => {
    click("[data-trigger]"); click("[data-landing-overlay]");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("does not close on an internal click", () => {
    click("[data-trigger]"); click('[role="dialog"] h2');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it("loops Tab and Shift+Tab inside the modal", () => {
    click("[data-trigger]");
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button:not([disabled])'));
    act(() => buttons.at(-1)!.focus()); key("Tab");
    expect(document.activeElement).toBe(buttons[0]);
    key("Tab", true);
    expect(document.activeElement).toBe(buttons.at(-1));
  });
  it("returns focus to the feature trigger", () => {
    click("[data-trigger]"); click(action("close"));
    expect(document.activeElement).toBe(host.querySelector("[data-trigger]"));
  });
  it.each([
    ["next", "close", "library"],
    ["next", "Escape", "library"],
    ["replay", "close", "capture"],
    ["replay", "Escape", "capture"],
  ])("restores page focus after its %s trigger unmounts and the panel closes via %s", (entry, dismissal, feature) => {
    act(() => root.render(<PublicWorkbenchPage locale={locale} />));
    click(action("start"));
    click(action("capture"));
    click(action("close"));
    const trigger = host.querySelector<HTMLButtonElement>(action(entry))!;
    click(action(entry));
    expect(trigger.isConnected).toBe(false);
    expect(host.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);

    if (dismissal === "Escape") key("Escape");
    else click(action("close"));

    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector(`[data-feature="${feature}"]`));
  });
  it("restores the previous body overflow after closing and unmounting", () => {
    document.body.style.overflow = "clip";
    click("[data-trigger]");
    expect(document.body.style.overflow).toBe("hidden");
    key("Escape");
    expect(document.body.style.overflow).toBe("clip");
    click("[data-trigger]");
    act(() => root.render(null));
    expect(document.body.style.overflow).toBe("clip");
  });
  it("keeps focus stable when showing the answer, then focuses cited context and returns to that citation", () => {
    click("[data-trigger]"); click(action("show-answer"));
    expect(document.activeElement).toBe(host.querySelector(action("show-answer")));
    click('[data-citation-id="cite-review"]');
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.activeElement).toBe(host.querySelector("[data-citation-heading]"));
    expect(host.querySelector('[data-source-id="weekly-review"] [data-paragraph-id="p2"]')?.textContent).toContain("manually create a to-do");
    click(action("citation-back"));
    expect(document.activeElement).toBe(host.querySelector('[data-citation-id="cite-review"]'));
    key("Escape");
    expect(document.activeElement).toBe(host.querySelector("[data-trigger]"));
  });
});
