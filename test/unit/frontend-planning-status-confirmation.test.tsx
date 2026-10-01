// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { GoalsPage } from "../../frontend/pages/goals-page";
import { ProjectsPage } from "../../frontend/pages/projects-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe.each(["goals", "projects"] as const)("%s status confirmation", kind => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const row = { id: "one", clientKey: "one", title: "Same title", description: null, status: "active" as const, progress: 10, targetAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.001Z" };
  const ready = { kind: "ready" as const, items: [row, { ...row, id: "two" }], summaries: {}, pagination: { page: 1, pageSize: 20 as const, total: 21, totalPages: 2 } };
  let write: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    browser = new Window({ url: `https://app.test/${kind}` });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); write = vi.fn();
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(extra: Record<string, unknown> = {}) {
    const props = { locale, state: ready, createMemberId: "member-one", onStatusChange: write, ...extra };
    await act(async () => root.render(kind === "goals" ? <GoalsPage {...props} /> : <ProjectsPage {...props} />));
  }
  function action(label: string, index = 0) { const button = [...container.querySelectorAll("button")].filter(node => node.textContent === label)[index]; expect(button, label).toBeDefined(); return button; }
  function confirm() { const button = container.querySelector<HTMLButtonElement>("[data-confirm-action]"); expect(button).not.toBeNull(); return button!; }
  async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
  it.each([["Complete", "completed", "Active", "Completed"], ["Archive", "archived", "Active", "Archived"], ["Restore", "active", "Archived", "Active"]] as const)("confirms %s for the exact row and retains its original version", async (label, status, from, to) => {
    const target = { ...row, id: "two", status: label === "Restore" ? "archived" as const : "active" as const };
    await mount({ state: { ...ready, items: [target] } }); action(label).focus(); await click(action(label));
    expect(write).not.toHaveBeenCalled(); const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Same title (two)"); expect(dialog?.textContent).toContain(`${from} → ${to}`); expect(dialog?.textContent).toContain("does not change progress");
    expect(browser.document.activeElement?.hasAttribute("data-cancel-action")).toBe(true); expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    const button = confirm(); await act(async () => { button.click(); button.click(); });
    expect(write).toHaveBeenCalledExactlyOnceWith(target, status); expect(write.mock.calls[0][0].updatedAt).toBe("2026-10-01T00:00:00.001Z"); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it.each(["cancel", "escape", "overlay"])("%s writes nothing and restores focus", async method => {
    await mount(); const trigger = action("Archive"); trigger.focus(); await click(trigger);
    if (method === "cancel") await click(container.querySelector<HTMLButtonElement>("[data-cancel-action]")!);
    else if (method === "escape") await act(async () => container.querySelector('[role="alertdialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    else await click(container.querySelector('[data-dialog-open="true"] > [aria-hidden="true"]') as HTMLButtonElement);
    expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); expect(browser.document.activeElement).toBe(trigger);
  });
  it.each(["new list", "removed target", "page", "size", "member", "pending", "create lock", "loading", "denied", "handler"])("invalidates on %s without reviving the old decision", async change => {
    await mount(); await click(action("Complete")); const old = confirm();
    const extra = change === "new list" ? { state: { ...ready, items: ready.items.map(item => ({ ...item, updatedAt: "2026-10-02T00:00:00.000Z" })) } }
      : change === "removed target" ? { state: { ...ready, items: [] } }
      : change === "page" ? { state: { ...ready, pagination: { ...ready.pagination, page: 2 } } }
      : change === "size" ? { state: { ...ready, pagination: { ...ready.pagination, pageSize: 50 } } }
      : change === "member" ? { createMemberId: "member-two" } : change === "pending" ? { pending: true } : change === "create lock" ? { createLocked: true }
      : change === "loading" ? { state: { kind: "loading" } } : change === "denied" ? { state: { kind: "error", message: "Denied" } } : { onStatusChange: undefined };
    await mount(extra); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); await click(old); await mount(); expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("freezes the first row and action for same-tick requests", async () => {
    await mount(); const first = action("Archive"); const second = action("Complete", 1);
    await act(async () => { first.click(); second.click(); }); expect(write).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("Same title (one)"); await click(confirm()); expect(write).toHaveBeenCalledExactlyOnceWith(row, "archived");
  });
  it.each([{ pending: true }, { createLocked: true }, { onStatusChange: undefined }])("does not open when unavailable %j", async extra => {
    await mount(extra); expect(action("Complete").disabled).toBe(true); await click(action("Complete")); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); expect(write).not.toHaveBeenCalled();
  });
  it("preserves the create draft and unrelated rerenders, but clears on unmount", async () => {
    await mount(); const input = container.querySelector<HTMLInputElement>('input[name="title"]') ?? container.querySelector<HTMLInputElement>('input'); expect(input).not.toBeNull();
    // This node environment does not install React's browser input event plugin.
    const prop = Object.keys(input!).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { (input as unknown as Record<string, { onChange: (event: unknown) => void }>)[prop].onChange({ currentTarget: { value: "Unsubmitted draft" } }); });
    expect(input!.value).toBe("Unsubmitted draft");
    await click(action("Archive")); await mount({ actionError: "Earlier error" }); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click(container.querySelector<HTMLButtonElement>("[data-cancel-action]")!); expect(input!.value).toBe("Unsubmitted draft");
    await click(action("Archive")); const old = confirm(); await act(async () => root.render(<p>Other route</p>)); await click(old); await mount(); expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("uses Chinese action impact and an ID fallback for blank titles", async () => {
    await mount({ locale: createLocaleRuntime({ navigatorLanguage: "zh-CN" }), state: { ...ready, items: [{ ...row, title: "  " }] } }); await click(action("归档"));
    const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog?.textContent).toContain("one"); expect(dialog?.textContent).toContain("不会删除"); expect(dialog?.textContent).toContain("不会更改进度");
    await act(async () => dialog!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }) as unknown as Event)); expect(browser.document.activeElement?.hasAttribute("data-confirm-action")).toBe(true);
  });
  if (kind === "goals") it("blocks a same-tick progress change behind the confirmation", async () => {
    const progress = vi.fn(); await mount({ onProgressChange: progress }); const trigger = action("Archive");
    const input = container.querySelector('input[type="range"]')!; const prop = Object.keys(input).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { trigger.click(); (input as unknown as Record<string, { onChange: (event: unknown) => void }>)[prop].onChange({ currentTarget: { value: "75" } }); });
    expect(progress).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
  if (kind === "projects") it("invalidates when relation editing begins but not for summary-only updates", async () => {
    await mount(); await click(action("Archive")); await mount({ state: { ...ready, summaries: { one: { goalCount: 1, taskCount: 0, completedTaskCount: 0, goals: [] } } } }); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    const old = confirm(); await mount({ relationProjectId: "two" }); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); await click(old); expect(write).not.toHaveBeenCalled();
  });
});
