// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAssetsRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const item: { asset: { id: string; originalName?: string }; job: { status?: string } } = {
  asset: { id: "asset-a", originalName: "launch.txt" },
  job: { status: "succeeded" },
};

describe("admin asset identity read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.asset.originalName = "launch.txt";
    item.job.status = "succeeded";
    browser = new Window({ url: "https://app.test/admin/assets" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing name as unnamed", async () => {
    delete item.asset.originalName;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Unnamed asset");
    expect(container.textContent).not.toContain("asset-a");
  });

  it("does not label a missing status as unavailable", async () => {
    delete item.job.status;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Status unavailable");
    expect(container.textContent).not.toContain("launch.txt");
  });

  it("does not keep an unknown status", async () => {
    item.job.status = "banana";
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("banana");
    expect(container.textContent).not.toContain("launch.txt");
  });

  it("shows an explicit succeeded asset", async () => {
    await mount();
    expect(container.textContent).toContain("launch.txt");
    expect(container.textContent).toContain("succeeded");
    expect(container.textContent).toContain("Preview");
    expect(container.textContent).not.toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Unnamed asset");
    expect(container.textContent).not.toContain("Status unavailable");
  });

  it("shows a retry only for an explicit retryable failure", async () => {
    item.job.status = "failed_retryable";
    await mount();
    expect(container.textContent).toContain("launch.txt");
    expect(container.textContent).toContain("failed_retryable");
    expect(container.textContent).toContain("Retry");
    expect(container.textContent).not.toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Status unavailable");
  });

  async function mount() {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ asset: { ...item.asset }, job: { ...item.job } }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    await act(async () => root.render(<AdminAssetsRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("launch.txt") || text.includes("Unnamed asset") || text.includes("Status unavailable") || text.includes("Unable to load the page.") || text.includes("banana")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
