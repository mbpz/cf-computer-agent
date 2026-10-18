// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { NotificationsPage } from "../../frontend/pages/notifications/notifications-page";
import { SearchPage } from "../../frontend/pages/search-page";
import { stubListViewport } from "../helpers/list-viewport";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// Static import cannot work here: happy-dom must load after the hoisted `node:vm` mock and the InertVmScript class are initialized.
const { Window } = await import("happy-dom");

/** React's own props for a node, the way the other happy-dom suites drive a change without native events. */
function reactProps<T>(element: HTMLElement): T { return (element as unknown as Record<string, T>)[Object.keys(element).find((key) => key.startsWith("__reactProps$"))!]!; }

/**
 * Below the shell's `lg` edge a page's filter row moves behind one bottom sheet
 * (`FilterDisclosure`): the row's long wrapping line becomes a single 44px
 * disclosure, the panel holds the same controls, and the applied-condition chips
 * stay on the page so the filter state is never behind the panel.
 */
describe("mobile filter surfaces", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const en = createLocaleRuntime({ navigatorLanguage: "en" });

  beforeEach(() => {
    browser = new Window({ url: "https://app.test/notifications" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, HTMLElement: browser.HTMLElement, navigator: browser.navigator, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    stubListViewport(browser, "mobile");
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const settle = async () => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 0); await promise; };
  const panel = () => browser.document.querySelector<HTMLElement>('[role="dialog"]');
  const trigger = () => container.querySelector<HTMLButtonElement>("[data-filter-disclosure-trigger]")!;
  const chips = () => container.querySelector<HTMLElement>("[data-applied-filters]");
  const listboxTriggers = (scope: ParentNode) => [...scope.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]')];
  const clickNode = async (node: HTMLElement) => { await act(async () => { node.click(); await settle(); }); };
  const changeInput = async (node: HTMLInputElement, value: string) => {
    await act(async () => { reactProps<{ onChange: (event: unknown) => void }>(node).onChange(({ currentTarget: { value }, target: { value } }) as never); await settle(); });
  };
  const pressEscape = async () => {
    const target = browser.document.activeElement ?? panel()!;
    await act(async () => { target.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event); await settle(); });
  };

  const notificationState = { kind: "ready" as const, items: [], pagination: { page: 1, pageSize: 20 as const, total: 0, totalPages: 0 } };
  const renderNotifications = async (props: Partial<React.ComponentProps<typeof NotificationsPage>> = {}) => {
    const onFilterChange = vi.fn();
    await act(async () => root.render(<NotificationsPage locale={en} state={notificationState} summary={{ unread: 0 }} filters={{}} onRetry={vi.fn()} onFilterChange={onFilterChange} onLoadMore={vi.fn()} onMarkRead={vi.fn()} onMarkVisibleRead={vi.fn()} onOpen={vi.fn()} {...props} />));
    return onFilterChange;
  };

  it("keeps the desktop row exactly where it was, with no disclosure at all", async () => {
    stubListViewport(browser, "desktop");
    await renderNotifications();
    expect(trigger()).toBeNull();
    expect(container.querySelector("[data-filter-disclosure]")).toBeNull();
    const [first, second] = listboxTriggers(container);
    let row: HTMLElement | null = first!.parentElement;
    while (row && !row.contains(second!)) row = row.parentElement;
    expect(row?.className).toBe("flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4");
  });

  it("opens one labelled panel from the disclosure, focuses it, and closes on Escape back to the trigger", async () => {
    await renderNotifications();
    const disclosure = trigger();
    expect(disclosure.textContent).toContain(frontendText(en, "COMMON_FILTERS"));
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure.getAttribute("aria-haspopup")).toBe("dialog");
    expect(panel()).toBeNull();

    disclosure.focus();
    await clickNode(disclosure);
    const dialog = panel()!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // The panel is named by its visible heading, and it is the one panel contract:
    // the sheet's hooks and focus scope travel with it.
    const heading = dialog.querySelector("h2")!;
    expect(heading.textContent).toBe(frontendText(en, "COMMON_FILTERS"));
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(dialog.querySelector('[data-sheet-content][data-side="bottom"]')).not.toBeNull();
    expect(dialog.querySelector('[data-focus-scope="true"]')).not.toBeNull();
    // Every control of the row is inside the panel, and focus landed in it.
    expect(listboxTriggers(dialog)).toHaveLength(2);
    expect(listboxTriggers(container)).toHaveLength(0);
    expect(dialog.contains(browser.document.activeElement)).toBe(true);
    expect(browser.document.body.style.position).toBe("fixed");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    await pressEscape();
    expect(panel()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    // Focus returns to the disclosure, and the scroll lock is released.
    expect(browser.document.activeElement).toBe(trigger());
    expect(browser.document.body.style.position).toBe("");
  });

  it("keeps the applied conditions outside the panel and clearable while it is open", async () => {
    const onFilterChange = await renderNotifications({ filters: { read: "unread" } });
    const applied = chips()!;
    expect(applied.textContent).toContain(`${frontendText(en, "NOTIFICATIONS_READ_FILTER")}: ${frontendText(en, "NOTIFICATIONS_FILTER_UNREAD")}`);

    await clickNode(trigger());
    const dialog = panel()!;
    expect(dialog.contains(applied)).toBe(false);
    expect(applied.isConnected).toBe(true);

    const remove = applied.querySelector<HTMLButtonElement>('button[aria-label^="Clear all"]')!;
    await clickNode(remove);
    expect(onFilterChange).toHaveBeenCalledWith({ read: undefined });
    expect(panel()).not.toBeNull();
  });

  it("submits the search row from inside the panel and closes it, keeping a rejected draft open on its alert", async () => {
    const onFilterChange = vi.fn();
    const state = { kind: "ready" as const, degraded: false, results: [], pagination: { page: 1, pageSize: 20 as const, total: 0, totalPages: 0 } };
    await act(async () => root.render(<SearchPage locale={en} state={state} query="" filters={{ tagIds: [] }} onFilterChange={onFilterChange} onRetry={vi.fn()} />));

    await clickNode(trigger());
    const dialog = panel()!;
    const author = dialog.querySelector<HTMLInputElement>("[data-search-filter-author]")!;
    await changeInput(author, "not an id");
    await clickNode(dialog.querySelector<HTMLButtonElement>("[data-search-filters-apply]")!);
    // The form still owns the submit from inside the sheet, and a rejected draft
    // keeps the panel where its alert is.
    expect(panel()).not.toBeNull();
    expect(panel()!.textContent).toContain(frontendText(en, "SEARCH_FILTER_AUTHOR_INVALID"));
    expect(onFilterChange).not.toHaveBeenCalled();

    await changeInput(author, "member-1");
    await clickNode(panel()!.querySelector<HTMLButtonElement>("[data-search-filters-apply]")!);
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ authorId: "member-1" }));
    expect(panel()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});
