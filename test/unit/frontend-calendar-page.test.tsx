// @vitest-environment node
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { localCalendarTime } from "../../frontend/lib/calendar-query";
import { CalendarPage } from "../../frontend/pages/calendar-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("Calendar page", () => {
  it("renders events, controls and no undefined values", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [{ id: "event-1", updatedAt: "2026-09-28T00:00:00.000Z", clientKey: "event-1", kind: "focus", title: "深度工作", description: "完成 C3", startsAt: "2026-09-09T09:00:00.000Z", endsAt: "2026-09-09T10:00:00.000Z", timezone: "UTC", allDay: false, status: "scheduled", taskId: null, projectId: null }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} onCreate={vi.fn()} onCancel={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "CALENDAR_TITLE"));
    expect(html).toContain(frontendText(locale, "CALENDAR_CREATE"));
    expect(html).toContain(frontendText(locale, "CALENDAR_FOCUS"));
    expect(html).toContain(frontendText(locale, "CALENDAR_COLUMN_TITLE"));
    expect(html).toContain("深度工作");
    expect(html).toContain(`aria-label="${frontendText(locale, "CALENDAR_CANCEL")}"`);
    expect(html).not.toContain("undefined");
  });

  it("renders the desktop pager with the server totals and retires the scroll label", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 2, pageSize: 20, total: 43, totalPages: 3 } }} onCreate={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain("data-pagination-desktop");
    expect(html).toContain("data-pagination-mobile");
    expect(html).toContain(frontendText(locale, "PAGINATION_TOTAL"));
    expect(html).toContain(frontendText(locale, "PAGINATION_ROWS_PER_PAGE"));
    expect(html).toContain("21–40");
    expect(html).not.toContain(frontendText(locale, "CALENDAR_LOAD_MORE"));
  });

  it("leaves the pager out when the route supplies no page controls", () => {
    const locale = createLocaleRuntime();
    const html = renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 43, totalPages: 3 } }} />);
    expect(html).not.toContain("data-pagination-desktop");
    expect(html).toContain(frontendText(locale, "CALENDAR_EMPTY"));
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "CALENDAR_RETRY"));
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [] }} />)).toContain(frontendText(locale, "CALENDAR_EMPTY"));
  });

  it("keeps one titled header, its glyph and the toolbar mounted through first load and read failure", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const title = frontendText(locale, "CALENDAR_TITLE");
    const range = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" };
    for (const state of [{ kind: "loading" } as const, { kind: "error", message: "Unable" } as const]) {
      const html = renderToStaticMarkup(<CalendarPage locale={locale} state={state} onRetry={vi.fn()} onCreate={vi.fn()} range={range} onRangeChange={vi.fn()} />);
      expect((html.match(/<h1/g) ?? []).length, JSON.stringify(state)).toBe(1);
      expect(html).toContain(`>${title}</h1>`);
      // The leading glyph stays outside the heading so the page exposes one clean name.
      expect(html.indexOf('data-icon="calendar"')).toBeLessThan(html.indexOf("<h1"));
      // The page-level create action and the existing range filter survive the read state. The
      // range fields live in the popover's portal, so the trigger is what static markup can address.
      expect(html).toContain("data-calendar-create-open");
      expect(html).toContain("data-calendar-range-trigger");
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).not.toContain("<select");
    }
  });
});

