// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { InvitationNetworkPanel } from "../../frontend/components/admin/invitation-network-panel";
import type { InvitationNetwork } from "../../frontend/lib/invitations-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const NOW = "2026-10-01T00:00:00.000Z";
const NETWORK: InvitationNetwork = {
  nodes: [
    { id: "admin-1", email: "admin@example.test", role: "admin", status: "active", createdAt: NOW, inviterId: null, invitation: null },
    { id: "owner-1", email: "owner@example.test", role: "contributor", status: "active", createdAt: NOW, inviterId: "admin-1", invitation: { id: "inv-1", code: "ABCDEFGHJKLMNPQR", formattedCode: "ABCD-EFGH-JKLM-NPQR", kind: "admin", createdAt: NOW, backfilled: false } },
    { id: "invitee-1", email: "invitee@example.test", role: "contributor", status: "disabled", createdAt: NOW, inviterId: "owner-1", invitation: { id: "inv-2", code: "JKMNPQRSTUVWXY23", formattedCode: "JKMN-PQRS-TUVW-XY23", kind: "member", createdAt: NOW, backfilled: false } },
  ],
  stats: { members: 3, invited: 2, roots: 1, maxDepth: 2 },
};

describe("invitation relationship network", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/menus" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function mount(loadNetwork = vi.fn().mockResolvedValue(NETWORK)) {
    await act(async () => root.render(<InvitationNetworkPanel locale={locale} loadNetwork={loadNetwork} />));
    const toggle = container.querySelector("[data-invitation-network-toggle]") as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    await act(async () => toggle!.click());
    await act(async () => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 0); await promise; for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
    return loadNetwork;
  }

  it("renders the expanded forest, invitation kinds and depth stats", async () => {
    const loadNetwork = await mount();
    expect(loadNetwork).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-invitation-network]")?.getAttribute("data-invitation-network")).toBe("ready");
    expect(container.textContent).toContain("admin@example.test");
    expect(container.textContent).toContain("owner@example.test");
    expect(container.textContent).toContain("invitee@example.test");
    expect(container.textContent).toContain("Admin code");
    expect(container.textContent).toContain("Member code");
    expect(container.textContent).toContain("Max depth");
    expect(container.querySelectorAll("[data-network-member]")).toHaveLength(3);
    expect(container.querySelector('[data-network-email="invitee-1"]')?.textContent).toContain("invitee@example.test");
    // The disabled invitee keeps its status visible as text.
    expect(container.textContent).toContain("Disabled");
  });

  it("shows a retryable error and reloads on retry", async () => {
    const loadNetwork = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(NETWORK);
    await mount(loadNetwork);
    expect(container.querySelector("[data-invitation-network]")?.getAttribute("data-invitation-network")).toBe("error");
    const retry = container.querySelector("[data-invitation-network-retry]") as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    await act(async () => retry!.click());
    await act(async () => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 0); await promise; for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
    expect(container.querySelector("[data-invitation-network]")?.getAttribute("data-invitation-network")).toBe("ready");
    expect(loadNetwork).toHaveBeenCalledTimes(2);
  });

  it("renders an empty state when there are no members", async () => {
    await mount(vi.fn().mockResolvedValue({ nodes: [], stats: { members: 0, invited: 0, roots: 0, maxDepth: 0 } }));
    expect(container.querySelector("[data-invitation-network]")?.getAttribute("data-invitation-network")).toBe("ready");
    expect(container.textContent).toContain("No members yet.");
  });
});
