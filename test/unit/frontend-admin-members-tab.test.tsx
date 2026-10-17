// @vitest-environment node
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMembersRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { readWorkspaceLocation } from "../../frontend/lib/workspace-location";
import type { AdminMember, AdminMembersPage } from "../../frontend/lib/admin-members-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("admin members tab in the URL", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let readEntries: () => Array<{ url: string }>;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const load = async (): Promise<AdminMembersPage> => page([member("m1")]);
  const loadInvitations = async () => [];
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/members" });
    readEntries = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis).entries;
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  function tab(value: string) { return document.querySelector(`[role="tab"][data-tab-value="${value}"]`) as HTMLButtonElement | null; }
  function panel(value: string) {
    const id = tab(value)?.getAttribute("aria-controls");
    return id ? document.getElementById(id) : null;
  }
  async function renderAt(path: string) {
    browser.history.replaceState({}, "", path);
    const search = browser.location.search;
    await act(async () => root.render(<AdminMembersRoute locale={locale} search={search} load={load} loadInvitations={loadInvitations} />));
    await flush();
  }

  it("opens the deep-linked tab directly", async () => {
    await renderAt("/admin/members?tab=invitations");
    expect(tab("invitations")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("members")?.getAttribute("aria-selected")).toBe("false");
    expect(panel("invitations")?.hasAttribute("hidden")).toBe(false);
    expect(panel("members")?.hasAttribute("hidden")).toBe(true);
    expect(readWorkspaceLocation().search).toBe("?tab=invitations");
  });

  it("writes tab switches with replace and preserves every other param", async () => {
    const entries = readEntries().length;
    await renderAt("/admin/members?status=active&page=2&pageSize=50");
    await act(async () => tab("invitations")!.click());
    const switched = new URLSearchParams(readWorkspaceLocation().search);
    expect(switched.get("tab")).toBe("invitations");
    expect(switched.get("status")).toBe("active");
    expect(switched.get("page")).toBe("2");
    expect(switched.get("pageSize")).toBe("50");
    expect(readEntries()).toHaveLength(entries);
    expect(tab("invitations")?.getAttribute("aria-selected")).toBe("true");
    await act(async () => tab("members")!.click());
    expect(readWorkspaceLocation().search).toBe("?status=active&page=2&pageSize=50");
    expect(readEntries()).toHaveLength(entries);
  });

  it("falls back to members and normalizes an unknown tab in the URL", async () => {
    await renderAt("/admin/members?status=active&tab=bogus");
    expect(readWorkspaceLocation().search).toBe("?status=active");
    expect(readEntries()).toHaveLength(1);
    expect(tab("members")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("invitations")?.getAttribute("aria-selected")).toBe("false");
  });

  it("canonicalizes an explicit default tab instead of leaving it in the URL", async () => {
    await renderAt("/admin/members?tab=members");
    expect(readWorkspaceLocation().search).toBe("");
    expect(tab("members")?.getAttribute("aria-selected")).toBe("true");
  });
});

function member(id: string): AdminMember { return { id, email: `${id}@example.test`, role: "contributor", status: "active" }; }
function page(items: AdminMember[]): AdminMembersPage { return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } }; }
async function flush() { await act(async () => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 0); await promise; for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