describe("Calendar create dialog", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const ready = { kind: "ready" as const, items: [] };
  const intentKey = "memory-garden:calendar-create:v1:alice";
  const unresolved = JSON.stringify({ version: 1, memberId: "alice", intent: { id: "intent-1", clientKey: "client-1", title: "Durable event", startsAt: "2026-10-03T09:00:00.000Z", endsAt: "2026-10-03T10:00:00.000Z", timezone: "UTC" }, acknowledged: false });
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/calendar" });
    for (const [name, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(name, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  const dialog = () => document.querySelector("[data-calendar-create-dialog]");
  const trigger = () => container.querySelector<HTMLButtonElement>("[data-calendar-create-open]")!;
  const field = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${frontendText(locale, label)}"]`)!;
  const submit = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === frontendText(locale, "CALENDAR_CREATE"))!;
  async function mount(props: Record<string, unknown> = {}) { await act(async () => root.render(<CalendarPage locale={locale} state={ready} createMemberId="alice" {...props} />)); }
  async function click(node: HTMLElement) { await act(async () => node.click()); }
  async function type(label: string, value: string) {
    const node = field(label); const key = Object.keys(node).find(candidate => candidate.startsWith("__reactProps$"))!;
    await act(async () => { (node as unknown as Record<string, { onChange: (event: unknown) => void }>)[key].onChange(({ currentTarget: { value }, target: { value } }) as never); });
  }
  it("stays closed on a plain visit, opens from the add control, and closes on cancel or Escape", async () => {
    await mount();
    expect(dialog()).toBeNull();
    const open = trigger();
    expect(open.getAttribute("aria-haspopup")).toBe("dialog"); expect(open.getAttribute("aria-expanded")).toBe("false"); expect(open.disabled).toBe(false);
    await click(open);
    expect(dialog()?.getAttribute("role")).toBe("dialog");
    expect(dialog()?.textContent).toContain(frontendText(locale, "CALENDAR_CREATE_TITLE"));
    expect(field("CALENDAR_TITLE_FIELD")).not.toBeNull(); expect(open.getAttribute("aria-expanded")).toBe("true");
    await click(document.querySelector<HTMLButtonElement>("[data-calendar-create-cancel]")!);
    expect(dialog()).toBeNull();
    await click(trigger());
    expect(dialog()).not.toBeNull(); expect(field("CALENDAR_TITLE_FIELD")).not.toBeNull();
    await act(async () => dialog()!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect(dialog()).toBeNull();
  });
  it("auto-opens only for an unresolved stored record and closes once it resolves", async () => {
    browser.sessionStorage.setItem(intentKey, unresolved);
    const create = vi.fn().mockResolvedValue({});
    await mount({ onCreate: create, onCreateReadback: async () => true });
    expect(dialog()).not.toBeNull();
    expect(field("CALENDAR_TITLE_FIELD").disabled).toBe(true);
    await click(document.querySelector<HTMLButtonElement>("[data-create-retry]")!);
    await act(async () => { await vi.waitFor(() => expect(dialog()).toBeNull()); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(browser.sessionStorage.getItem(intentKey)).toBeNull();
    expect(dialog()).toBeNull();
  });
  it("opens the range popover, keeps local-time validation and applies the exact instants", async () => {
    const change = vi.fn();
    const range = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" };
    await mount({ range, onRangeChange: change });
    const open = container.querySelector<HTMLButtonElement>("[data-calendar-range-trigger]")!;
    expect(open.getAttribute("aria-haspopup")).toBe("dialog");
    expect(open.getAttribute("aria-expanded")).toBe("false");
    await click(open);
    expect(document.querySelector("[data-calendar-range-panel]")?.getAttribute("role")).toBe("dialog");
    expect(document.querySelector("[data-calendar-range-panel]")?.getAttribute("aria-labelledby")).toBe(open.id);
    expect(document.querySelector("[data-calendar-range-filter]")?.textContent).toContain(frontendText(locale, "CALENDAR_RANGE_HINT"));
    expect(document.querySelector("[data-calendar-range-filter]")?.textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(field("CALENDAR_RANGE_FROM").type).toBe("datetime-local");
    expect(field("CALENDAR_RANGE_TO").type).toBe("datetime-local");
    expect(field("CALENDAR_RANGE_FROM").value).toBe(localCalendarTime(range.from));
    // Equal instants are not a range: the shared copy appears and Apply is blocked.
    await type("CALENDAR_RANGE_TO", localCalendarTime(range.from));
    expect(document.querySelector('[data-calendar-range-panel] [role="alert"]')?.textContent).toBe(frontendText(locale, "CALENDAR_RANGE_INVALID"));
    expect(document.querySelector<HTMLButtonElement>("[data-calendar-range-apply]")!.disabled).toBe(true);
    // More than 31 days is the same refusal.
    await type("CALENDAR_RANGE_TO", localCalendarTime(new Date(Date.parse(range.from) + 32 * 86_400_000).toISOString()));
    expect(document.querySelector('[data-calendar-range-panel] [role="alert"]')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>("[data-calendar-range-apply]")!.disabled).toBe(true);
    // A local-time draft inside the cap applies as the canonical instants.
    const applied = new Date(Date.parse(range.from) + 3_600_000).toISOString();
    await type("CALENDAR_RANGE_TO", localCalendarTime(applied));
    expect(document.querySelector('[data-calendar-range-panel] [role="alert"]')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>("[data-calendar-range-apply]")!.disabled).toBe(false);
    await click(document.querySelector<HTMLButtonElement>("[data-calendar-range-apply]")!);
    expect(change).toHaveBeenCalledWith({ from: range.from, to: applied });
    expect(document.querySelector("[data-calendar-range-panel]")).toBeNull();
    expect(open.getAttribute("aria-expanded")).toBe("false");
    // Escape closes the portalled panel too.
    await click(open);
    expect(document.querySelector("[data-calendar-range-panel]")).not.toBeNull();
    await act(async () => { document.querySelector("[data-calendar-range-panel]")!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event); });
    expect(document.querySelector("[data-calendar-range-panel]")).toBeNull();
    expect(open.getAttribute("aria-expanded")).toBe("false");
  });
  it("posts exactly one create from inside the dialog and closes it on success", async () => {
    const create = vi.fn().mockResolvedValue({});
    await mount({ onCreate: create, onCreateReadback: async () => true });
    await click(trigger());
    await type("CALENDAR_TITLE_FIELD", "Ship the calendar dialog");
    await type("CALENDAR_START_FIELD", "2026-10-03T09:00");
    await type("CALENDAR_END_FIELD", "2026-10-03T10:00");
    await click(submit());
    await act(async () => { await vi.waitFor(() => expect(dialog()).toBeNull()); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({ title: "Ship the calendar dialog" });
    expect(dialog()).toBeNull(); expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});
