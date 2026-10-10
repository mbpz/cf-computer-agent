// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { loadCalendarIntent } from "../../frontend/lib/calendar-create-intent";
import { loadCalendarDraft } from "../../frontend/lib/calendar-draft";
import { CalendarPage } from "../../frontend/pages/calendar-page";


const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("calendar cancellation confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let write: ReturnType<typeof vi.fn>;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const range = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" };
  const row = { id: "event-one", clientKey: "event-one", title: "Same title", kind: "event" as const, description: "Private note", startsAt: "2026-10-01T10:00:00.000Z", endsAt: "2026-10-01T11:00:00.000Z", timezone: "UTC", allDay: false, status: "scheduled" as const, taskId: null, projectId: null, updatedAt: "2026-10-01T00:00:00.001Z" };
  const ready = { kind: "ready" as const, items: [row], pagination: { page: 1, pageSize: 20 as const, total: 1, totalPages: 1 } };
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/calendar" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); write = vi.fn();
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(extra: Record<string, unknown> = {}) {
    await act(async () => root.render(<CalendarPage locale={locale} state={ready} range={range} createMemberId="alice" onCancel={write} onRangeChange={() => {}} onPageChange={() => {}} onPageSizeChange={() => {}} {...extra} />));
  }
  const trigger = (index = 0) => container.querySelectorAll<HTMLButtonElement>('[aria-label="Cancel event"]')[index]!;
  function action(label: string) { const button = [...container.querySelectorAll("button")].find(node => node.textContent === label); expect(button, label).toBeDefined(); return button!; }
  const confirm = () => action("Confirm cancellation");
  async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
  async function input(label: string, value: string) {
    const node = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { (node as unknown as Record<string, { onChange: (event: unknown) => void }>)[key].onChange({ currentTarget: { value } }); });
  }
  it("shows exact identity, zoned times and impact, focuses keep, and confirms once with original version", async () => {
    await mount(); trigger().focus(); await click(trigger()); expect(write).not.toHaveBeenCalled();
    const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog?.textContent).toContain("Same title (event-one)"); expect(dialog?.textContent).toContain("UTC"); expect(dialog?.textContent).toContain("without deleting");
    expect(dialog?.getAttribute("aria-modal")).toBe("true"); expect(browser.document.activeElement?.textContent).toBe("Keep event"); expect(container.querySelector('section')?.hasAttribute("inert")).toBe(true);
    const button = confirm(); await act(async () => { button.click(); button.click(); }); expect(write).toHaveBeenCalledExactlyOnceWith(row); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it.each(["keep", "escape", "overlay"])("%s writes nothing and restores trigger focus", async mode => {
    await mount(); const button = trigger(); button.focus(); await click(button);
    if (mode === "keep") await click(action("Keep event"));
    else if (mode === "escape") await act(async () => container.querySelector('[role="alertdialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    else { const overlay = container.querySelector('[data-dialog-open="true"] > [aria-hidden="true"]'); expect(overlay).not.toBeNull(); await click(overlay as HTMLButtonElement); }
    expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); expect(browser.document.activeElement).toBe(button);
  });
  it.each(["list", "removed", "version", "page", "size", "range", "member", "pending", "create pending", "loading", "error", "handler"])("revokes %s and never revives a stale decision", async change => {
    await mount(); await click(trigger()); const old = confirm();
    const extra = change === "list" ? { state: { ...ready, items: [...ready.items] } } : change === "removed" ? { state: { ...ready, items: [] } } : change === "version" ? { state: { ...ready, items: [{ ...row, updatedAt: range.to }] } } : change === "page" ? { state: { ...ready, pagination: { ...ready.pagination, page: 2 } } } : change === "size" ? { state: { ...ready, pagination: { ...ready.pagination, pageSize: 50 } } } : change === "range" ? { range: { ...range, to: "2026-10-03T00:00:00.000Z" } } : change === "member" ? { createMemberId: "bob" } : change === "pending" ? { pending: true } : change === "create pending" ? { createPending: true } : change === "loading" ? { state: { kind: "loading" } } : change === "error" ? { state: { kind: "error", message: "Denied" } } : { onCancel: undefined };
    await mount(extra); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); await click(old); await mount(); expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("keeps the first row on same-tick requests, not an identical title's second ID", async () => {
    const second = { ...row, id: "event-two" }; await mount({ state: { ...ready, items: [row, second] } });
    const first = trigger(); const other = trigger(1); await act(async () => { first.click(); other.click(); });
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("event-one"); await click(confirm()); expect(write).toHaveBeenCalledExactlyOnceWith(row);
  });
  it("blocks same-tick range navigation then allows it after keep", async () => {
    const change = vi.fn(); await mount({ onRangeChange: change }); const cancel = trigger(); const apply = action("Apply range");
    await act(async () => { cancel.click(); apply.click(); }); expect(change).not.toHaveBeenCalled(); await click(action("Keep event")); await click(apply); expect(change).toHaveBeenCalledTimes(1);
  });
  it("retains a draft and blocks same-tick creation before storing an intent", async () => {
    const create = vi.fn(); await mount({ onCreate: create }); await input("Event title", "Unsubmitted event"); await input("Starts", "2026-10-01T10:00"); await input("Ends", "2026-10-01T11:00");
    const expectedDraft = { kind: "ready", draft: { title: "Unsubmitted event", startsAt: "2026-10-01T10:00", endsAt: "2026-10-01T11:00" } };
    expect(loadCalendarDraft("alice")).toEqual(expectedDraft); expect(loadCalendarIntent("alice")).toEqual({ kind: "empty" });
    const cancel = trigger(); const add = action("Add event"); expect(add.disabled).toBe(false);
    await act(async () => { cancel.click(); add.click(); }); expect(create).not.toHaveBeenCalled(); expect(loadCalendarIntent("alice")).toEqual({ kind: "empty" }); expect(loadCalendarDraft("alice")).toEqual(expectedDraft); expect(browser.sessionStorage.length).toBe(1);
    await click(action("Keep event")); expect(container.querySelector<HTMLInputElement>('input[aria-label="Event title"]')?.value).toBe("Unsubmitted event");
  });
  it("survives equal range rerenders but not unmount", async () => {
    await mount(); await click(trigger()); await mount({ range: { ...range }, actionError: "Earlier error" }); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    const stale = confirm(); await act(async () => root.render(<p>Other route</p>)); await click(stale); await mount(); expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("uses Chinese focus-specific non-cascading impact and ID fallback", async () => {
    await mount({ locale: createLocaleRuntime({ navigatorLanguage: "zh-CN" }), state: { ...ready, items: [{ ...row, title: " ", kind: "focus" }] } });
    await click(container.querySelector<HTMLButtonElement>('[aria-label="取消日程"]')!);
    const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog?.textContent).toContain("event-one"); expect(dialog?.textContent).toContain("不会删除"); expect(dialog?.textContent).toContain("专注会话");
    await act(async () => dialog!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }) as unknown as Event)); expect(browser.document.activeElement?.textContent).toBe("确认取消日程");
  });
});
