// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRoute, WorkbenchReviewRoute } from "../../frontend/app";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("review period refresh", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let reviews: string[];
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    reviews = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/review")) reviews.push(url);
      return json({ items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const knowledgeKey = "memory-garden:review-period:v1:knowledge:member-a";
  const workbenchKey = "memory-garden:review-period:v1:workbench:member-a";
  // The period is a beUI radio group: each choice is a `role="radio"` control and its
  // visible label sits beside it in the same row, so the selection is read from
  // `aria-checked` rather than from a listbox trigger's text.
  const periodTrigger = () => container.querySelector("[data-knowledge-review] [role='radiogroup']") as HTMLElement;
  const periodRadio = (value: "daily" | "weekly") => periodTrigger().querySelector(`[data-review-period="${value}"]`) as HTMLButtonElement;
  const selectedPeriod = () => periodRadio("weekly").getAttribute("aria-checked") === "true" ? "weekly" : "daily";
  async function renderKnowledge() { await act(async () => root.render(<KnowledgeRoute locale={locale()} search="" memberId="member-a" />)); await flush(); }
  async function renderReview() { browser.history.replaceState({}, "", "/review"); await act(async () => root.render(<WorkbenchReviewRoute locale={locale()} memberId="member-a" />)); await flush(); }
  async function remount(render: () => Promise<void>) { await act(async () => root.unmount()); const { createRoot } = await import("react-dom/client"); root = createRoot(container); reviews = []; await render(); }
  async function choose(value: "daily" | "weekly") {
    const radio = periodRadio(value);
    const label = frontendText(locale(), value === "weekly" ? "KNOWLEDGE_REVIEW_WEEKLY" : "KNOWLEDGE_REVIEW_DAILY");
    expect(radio.closest("label")?.textContent).toBe(label);
    await act(async () => radio.click());
    await flush();
  }
  /** The workbench period choices are radios whose label sits beside the control. */
  async function click(label: string) {
    const target = ([...container.querySelectorAll("button")].find((item) => item.textContent === label)
      ?? [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((item) => item.closest("label")?.textContent === label)) as HTMLButtonElement;
    await act(async () => target.click());
    await flush();
  }

  it("reads the daily knowledge review again after returning from weekly", async () => {
    await renderKnowledge();
    await choose("weekly");
    await choose("daily");
    expect(reviews.at(-1)).toContain("period=daily");
  });

  it("keeps the weekly knowledge review after refresh without blocking leave", async () => {
    await renderKnowledge();
    await choose("weekly");
    expect(browser.sessionStorage.getItem(knowledgeKey)).toContain("weekly");
    expect(writeWorkspaceHistory("push", "/home")).toBe("committed");
    await remount(renderKnowledge);
    expect(selectedPeriod()).toBe("weekly");
    expect(reviews.some((url) => url.includes("period=weekly"))).toBe(true);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("keeps the knowledge review period on screen when the tab cannot record it", async () => {
    await renderKnowledge();
    const storage = browser.sessionStorage; const original = storage.setItem;
    Object.defineProperty(storage, "setItem", { configurable: true, writable: true, value(key: string, value: string) { if (String(key).includes("review-period")) throw new Error("full"); return original.call(storage, key, value); } });
    await choose("weekly");
    expect(selectedPeriod()).toBe("weekly");
    expect(container.textContent).toContain("could not record");
  });

  it("allows leave when the knowledge review period cannot be read and records only after discard", async () => {
    browser.sessionStorage.setItem(knowledgeKey, "{");
    await renderKnowledge();
    expect(container.textContent).toContain("can't be read");
    expect(selectedPeriod()).toBe("daily");
    expect(writeWorkspaceHistory("push", "/home")).toBe("committed");
    await click("Discard record");
    await choose("weekly");
    expect(browser.sessionStorage.getItem(knowledgeKey)).toContain("weekly");
  });

  it("keeps the selected knowledge review when an older period responds later", async () => {
    let releaseDaily: (response: Response) => void = () => {};
    const daily = new Promise<Response>((resolve) => { releaseDaily = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/knowledge/review")) {
        reviews.push(url);
        if (url.includes("period=weekly")) return json(reviewBody("weekly", "Weekly item"));
        return daily;
      }
      return json({ items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    await renderKnowledge();
    expect(selectedPeriod()).toBe("daily");
    await choose("weekly");
    expect(container.textContent).toContain("Weekly item");
    await act(async () => { releaseDaily(json(reviewBody("daily", "Daily item"))); });
    await flush();
    expect(selectedPeriod()).toBe("weekly");
    expect(container.textContent).toContain("Weekly item");
    expect(container.textContent).not.toContain("Daily item");
  });

  it("does not show knowledge from another period under the selected review", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/knowledge/review")) return json(reviewBody("daily", "Daily item"));
      return json({ items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    await renderKnowledge();
    await choose("weekly");
    expect(selectedPeriod()).toBe("weekly");
    expect(container.textContent).toContain("Unable to prepare the review list.");
    expect(container.textContent).not.toContain("Daily item");
  });

  it("keeps the weekly workbench review after refresh and reads that period", async () => {
    await renderReview();
    await click("Weekly");
    expect(browser.sessionStorage.getItem(workbenchKey)).toContain("weekly");
    expect(reviews.at(-1)).toContain("period=weekly");
    await remount(renderReview);
    const weekly = container.querySelector('[data-review-period="weekly"]') as HTMLButtonElement;
    expect(weekly.getAttribute("aria-checked")).toBe("true");
    expect(reviews.some((url) => url.includes("period=weekly"))).toBe(true);
    expect(writeWorkspaceHistory("push", "/home")).toBe("committed");
  });
});

function reviewBody(period: "daily" | "weekly", title: string) {
  return { period, from: "2026-10-04T00:00:00.000Z", to: period === "daily" ? "2026-10-05T00:00:00.000Z" : "2026-10-11T00:00:00.000Z", items: [{ knowledgeItemId: period, revisionId: "rev-1", title, publishedAt: "2026-10-04T00:00:00.000Z", lastVisitedAt: null, reason: "new", favorite: false }] };
}
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
