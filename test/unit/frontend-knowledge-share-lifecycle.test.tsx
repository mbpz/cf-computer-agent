// @vitest-environment node
import React, { act, StrictMode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeCard } from "../../frontend/components/knowledge/knowledge-card";
import { KnowledgePage } from "../../frontend/pages/knowledge-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const item = { id: "knowledge-a", title: "Private guide" };
function deferred() {
  let resolve!: () => void; let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("knowledge card system share ownership", () => {
  let browser: InstanceType<typeof Window>; let host: HTMLElement; let root: Root;
  let confirm: ReturnType<typeof vi.fn<() => boolean>>;
  let share: ReturnType<typeof vi.fn<(data: { title: string; url: string }) => Promise<void>>>;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/knowledge" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    confirm = vi.fn(() => true); Object.defineProperty(browser, "confirm", { configurable: true, value: confirm });
    share = vi.fn(async () => undefined); vi.stubGlobal("navigator", { share, userAgent: browser.navigator.userAgent });
    const element = browser.document.createElement("div"); browser.document.body.append(element);
    host = element as unknown as HTMLElement;
    const { createRoot } = await import("react-dom/client"); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  const render = async () => { await act(async () => root.render(<KnowledgeCard item={item} locale={locale} />)); };
  const button = () => host.querySelector<HTMLButtonElement>("button")!;
  const click = async () => { await act(async () => button().click()); };
  const statuses = () => host.querySelectorAll('[role="status"]');
  const renderPage = async (id: string) => { await act(async () => root.render(<KnowledgePage locale={locale} state={{ kind: "ready", items: [{ id, title: id }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} />)); };

  it("reserves the action before render against same-event double clicks", async () => {
    const pending = deferred(); share.mockImplementation(() => pending.promise); await render();
    await act(async () => { button().click(); button().click(); });
    expect(share).toHaveBeenCalledTimes(1); expect(confirm).toHaveBeenCalledTimes(1);
    expect(button().disabled).toBe(true); expect(button().getAttribute("aria-busy")).toBe("true");
    expect(host.textContent).toContain("Waiting for the share sheet");
    expect(share).toHaveBeenCalledWith({ title: "Private guide", url: "https://app.test/knowledge/knowledge-a" });
    await act(async () => pending.resolve());
    expect(button().disabled).toBe(false); expect(host.textContent).toContain("Share sheet opened");
  });

  it("keeps the same target pending across list item refreshes", async () => {
    const pending = deferred(); share.mockImplementation(() => pending.promise); await render(); await click();
    await act(async () => root.render(<KnowledgeCard item={{ ...item, title: "Refreshed guide" }} locale={locale} />));
    expect(button().disabled).toBe(true); expect(host.textContent).toContain("Refreshed guide");
    await click(); expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ title: "Private guide", url: "https://app.test/knowledge/knowledge-a" });
    await act(async () => pending.resolve()); expect(button().disabled).toBe(false);
  });

  it("clears an old success while the next explicitly confirmed share is pending", async () => {
    await render(); await click(); expect(host.textContent).toContain("Share sheet opened");
    const pending = deferred(); share.mockImplementation(() => pending.promise); await click();
    expect(host.textContent).not.toContain("Share sheet opened"); expect(button().disabled).toBe(true);
    await act(async () => pending.resolve()); expect(host.textContent).toContain("Share sheet opened");
  });

  it("does not invoke system sharing after a cancelled confirmation", async () => {
    confirm.mockReturnValue(false); await render(); await click();
    expect(share).not.toHaveBeenCalled(); expect(button().disabled).toBe(false); expect(statuses()).toHaveLength(0);
  });

  it("treats a cancelled system share as idle and permits a later explicit attempt", async () => {
    share.mockRejectedValueOnce(new DOMException("cancelled private text", "AbortError")); await render(); await click();
    expect(statuses()).toHaveLength(0); expect(button().disabled).toBe(false);
    expect(host.textContent).not.toContain("cancelled private text");
    await click(); expect(share).toHaveBeenCalledTimes(2); expect(host.textContent).toContain("Share sheet opened");
  });

  it("releases a failed attempt and clears its visible error during explicit retry", async () => {
    share.mockRejectedValueOnce(new Error("private internal error")); await render(); await click();
    expect(host.textContent).toContain("System sharing is unavailable here.");
    expect(host.textContent).not.toContain("private internal error"); expect(button().disabled).toBe(false);
    const pending = deferred(); share.mockImplementation(() => pending.promise); await click();
    expect(host.textContent).not.toContain("System sharing is unavailable here."); expect(button().disabled).toBe(true);
    await act(async () => pending.resolve()); expect(host.textContent).toContain("Share sheet opened");
  });

  it("reports a missing system API without falling back to a server write", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); vi.stubGlobal("navigator", {});
    await render(); await click();
    expect(host.textContent).toContain("System sharing is unavailable here."); expect(button().disabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"])("does not let a late old %s settle a new page target", async outcome => {
    const old = deferred(); const current = deferred();
    share.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    await renderPage("knowledge-a"); await click();
    await renderPage("knowledge-b"); await click();
    await act(async () => outcome === "success" ? old.resolve() : old.reject(new Error("old error")));
    expect(host.textContent).not.toContain("Share sheet opened");
    expect(host.textContent).not.toContain("System sharing is unavailable here.");
    expect(button().disabled).toBe(true);
    await act(async () => current.resolve()); expect(button().disabled).toBe(false); expect(host.textContent).toContain("Share sheet opened");
  });

  it("accepts a share after StrictMode effect setup and cleanup replay", async () => {
    const pending = deferred(); share.mockImplementation(() => pending.promise);
    await act(async () => root.render(<StrictMode><KnowledgeCard item={item} locale={locale} /></StrictMode>));
    await act(async () => { button().click(); button().click(); });
    expect(share).toHaveBeenCalledTimes(1); expect(button().disabled).toBe(true);
    await act(async () => pending.resolve());
    expect(button().disabled).toBe(false); expect(host.textContent).toContain("Share sheet opened");
  });

  it("renders the Chinese pending state and restores the action on cancellation", async () => {
    const pending = deferred(); share.mockImplementation(() => pending.promise);
    await act(async () => root.render(<KnowledgeCard item={item} locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })} />));
    await click(); expect(button().textContent).toBe("等待分享面板完成…");
    expect(button().getAttribute("aria-busy")).toBe("true");
    await act(async () => pending.reject(new DOMException("cancelled", "AbortError")));
    expect(button().textContent).toBe("分享"); expect(button().disabled).toBe(false);
    expect(button().getAttribute("aria-busy")).toBe("false"); expect(statuses()).toHaveLength(0);
  });

  it("does not apply an unmounted attempt to the same item on a later mount", async () => {
    const old = deferred(); share.mockImplementation(() => old.promise); await render(); await click();
    await act(async () => root.render(null)); await render();
    await act(async () => old.resolve()); expect(statuses()).toHaveLength(0); expect(button().disabled).toBe(false);
  });
});
