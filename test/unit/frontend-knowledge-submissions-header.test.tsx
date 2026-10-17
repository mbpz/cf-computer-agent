// @vitest-environment node
import React, { act, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRoute, MySubmissionsRoute } from "../../frontend/app";
import { KnowledgePage } from "../../frontend/pages/knowledge-page";
import { MySubmissionsPage } from "../../frontend/pages/my-submissions-page";
import { SearchPage } from "../../frontend/pages/search-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// Static import cannot work here: happy-dom must load after the hoisted `node:vm` mock and the InertVmScript class are initialized.
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const stamp = "2026-10-04T00:00:00.000Z";
const knowledgeReady = { kind: "ready" as const, items: [], pagination: { page: 1 as const, pageSize: 20 as const, total: 0, totalPages: 0 } };
const submissionsReady = { kind: "ready" as const, items: [], pagination: { page: 1, pageSize: 20 as const, total: 0, totalPages: 0 } };
const headingCount = (html: string) => (html.match(/<h1/g) ?? []).length;

describe("migrated list page headers and filters", () => {
  it("renders exactly one titled heading per page", () => {
    const knowledge = renderToStaticMarkup(<KnowledgePage locale={locale} state={knowledgeReady} review={{ kind: "ready", data: { items: [] } }} />);
    const submissions = renderToStaticMarkup(<MySubmissionsPage locale={locale} state={submissionsReady} />);
    const search = renderToStaticMarkup(<SearchPage locale={locale} state={{ kind: "ready", degraded: false, results: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} />);
    expect(headingCount(knowledge)).toBe(1);
    expect(knowledge).toContain(frontendText(locale, "KNOWLEDGE_TITLE"));
    expect(submissions).toContain(frontendText(locale, "SUBMISSIONS_TITLE"));
    expect(search).toContain(frontendText(locale, "SEARCH_TITLE"));
    expect(headingCount(submissions)).toBe(1);
    expect(headingCount(search)).toBe(1);
    expect(`${knowledge}${submissions}${search}`).not.toMatch(/\bundefined\b/u);
  });

  it("carries the review period on the shared beUI filter, not a native select", () => {
    const html = renderToStaticMarkup(<KnowledgePage locale={locale} state={knowledgeReady} review={{ kind: "ready", data: { items: [] } }} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(frontendText(locale, "KNOWLEDGE_REVIEW_PERIOD"));
    expect(html).toContain(frontendText(locale, "KNOWLEDGE_REVIEW_DAILY"));
    expect(html).toContain(frontendText(locale, "KNOWLEDGE_REVIEW_WEEKLY"));
    expect(html).not.toContain('<option value="daily"');
  });

  it("renders location filters as removable applied conditions on knowledge", () => {
    const html = renderToStaticMarkup(<KnowledgePage locale={locale} state={knowledgeReady} filters={{ tagId: "cf", kind: "markdown" }} onFilterChange={vi.fn()} />);
    expect(html).toContain("data-applied-filters");
    expect(html).toContain(`${frontendText(locale, "KNOWLEDGE_FILTER_TAG")}: cf`);
    expect(html).toContain(`${frontendText(locale, "KNOWLEDGE_FILTER_KIND")}: markdown`);
    expect(html).toContain("data-filters-clear");
    expect(renderToStaticMarkup(<KnowledgePage locale={locale} state={knowledgeReady} />)).not.toContain("data-applied-filters");
  });

  it("renders an active submissions range as removable applied conditions without chips when invalid", () => {
    const active = renderToStaticMarkup(<MySubmissionsPage locale={locale} state={submissionsReady} range={{ from: "2026-10-01", to: "2026-10-10", invalid: false }} />);
    expect(active).toContain("data-applied-filters");
    expect(active).toContain(`${frontendText(locale, "CALENDAR_RANGE_FROM")}: 2026-10-01`);
    expect(active).toContain(`${frontendText(locale, "CALENDAR_RANGE_TO")}: 2026-10-10`);
    expect(active).toContain("data-filters-clear");
    const invalid = renderToStaticMarkup(<MySubmissionsPage locale={locale} state={submissionsReady} range={{ from: "2026-10-10", to: "2026-10-01", invalid: true }} />);
    expect(invalid).not.toContain("data-applied-filters");
    expect(renderToStaticMarkup(<MySubmissionsPage locale={locale} state={submissionsReady} />)).not.toContain("data-applied-filters");
  });
});

describe("list headers survive first load and read failure", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = browser.document.createElement("div"); browser.document.body.append(element);
    container = element as unknown as HTMLElement;
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function remount(node: ReactNode) { await act(async () => root.unmount()); const { createRoot } = await import("react-dom/client"); root = createRoot(container); await act(async () => root.render(node)); }
  async function click(selector: string) { const target = container.querySelector(selector) as HTMLButtonElement | null; expect(target).not.toBeNull(); await act(async () => target!.click()); }

  it("keeps the knowledge header through the first load and a list read failure", async () => {
    vi.stubGlobal("fetch", () => Promise.withResolvers<Response>().promise);
    await act(async () => root.render(<KnowledgeRoute locale={locale} search="" memberId="member-a" />));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe(frontendText(locale, "KNOWLEDGE_TITLE"));
    expect(container.querySelector('[data-page-state="loading"]')).not.toBeNull();

    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), "https://app.test").pathname;
      if (pathname === "/api/knowledge") return Response.json({ error: { code: "INTERNAL", message: "boom" } }, { status: 500 });
      if (pathname === "/api/knowledge/review") return Response.json({ period: "daily", from: stamp, to: stamp, items: [] });
      return Response.json({ items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    await remount(<KnowledgeRoute locale={locale} search="" memberId="member-a" />);
    await flush();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe(frontendText(locale, "KNOWLEDGE_TITLE"));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("keeps the submissions header through the first load and a list read failure", async () => {
    vi.stubGlobal("fetch", () => Promise.withResolvers<Response>().promise);
    await act(async () => root.render(<MySubmissionsRoute locale={locale} search="" />));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe(frontendText(locale, "SUBMISSIONS_TITLE"));
    expect(container.querySelector('[data-page-state="loading"]')).not.toBeNull();

    vi.stubGlobal("fetch", async () => Response.json({ error: { code: "INTERNAL", message: "boom" } }, { status: 500 }));
    await remount(<MySubmissionsRoute locale={locale} search="" />);
    await flush();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe(frontendText(locale, "SUBMISSIONS_TITLE"));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("removes a knowledge condition and clears all back to the empty query", async () => {
    const onFilterChange = vi.fn();
    await remount(<KnowledgePage locale={locale} state={knowledgeReady} filters={{ tagId: "cf", kind: "markdown" }} onFilterChange={onFilterChange} />);
    await click(`[aria-label="${frontendText(locale, "COMMON_CLEAR_FILTERS")}: ${frontendText(locale, "KNOWLEDGE_FILTER_TAG")}: cf"]`);
    expect(onFilterChange).toHaveBeenCalledWith({ kind: "markdown" });
    await click("[data-filters-clear]");
    expect(onFilterChange).toHaveBeenLastCalledWith({});
  });

  it("removes a submissions range condition by rewriting the location", async () => {
    browser.history.replaceState({}, "", "/my-submissions?from=2026-10-01&to=2026-10-10");
    await remount(<MySubmissionsPage locale={locale} state={submissionsReady} range={{ from: "2026-10-01", to: "2026-10-10", invalid: false }} />);
    await click(`[aria-label="${frontendText(locale, "COMMON_CLEAR_FILTERS")}: ${frontendText(locale, "CALENDAR_RANGE_FROM")}: 2026-10-01"]`);
    expect(browser.location.search).toBe("?to=2026-10-10");
    await click("[data-filters-clear]");
    expect(browser.location.search).toBe("");
  });

  it("applies a day range picked on the beUI calendar", async () => {
    browser.history.replaceState({}, "", "/my-submissions");
    await remount(<MySubmissionsPage locale={locale} state={submissionsReady} />);
    const trigger = container.querySelector<HTMLButtonElement>("[data-submissions-range-filter] button[aria-expanded]");
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute("aria-label")).toBe(`${frontendText(locale, "CALENDAR_RANGE_FROM")} – ${frontendText(locale, "CALENDAR_RANGE_TO")}`);
    await act(async () => trigger!.click());
    const days = [...container.querySelectorAll<HTMLButtonElement>('[data-submissions-range-filter] [role="grid"] button:not([disabled])')];
    expect(days.length).toBeGreaterThan(1);
    await act(async () => days[0].click());
    await act(async () => days[1].click());
    const stated = [...(trigger!.textContent ?? "").matchAll(/\d{4}-\d{2}-\d{2}/gu)].map((match) => match[0]);
    expect(stated).toHaveLength(2);
    const apply = [...container.querySelectorAll<HTMLButtonElement>("[data-submissions-range-filter] button")].find((node) => node.textContent === frontendText(locale, "CALENDAR_RANGE_APPLY"));
    expect(apply).toBeTruthy();
    await act(async () => apply!.click());
    expect(browser.location.search).toBe(`?from=${stated[0]}&to=${stated[1]}`);
  });
});

async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
