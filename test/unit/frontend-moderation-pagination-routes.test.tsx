// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAssetsRoute, AdminDuplicateRoute, ReviewQueueRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("moderation numbered routes", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/admin/submissions?page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("refreshes review actions through the current generation and replaces an empty page", async () => {
    const gets: string[] = []; const replace = vi.spyOn(browser.history, "replaceState");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return json({ submission: {} }); gets.push(url); return gets.length === 1 ? numbered([{ id: "review-1", title: "Review", submitterId: "m1", status: "review_pending" }], 2, 21) : numbered([], url.includes("page=2") ? 2 : 1, 0); });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await flush();
    expect(gets.map((url) => new URL(url, "https://app.test").searchParams.get("page") || "1")).toEqual(["2", "2", "1"]);
    expect(replace).toHaveBeenCalledTimes(1); expect(browser.location.search).not.toContain("page=2");
  });

  it("preserves the asset filter while retry refresh backs up once", async () => {
    browser.history.replaceState({}, "", "/admin/assets?status=failed_retryable&page=2"); const gets: string[] = []; const replace = vi.spyOn(browser.history, "replaceState");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return json({}); gets.push(url); return gets.length === 1 ? numbered([{ asset: { id: "asset-1", originalName: "broken.pdf" }, job: { status: "failed_retryable" } }], 2, 21) : numbered([], url.includes("page=2") ? 2 : 1, 0); });
    await act(async () => root.render(<AdminAssetsRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Retry"); await flush();
    expect(gets).toHaveLength(3); expect(gets.every((url) => url.includes("status=failed_retryable"))).toBe(true); expect(replace).toHaveBeenCalledTimes(1); expect(browser.location.search).toContain("status=failed_retryable"); expect(browser.location.search).not.toContain("page=2");
  });

  it("does not expose cursor loading after a duplicate decision and corrects total zero", async () => {
    browser.history.replaceState({}, "", "/admin/duplicates?page=2"); const gets: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return json({ candidate: duplicate("associate") }); gets.push(url); return gets.length === 1 ? numbered([duplicate("pending")], 2, 21) : numbered([], url.includes("page=2") ? 2 : 1, 0); });
    await act(async () => root.render(<AdminDuplicateRoute locale={locale()} search={browser.location.search} />)); await flush();
    expect(container.textContent).not.toContain("Load more"); await clickButton("Associate"); await flush();
    expect(gets).toHaveLength(3); expect(browser.location.search).not.toContain("page=2");
  });

  async function clickButton(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label)) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); }
});

function numbered(items: unknown[], page: number, total: number): Response { return json({ items, pagination: { page, pageSize: 20, total, totalPages: total === 0 ? 0 : Math.ceil(total / 20) } }); }
function duplicate(decision: "pending" | "associate") { return { submissionId: "dup-1", canonicalSubmissionId: "dup-0", canonicalSourceId: "src-0", canonicalSourceVersionId: "ver-0", submissionTitle: "Duplicate", canonicalTitle: "Canonical", decision }; }
function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
