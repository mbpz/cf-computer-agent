// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySubmissionsRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const item: { id: string; title?: string; status?: string } = {
  id: "submission-a",
  title: "Launch guide",
  status: "review_pending",
};

describe("my submissions identity read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.title = "Launch guide";
    item.status = "review_pending";
    browser = new Window({ url: "https://app.test/my-submissions" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing title as an untitled submission", async () => {
    delete item.title;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Untitled submission");
    expect(container.textContent).not.toContain("submission-a");
  });

  it("does not label a missing status as unavailable", async () => {
    delete item.status;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Status unavailable");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("does not show an unknown status as the submission state", async () => {
    item.status = "banana";
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("banana");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("shows an explicit pending submission", async () => {
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("review_pending");
    expect(container.textContent).not.toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Untitled submission");
    expect(container.textContent).not.toContain("Status unavailable");
  });

  it("keeps a blank title untitled when the status is explicit", async () => {
    item.title = "";
    await mount();
    expect(container.textContent).toContain("Untitled submission");
    expect(container.textContent).toContain("review_pending");
    expect(container.textContent).not.toContain("Unable to load the page.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...item }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    await act(async () => root.render(<MySubmissionsRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Launch guide") || text.includes("Untitled submission") || text.includes("Unable to load the page.")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
