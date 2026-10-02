// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextRail } from "../../frontend/components/shell/context-rail";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


describe("context rail navigation callback", () => {
  let browser: InstanceType<typeof Window>, host: HTMLElement, root: Root;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/knowledge" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(host as unknown as Node); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); await browser.happyDOM.close(); vi.unstubAllGlobals(); });
  it.each([true, false])("respects optional admitted navigation callback: %s", async (provided) => {
    const navigate = vi.fn();
    await act(async () => root.render(<ContextRail pathname="/knowledge" locale={createLocaleRuntime({ navigatorLanguage: "en" })} onNavigate={provided ? navigate : undefined} />));
    const link = host.querySelector<HTMLAnchorElement>('a[href="/tasks"]')!;
    expect(link).not.toBeNull();
    const event = new browser.MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(event as unknown as MouseEvent); });
    expect(event.defaultPrevented).toBe(provided);
    expect(navigate.mock.calls).toEqual(provided ? [["/tasks"]] : []);
  });
});
