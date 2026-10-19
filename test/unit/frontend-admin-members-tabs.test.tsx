// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { AdminMembersRoute } from "../../frontend/app";
import type { AdminMembersPage } from "../../frontend/lib/admin-members-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const EMPTY_MEMBERS: AdminMembersPage = { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
const NETWORK = {
  nodes: [{ id: "admin-1", email: "admin@example.test", role: "admin", status: "active", createdAt: "2026-10-01T00:00:00.000Z", inviterId: null, invitation: null }],
  stats: { members: 1, invited: 0, roots: 1, maxDepth: 0 },
};

describe("member management tabs", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const requests: string[] = [];

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/members" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, sessionStorage: browser.sessionStorage, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    requests.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      requests.push(path);
      if (path.startsWith("/api/admin/invitations/network")) return Response.json(NETWORK);
      if (path.startsWith("/api/admin/invitations?")) return Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      return Response.json({ error: { code: "NOT_FOUND", message: "not found", retryable: false } }, { status: 404 });
    }));
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function flush() {
    await act(async () => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 0); await promise; for (let index = 0; index < 14; index += 1) await Promise.resolve(); });
  }
  async function render() {
    await act(async () => root.render(<AdminMembersRoute locale={locale} memberId="admin-1" search="" load={async () => EMPTY_MEMBERS} update={async () => { throw new Error("unused"); }} />));
    await flush();
  }
  function tab(value: "members" | "invitations" | "network"): HTMLButtonElement {
    const element = container.querySelector(`[role="tab"][data-tab-value="${value}"]`);
    expect(element, value).toBeTruthy();
    return element as HTMLButtonElement;
  }

  it("shows members, invitation codes and the relationship network as three tabs", async () => {
    await render();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(tab("members").textContent).toContain("Members");
    expect(tab("invitations").textContent).toContain("Invitation codes");
    expect(tab("network").textContent).toContain("Invitation relationship network");
    // Default tab keeps the member table (and its empty state) without loading either invitation panel.
    expect(container.querySelector('[role="tabpanel"][data-state="active"]')?.textContent).toContain("No members");
    expect(container.querySelector("[data-admin-invitations]")).toBeNull();
    expect(container.querySelector("[data-invitation-network]")).toBeNull();

    await act(async () => tab("invitations").click());
    await flush();
    expect(container.querySelector("[data-admin-invitations]")).not.toBeNull();
    expect(requests.some((path) => path.startsWith("/api/admin/invitations?"))).toBe(true);
    expect(container.querySelector("[data-invitation-network]")).toBeNull();

    await act(async () => tab("network").click());
    await flush();
    expect(container.querySelector("[data-invitation-network]")).not.toBeNull();
    expect(container.textContent).toContain("admin@example.test");
    expect(requests.some((path) => path === "/api/admin/invitations/network")).toBe(true);
    expect(container.querySelector("[data-admin-invitations]")).toBeNull();
  });
});
