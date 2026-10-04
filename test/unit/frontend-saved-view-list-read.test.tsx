// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("saved view list read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let views: unknown; let urls: string[];
  beforeEach(() => {
    views = {}; urls = [];
    browser = new Window({ url: "https://app.test/search" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not treat a missing saved-view list as no saved views", async () => {
    await mount();
    expect(urls.some((url) => url.includes("/api/saved-views"))).toBe(true);
    expect(container.textContent).toContain("Unable to update saved views. Please try again.");
    expect(container.querySelector("[data-saved-view-apply]")).toBeNull();
  });

  it("shows an explicit empty saved-view list without a read error", async () => {
    views = { items: [] };
    await mount();
    expect(urls.some((url) => url.includes("/api/saved-views"))).toBe(true);
    expect(container.textContent).not.toContain("Unable to update saved views. Please try again.");
    expect(container.querySelector("[data-saved-view-apply]")).toBeNull();
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); urls.push(url);
      if (url.includes("/saved-views")) return Response.json(views);
      return Response.json({ items: [], degraded: false, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    await act(async () => root.render(<SearchRoute memberId="member-a" locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (urls.some((url) => url.includes("/api/saved-views"))) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
});
