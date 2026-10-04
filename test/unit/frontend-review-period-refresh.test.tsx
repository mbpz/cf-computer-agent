// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRoute, WorkbenchReviewRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
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
  const period = () => container.querySelector("[data-knowledge-review] select") as HTMLSelectElement;
  async function renderKnowledge() { await act(async () => root.render(<KnowledgeRoute locale={locale()} search="" memberId="member-a" />)); await flush(); }
  async function renderReview() { browser.history.replaceState({}, "", "/review"); await act(async () => root.render(<WorkbenchReviewRoute locale={locale()} memberId="member-a" />)); await flush(); }
  async function remount(render: () => Promise<void>) { await act(async () => root.unmount()); const { createRoot } = await import("react-dom/client"); root = createRoot(container); reviews = []; await render(); }
  async function choose(value: string) { const el = period(); await act(async () => { el.value = value; el.dispatchEvent(new browser.Event("change", { bubbles: true })); }); await flush(); }
  async function click(label: string) { const target = [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; await act(async () => target.click()); await flush(); }

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
    expect(period().value).toBe("weekly");
    expect(reviews.some((url) => url.includes("period=weekly"))).toBe(true);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("keeps the knowledge review period on screen when the tab cannot record it", async () => {
    await renderKnowledge();
    const storage = browser.sessionStorage; const original = storage.setItem;
    Object.defineProperty(storage, "setItem", { configurable: true, writable: true, value(key: string, value: string) { if (String(key).includes("review-period")) throw new Error("full"); return original.call(storage, key, value); } });
    await choose("weekly");
    expect(period().value).toBe("weekly");
    expect(container.textContent).toContain("could not record");
  });

  it("allows leave when the knowledge review period cannot be read and records only after discard", async () => {
    browser.sessionStorage.setItem(knowledgeKey, "{");
    await renderKnowledge();
    expect(container.textContent).toContain("can't be read");
    expect(period().value).toBe("daily");
    expect(writeWorkspaceHistory("push", "/home")).toBe("committed");
    await click("Discard record");
    await choose("weekly");
    expect(browser.sessionStorage.getItem(knowledgeKey)).toContain("weekly");
  });

  it("keeps the weekly workbench review after refresh and reads that period", async () => {
    await renderReview();
    await click("Weekly");
    expect(browser.sessionStorage.getItem(workbenchKey)).toContain("weekly");
    expect(reviews.at(-1)).toContain("period=weekly");
    await remount(renderReview);
    const weekly = [...container.querySelectorAll("button")].find((item) => item.textContent === "Weekly") as HTMLButtonElement;
    expect(weekly.getAttribute("aria-pressed")).toBe("true");
    expect(reviews.some((url) => url.includes("period=weekly"))).toBe(true);
    expect(writeWorkspaceHistory("push", "/home")).toBe("committed");
  });
});

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
