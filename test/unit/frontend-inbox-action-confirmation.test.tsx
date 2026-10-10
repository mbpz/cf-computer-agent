// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { loadInboxIntent } from "../../frontend/lib/inbox-create-intent";
import { loadInboxDraft } from "../../frontend/lib/inbox-draft";
import { InboxPage } from "../../frontend/pages/inbox-page";


const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("inbox action confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const row = { id: "one", clientKey: "one", kind: "text" as const, content: "Private idea", sourceUrl: null, status: "inbox" as const, promotedTaskId: null, promotedSubmissionId: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.001Z" };
  const ready = { kind: "ready" as const, items: [row], pagination: { page: 1, pageSize: 20 as const, total: 1, totalPages: 1 } };
  let write: ReturnType<typeof vi.fn>; let promote: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/inbox" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); write = vi.fn(); promote = vi.fn();
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(extra: Record<string, unknown> = {}) {
    await act(async () => root.render(<InboxPage locale={locale} state={ready} createMemberId="alice" onStatusChange={write} onPromoteTask={promote} onFilterChange={() => {}} onPageChange={() => {}} onPageSizeChange={() => {}} {...extra} />));
  }
  function action(label: string) { const button = [...container.querySelectorAll("button")].find(node => node.textContent === label); expect(button, label).toBeDefined(); return button!; }
  function confirm() { const button = container.querySelector<HTMLButtonElement>("[data-confirm-action]"); expect(button).not.toBeNull(); return button!; }
  async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
  it.each(["Archive", "Restore", "Turn into task"])("requires explicit %s approval with original row/version", async label => {
    const target = { ...row, status: label === "Restore" ? "archived" : "inbox" };
    await mount({ state: { ...ready, items: [target] } }); await click(action(label));
    expect(write).not.toHaveBeenCalled(); expect(promote).not.toHaveBeenCalled();
    const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog?.textContent).toContain("Private idea (one)"); expect(dialog?.textContent).toContain("→");
    expect(browser.document.activeElement?.hasAttribute("data-cancel-action")).toBe(true); expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    const button = confirm(); await act(async () => { button.click(); button.click(); });
    expect(label === "Turn into task" ? promote : write).toHaveBeenCalledExactlyOnceWith(target);
  });
  it.each(["cancel", "escape", "overlay"])("%s does not write", async method => {
    await mount(); const trigger = action("Archive"); trigger.focus(); await click(trigger);
    if (method === "cancel") await click(container.querySelector<HTMLButtonElement>("[data-cancel-action]")!);
    else if (method === "escape") await act(async () => container.querySelector('[role="alertdialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    else await click(container.querySelector('[data-dialog-open="true"] > [aria-hidden="true"]') as HTMLButtonElement);
    expect(write).not.toHaveBeenCalled(); expect(promote).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); expect(browser.document.activeElement).toBe(trigger);
  });
  it.each(["list", "page", "size", "filter", "member", "pending", "capture", "loading", "error", "handler"])("revokes confirmation on %s", async change => {
    await mount(); await click(action("Archive")); const old = confirm();
    const extra = change === "list" ? { state: { ...ready, items: [{ ...row }] } } : change === "page" ? { state: { ...ready, pagination: { ...ready.pagination, page: 2 } } } : change === "size" ? { state: { ...ready, pagination: { ...ready.pagination, pageSize: 50 } } } : change === "filter" ? { status: "archived" } : change === "member" ? { createMemberId: "bob" } : change === "pending" ? { pending: true } : change === "capture" ? { capturePending: true } : change === "loading" ? { state: { kind: "loading" } } : change === "error" ? { state: { kind: "error", message: "Denied" } } : { onStatusChange: undefined };
    await mount(extra); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); await click(old); await mount(); expect(write).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("freezes the first same-tick action and prevents background navigation", async () => {
    const filter = vi.fn(); await mount({ onFilterChange: filter }); const archive = action("Archive"); const convert = action("Turn into task");
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Inbox status"]')!;
    await act(async () => { archive.click(); convert.click(); select.value = "archived"; select.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event); });
    expect(filter).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(promote).not.toHaveBeenCalled(); await click(confirm()); expect(write).toHaveBeenCalledExactlyOnceWith(row); expect(promote).not.toHaveBeenCalled();
  });
  it("retains drafts and prevents same-tick capture before persisting an intent", async () => {
    const create = vi.fn(); await mount({ onCreate: create }); const input = container.querySelector('textarea')!;
    const prop = Object.keys(input).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { (input as any)[prop].onChange({ currentTarget: { value: "Unsaved draft" } }); });
    const expectedDraft = { kind: "ready", draft: { kind: "text", content: "Unsaved draft", sourceUrl: "" } };
    expect(loadInboxDraft("alice")).toEqual(expectedDraft); expect(loadInboxIntent("alice")).toEqual({ kind: "empty" });
    const capture = action("Add to inbox"); const archive = action("Archive");
    await act(async () => { archive.click(); capture.click(); }); expect(create).not.toHaveBeenCalled(); expect(browser.localStorage.length).toBe(0); expect(loadInboxIntent("alice")).toEqual({ kind: "empty" }); expect(loadInboxDraft("alice")).toEqual(expectedDraft); expect(browser.sessionStorage.length).toBe(1);
    await click(container.querySelector<HTMLButtonElement>("[data-cancel-action]")!); expect(input.value).toBe("Unsaved draft");
  });
  it("revokes on unmount and gives Chinese promotion impact", async () => {
    await mount({ locale: createLocaleRuntime({ navigatorLanguage: "zh-CN" }) }); await click(action("转为任务"));
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("私人任务"); const old = confirm(); await act(async () => root.render(<p>Other route</p>)); await click(old); expect(promote).not.toHaveBeenCalled();
  });
  it("allows filtering outside confirmation (event harness control)", async () => {
    const filter = vi.fn(); await mount({ onFilterChange: filter });
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Inbox status"]')!;
    await act(async () => { select.value = "archived"; select.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event); });
    expect(filter).toHaveBeenCalledExactlyOnceWith("archived");
  });
  it("identifies content by ID, bounds excerpts and retains confirmation on unrelated updates", async () => {
    const target = { ...row, id: "two", content: "x".repeat(1000) };
    const state = { ...ready, items: [target] }; await mount({ state }); await click(action("Archive"));
    await mount({ state, actionError: "Earlier error" }); const text = container.querySelector('[role="alertdialog"]')?.textContent ?? "";
    expect(text).toContain(`${"x".repeat(160)}… (two)`); expect(text).not.toContain("x".repeat(161)); await click(confirm()); expect(write).toHaveBeenCalledExactlyOnceWith(target);
  });
  it("can convert archived content and revokes when the promotion handler disappears", async () => {
    const state = { ...ready, items: [{ ...row, status: "archived" }] }; await mount({ state }); await click(action("Turn into task"));
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("private task");
    const old = confirm(); await mount({ state, onPromoteTask: undefined }); await click(old); expect(promote).not.toHaveBeenCalled();
  });
  it("does not open a promoted task behind a pending decision in the same tick", async () => {
    const open = vi.fn(); await mount({ state: { ...ready, items: [row, { ...row, id: "two", status: "promoted", promotedTaskId: "task" }] }, onOpenTask: open });
    const archive = action("Archive"); const task = action("Open task"); await act(async () => { archive.click(); task.click(); });
    expect(open).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });

});
