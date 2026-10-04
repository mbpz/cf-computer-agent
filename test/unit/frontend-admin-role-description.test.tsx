// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRolesRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const item: { id: string; key: string; name: string; description?: string | null; allowBits: string; memberCount: number; assignedMemberIds: string[]; status: string; isSystem: boolean } = {
  id: "role-editor",
  key: "editor",
  name: "Editor",
  description: "Governance",
  allowBits: "0x1",
  memberCount: 0,
  assignedMemberIds: [],
  status: "active",
  isSystem: false,
};

describe("admin role description read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.description = "Governance";
    browser = new Window({ url: "https://app.test/admin/roles" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not treat a missing description as an empty one", async () => {
    delete item.description;
    await mount();
    expect(container.querySelector("[data-page-state='error']")).not.toBeNull();
    expect(container.textContent).toContain("Roles are temporarily unavailable.");
    expect(container.textContent).not.toContain("Editor");
    expect(container.textContent).not.toContain("Not provided");
  });

  it("shows an explicit empty description as not provided", async () => {
    item.description = "";
    await mount();
    expect(container.textContent).toContain("Editor");
    expect(container.textContent).toContain("Not provided");
    expect(container.querySelector("[data-page-state='error']")).toBeNull();
  });

  it("shows an explicit description", async () => {
    await mount();
    expect(container.textContent).toContain("Editor");
    expect(container.textContent).toContain("Governance");
    expect(container.textContent).not.toContain("Not provided");
    expect(container.querySelector("[data-page-state='error']")).toBeNull();
  });

  async function mount() {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...item }] }));
    await act(async () => root.render(<AdminRolesRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Editor") || text.includes("Roles are temporarily unavailable.")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
