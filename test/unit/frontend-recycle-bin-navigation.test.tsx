// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const baseSession = {
  member: { id: "admin-1", email: "admin@example.test", role: "admin" as const },
  permissionMask: "0x37ffff",
  logoutUrl: "/auth/logout",
};
const withReview = { ...baseSession, capabilities: ["knowledge:read", "submission:read-all", "knowledge:review", "member:manage"] };
const withoutReview = { ...baseSession, capabilities: ["knowledge:read", "submission:read-all", "member:manage"], permissionMask: "0x37fff7" };

/**
 * The recycle bin must be discoverable from the shell's own navigation, and an
 * administrator without `knowledge:review` must not see the entry at all. The
 * server-owned menu tree is covered by the worker suite; this covers the shell's
 * fallback tree, which is what renders when that projection is unavailable.
 */
describe("recycle bin navigation entry", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin" });
    for (const [key, value] of Object.entries({
      window: browser, document: browser.document, navigator: browser.navigator,
      history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement,
      MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
    })) vi.stubGlobal(key, value);
    // No server navigation: the shell falls back to its registry tree.
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });

  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function mount(session: typeof withReview) {
    await act(async () => {
      root.render(<AppShell session={session} pathname="/admin" locale={createLocaleRuntime({ navigatorLanguage: "en" })}><p>content</p></AppShell>);
    });
    for (let index = 0; index < 12; index += 1) await act(async () => { await Promise.resolve(); });
  }

  it("offers the recycle bin to an administrator who holds knowledge:review", async () => {
    await mount(withReview);
    expect(container.querySelector('[data-navigation-source="fallback"]')).not.toBeNull();
    const entry = container.querySelector('[data-route-id="admin-recycle-bin"]');
    expect(entry).not.toBeNull();
    expect(entry?.getAttribute("href")).toBe("/admin/knowledge/trash");
  });

  it("hides the recycle bin from an administrator without knowledge:review", async () => {
    await mount(withoutReview);
    expect(container.querySelector('[data-navigation-source="fallback"]')).not.toBeNull();
    // Another administrator entry that needs a different capability is still
    // reachable, so the absence is the capability gate and not an empty tree.
    expect(container.querySelector('[data-route-id="admin-members"]')).not.toBeNull();
    expect(container.querySelector('[data-route-id="admin-recycle-bin"]')).toBeNull();
    expect(container.textContent).not.toContain("Recycle bin");
  });
});
