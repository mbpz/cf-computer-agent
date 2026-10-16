// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRolesRoute, AdminRoleNewRoute, AdminRoleDetailRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const role = { id: "role-editor", key: "editor", name: "Editor", description: "Private role", allowBits: "0x1", memberCount: 1, assignedMemberIds: ["member-secret"], status: "active", isSystem: false };

describe("role routes registered like sibling admin routes", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/roles" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("renders the role list in a table whose rows link to the detail page", async () => {
    vi.stubGlobal("fetch", async () => json({ items: [role] }));
    await act(async () => root.render(<AdminRolesRoute locale={locale()} />)); await flush();
    expect(container.querySelector("[data-list-mode]")).not.toBeNull();
    const link = container.querySelector('a[href="/admin/roles/role-editor"]') as HTMLAnchorElement | null;
    expect(link?.textContent).toBe("Editor");
    await act(async () => link!.click()); await flush();
    expect(browser.location.pathname).toBe("/admin/roles/role-editor");
  });

  it("creates a role on its own route and navigates back to the list on success", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      methods.push(init?.method || "GET");
      if (init?.method === "POST") return new Response(JSON.stringify({ role: { ...role, id: "custom", key: "custom", name: "Custom", allowBits: "0x0", memberCount: 0, assignedMemberIds: [], isSystem: false } }), { status: 201, headers: { "content-type": "application/json" } });
      return json({ items: [role] });
    });
    await act(async () => root.render(<AdminRoleNewRoute locale={locale()} />)); await flush();
    await input("Role key", "custom"); await input("Role name", "Custom");
    const create = [...container.querySelectorAll("button")].find((item) => item.textContent === "Create role") as HTMLButtonElement;
    await act(async () => create.click()); await flush();
    expect(methods).toEqual(["GET", "POST", "GET"]);
    expect(browser.location.pathname).toBe("/admin/roles");
  });

  it("renders the selected role's permissions from the API on the detail route", async () => {
    vi.stubGlobal("fetch", async () => json({ items: [role] }));
    await act(async () => root.render(<AdminRoleDetailRoute locale={locale()} roleId="role-editor" />)); await flush();
    expect(container.textContent).toContain("Editor");
    expect(container.textContent).toContain("knowledge:read");
    const read = container.querySelector('input[aria-label="Read knowledge"]') as HTMLInputElement;
    expect(read.checked).toBe(true);
    expect((container.querySelector('input[aria-label="Use workspace tasks"]') as HTMLInputElement).checked).toBe(false);
  });

  async function input(label: string, value: string) { const el = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new browser.Event("input", { bubbles: true })); }); }
});

function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
