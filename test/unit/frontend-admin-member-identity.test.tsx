// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMembersRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const item: { id: string; email?: string; role?: string; status?: string } = {
  id: "member-a",
  email: "ada@example.test",
  role: "contributor",
  status: "active",
};

describe("admin member identity read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.email = "ada@example.test";
    item.role = "contributor";
    item.status = "active";
    browser = new Window({ url: "https://app.test/admin/members" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing email as unavailable", async () => {
    delete item.email;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Email unavailable");
    expect(container.textContent).not.toContain("contributor");
  });

  it("does not label a missing role as unavailable", async () => {
    delete item.role;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Role unavailable");
    expect(container.textContent).not.toContain("ada@example.test");
  });

  it("does not label a missing or unknown status as unavailable", async () => {
    delete item.status;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Status unavailable");
    expect(container.textContent).not.toContain("ada@example.test");
  });

  it("does not keep an unknown status", async () => {
    item.status = "banana";
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("banana");
    expect(container.textContent).not.toContain("ada@example.test");
  });

  it("does not keep an unknown role", async () => {
    item.role = "owner";
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("owner");
    expect(container.textContent).not.toContain("ada@example.test");
  });

  it("shows an explicit active contributor", async () => {
    await mount();
    expect(container.textContent).toContain("ada@example.test");
    expect(container.textContent).toContain("contributor");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).not.toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Email unavailable");
    expect(container.textContent).not.toContain("Role unavailable");
    expect(container.textContent).not.toContain("Status unavailable");
  });

  it("shows an explicit disabled contributor", async () => {
    item.status = "disabled";
    await mount();
    expect(container.textContent).toContain("ada@example.test");
    expect(container.textContent).toContain("Disabled");
    expect(container.textContent).toContain("Enable");
    expect(container.textContent).not.toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Status unavailable");
  });

  async function mount() {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...item }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    await act(async () => root.render(<AdminMembersRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("ada@example.test") || text.includes("Email unavailable") || text.includes("Role unavailable") || text.includes("Status unavailable") || text.includes("Unable to load the page.") || text.includes("owner")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
