// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsRoute } from "../../frontend/app";
import { createLocaleRuntime, frontendText, type LocaleRuntime } from "../../frontend/lib/i18n";
import { ToastProvider } from "../../frontend/lib/use-toast";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom imports node:vm itself, so it can only load after the inert substitute above is registered.
const { Window } = await import("happy-dom");

/**
 * The toast channel is the only place a transient notification confirmation may live:
 * durable write state (failures, blocked records, recovery) stays inline and must never
 * be replaced by a toast that a refresh can drop.
 */
describe("notification confirmations on the toast channel", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/notifications" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("confirms a single mark-read in the active locale and keeps the stack out of the page tree", async () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    let readAt: string | null = null;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { readAt = "2026-08-30T01:00:00.000Z"; return Response.json(notification({ readAt })); }
      if (url.endsWith("/summary")) return Response.json({ unread: readAt ? 0 : 1 });
      return Response.json({ items: [notification({ readAt })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await render(locale);
    expect(browser.document.body.textContent).not.toContain(frontendText(locale, "NOTIFICATIONS_MARKED_READ"));

    await click(frontendText(locale, "NOTIFICATIONS_MARK_READ"));
    await flush();
    expect(browser.document.body.textContent).toContain(frontendText(locale, "NOTIFICATIONS_MARKED_READ"));
    // The stack portals next to the document body, not into the route's own tree.
    expect(container.textContent).not.toContain(frontendText(locale, "NOTIFICATIONS_MARKED_READ"));
    expect(browser.document.querySelector("[aria-live='polite']")).not.toBeNull();
  });

  it("confirms a bulk visible mark-read with its own bilingual copy", async () => {
    for (const navigatorLanguage of ["en", "zh-Hans-CN"]) {
      const locale = createLocaleRuntime({ navigatorLanguage });
      let bodies: string[] = [];
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") { bodies = [String(init.body ?? "")]; return Response.json({ marked: 1 }); }
        if (url.endsWith("/summary")) return Response.json({ unread: 1 });
        return Response.json({ items: [notification()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      });
      await render(locale);
      await click(frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ"));
      await flush();
      expect(bodies).toEqual([JSON.stringify({ ids: ["notification-1"] })]);
      expect(browser.document.body.textContent).toContain(frontendText(locale, "NOTIFICATIONS_MARKED_VISIBLE_READ"));
      await act(async () => root.unmount());
      root = createRoot(container);
    }
  });

  it("never claims success for a rejected update: the recovery state stays inline and no toast is queued", async () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return Response.json({ error: { code: "WRITE_FAILED", message: "Unavailable", retryable: true } }, { status: 500 });
      if (url.endsWith("/summary")) return Response.json({ unread: 1 });
      return Response.json({ items: [notification()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await render(locale);
    await click(frontendText(locale, "NOTIFICATIONS_MARK_READ"));
    await flush();
    expect(container.querySelector("[data-page-state='error']")).not.toBeNull();
    expect(container.textContent).toContain(frontendText(locale, "NOTIFICATIONS_RECOVERY_DESCRIPTION"));
    expect(browser.document.body.textContent).not.toContain(frontendText(locale, "NOTIFICATIONS_MARKED_READ"));
  });

  async function render(locale: LocaleRuntime) {
    await act(async () => root.render(<ToastProvider locale={locale}><NotificationsRoute locale={locale} memberId="member-a" search="" /></ToastProvider>));
    await flush();
  }
  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label) as HTMLButtonElement | undefined;
    expect(button, `button ${label}`).toBeTruthy();
    await act(async () => button!.click());
  }
});

/** Shared notification fixture: every case must send the same server-shaped row. */
function notification(overrides: Record<string, unknown> = {}) {
  return { id: "notification-1", recipientMemberId: "member-1", eventType: "task.due", actorMemberId: null, targetKind: "task", targetId: "task-1", payload: { title: "Due soon" }, deduplicationKey: "due-1", readAt: null, createdAt: "2026-08-30T00:00:00.000Z", ...overrides };
}
async function flush() {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 20);
    await promise;
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
  });
}
