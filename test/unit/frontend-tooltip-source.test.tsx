// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../frontend/components/ui/tooltip";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }));
const { Window } = await import("happy-dom");

describe("tooltip adapter over beUI's installed source", () => {
  let browser: InstanceType<typeof Window>, host: HTMLElement, root: Root;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/" });
    for (const [key, value] of Object.entries({
      window: browser,
      document: browser.document,
      navigator: browser.navigator,
      HTMLElement: browser.HTMLElement,
      Element: browser.Element,
      Node: browser.Node,
      Event: browser.Event,
      CustomEvent: browser.CustomEvent,
      KeyboardEvent: browser.KeyboardEvent,
      PointerEvent: browser.PointerEvent,
      MouseEvent: browser.MouseEvent,
      FocusEvent: browser.FocusEvent,
      ResizeObserver: browser.ResizeObserver,
      MutationObserver: browser.MutationObserver,
      getComputedStyle: browser.getComputedStyle.bind(browser),
      IS_REACT_ACT_ENVIRONMENT: true,
    })) vi.stubGlobal(key, value);
    host = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(host as unknown as Node);
    root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

  it("reports the trigger as closed until the tooltip opens", async () => {
    await act(async () => root.render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger aria-label="Expand sidebar">Expand</TooltipTrigger>
          <TooltipContent>Expand sidebar</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    ));
    const trigger = host.querySelector("button")!;
    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(trigger.getAttribute("aria-describedby")).toBeNull();
    expect(browser.document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("describes the trigger and renders one labelled tooltip surface when open", async () => {
    await act(async () => root.render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger aria-label="Expand sidebar">Expand</TooltipTrigger>
          <TooltipContent>Expand sidebar</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    ));
    const trigger = host.querySelector("button")!;
    expect(trigger.getAttribute("data-state")).toBe("open");
    const surface = browser.document.querySelector('[role="tooltip"]')!;
    expect(surface).not.toBeNull();
    expect(surface.textContent).toBe("Expand sidebar");
    expect(trigger.getAttribute("aria-describedby")).toBe(surface.getAttribute("id"));
    // The adapter's defaults: a label to the right of the trigger, with the
    // material chrome the rest of the shell's panels use.
    expect(surface.className).toContain("material-panel");
  });

  it("keeps the shell's asChild composition on a plain anchor", async () => {
    await act(async () => root.render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <a href="/tasks" data-nav-node>Tasks</a>
          </TooltipTrigger>
          <TooltipContent>Tasks</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    ));
    const anchor = host.querySelector("a[data-nav-node]")!;
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute("href")).toBe("/tasks");
    expect(browser.document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
  });
});
