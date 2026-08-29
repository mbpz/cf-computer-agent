// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("private task numbered route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/tasks?status=doing&page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("restores filters and page on popstate while aborting the stale request", async () => {
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); requests.push({ url, signal: init?.signal ?? undefined }); return taskPage(url); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    expect(requests[0]?.url).toContain("status=doing"); expect(requests[0]?.url).toContain("page=2");
    await act(async () => { browser.history.pushState({}, "", "/tasks?priority=high&pageSize=50"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(requests[0]?.signal?.aborted).toBe(true); expect(requests.at(-1)?.url).toContain("priority=high"); expect(requests.at(-1)?.url).toContain("pageSize=50");
  });

  it("gives every task action a unique accessible name with an id fallback", async () => {
    browser.history.replaceState({}, "", "/tasks");
    const alpha = createTask("Alpha");
    const beta = { ...createTask("Beta"), status: "done" as const };
    const blank = { ...createTask(""), id: "task-blank" };
    vi.stubGlobal("fetch", async () => Response.json({ items: [alpha, beta, blank], pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 } }));
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    const names = [...container.querySelectorAll("button[aria-label]")].map((button) => button.getAttribute("aria-label")).filter((name) => /^(Complete|Reopen|Delete):/u.test(name ?? ""));
    expect(names).toEqual(expect.arrayContaining(["Complete: Alpha", "Delete: Alpha", "Reopen: Beta", "Delete: Beta", "Complete: task-blank", "Delete: task-blank"]));
    expect(new Set(names).size).toBe(names.length);
  });

  it("replaces an empty mutation page with the preceding page once", async () => {
    const urls: string[] = []; let deleted = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); urls.push(url); if (init?.method === "DELETE") { deleted = true; return new Response(null, { status: 204 }); } return taskPage(url, deleted); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    const button = container.querySelector("button.bg-destructive") as HTMLButtonElement; expect(button).toBeTruthy();
    await act(async () => button.click()); await flush();
    expect(browser.location.search).toContain("status=doing"); expect(browser.location.search).not.toContain("page=2");
    expect(urls.filter((url) => url.startsWith("/api/tasks?")).length).toBe(3);
  });

  it.each([
    ["Status", "blocked", "status"],
    ["Priority", "high", "priority"],
    ["Tag", "urgent", "tag"],
    ["Due", "today", "due"],
    ["Search tasks", "alpha", "q"],
  ])("synchronizes %s and resets the page", async (label, value, key) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => taskPage(String(input)));
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    const control = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLSelectElement;
    await change(control, value); await flush();
    expect(browser.location.search).toContain(`${key}=${value}`);
    expect(browser.location.search).not.toContain("page=2");
  });

  it("resets page for pageSize with one history transition", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => taskPage(String(input)));
    const pushState = vi.spyOn(browser.history, "pushState");
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await change(container.querySelector('[aria-label="Rows per page"]') as HTMLSelectElement, "50"); await flush();
    expect(browser.location.search).toBe("?status=doing&pageSize=50");
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("retries an initial failure with a new request", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => ++gets === 1 ? errorResponse() : taskPage(String(input)));
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    expect(container.textContent).toContain("Unable to load");
    await clickButton("Try search again"); await flush(); await flush();
    expect(gets).toBe(2); expect(container.textContent).toContain("Alpha");
  });

  it("preserves the current list while retrying a local failure", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { gets += 1; if (gets === 2) return errorResponse(); return taskPage(String(input), false, gets === 3 ? "Beta" : "Alpha"); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Page 1"); await flush();
    expect(container.textContent).toContain("Alpha"); expect(container.querySelector('[role="alert"]')).toBeTruthy();
    await clickButton("Try search again"); await flush(); await flush();
    expect(gets).toBe(3); expect(container.textContent).toContain("Beta");
  });

  it("does not let a mutation refresh overwrite a newer query", async () => {
    let gets = 0; let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return mutation;
      gets += 1; return taskPage(String(input), false, gets === 1 ? "Alpha" : "Latest");
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await act(async () => (container.querySelector('[aria-label="Complete: Alpha"]') as HTMLButtonElement).click());
    await change(container.querySelector('[aria-label="Priority"]') as HTMLSelectElement, "high"); await flush();
    await act(async () => resolveMutation(Response.json(createTask("Alpha")))); await flush(); await flush();
    expect(gets).toBe(2); expect(container.textContent).toContain("Latest");
  });

  it("preserves the list and reports a local error when refresh after mutation fails", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json(createTask("Alpha"));
      gets += 1; return gets === 1 ? taskPage(String(input)) : errorResponse();
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Complete: Alpha"); await flush();
    expect(container.textContent).toContain("Alpha"); expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain("mutation failed");
  });

  async function clickButton(name: string) {
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name) as HTMLButtonElement;
    expect(button).toBeTruthy(); await act(async () => button.click());
  }
});

function createTask(title: string) { return { id: `task-${title.toLowerCase()}`, title, notes: "", status: "doing", progress: 10, priority: "high", dueAt: null, completedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }; }
function taskPage(url: string, empty = false, title = "Alpha"): Response { const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20"); const items = empty && page === 2 ? [] : [createTask(title)]; const total = empty || page === 1 ? 1 : 21; return Response.json({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }); }
function errorResponse(): Response { return Response.json({ error: { code: "TEST_ERROR", message: "failed", retryable: true } }, { status: 500 }); }
async function change(control: HTMLInputElement | HTMLSelectElement, value: string) { await act(async () => {
  if (control.tagName === "INPUT") {
    control.value = value;
    const reactPropsKey = Object.keys(control).find((key) => key.startsWith("__reactProps$"));
    const reactProps = reactPropsKey ? (control as unknown as Record<string, { onChange?: (event: { currentTarget: HTMLInputElement }) => void }>)[reactPropsKey] : undefined;
    reactProps?.onChange?.({ currentTarget: control as HTMLInputElement });
  } else { control.value = value; control.dispatchEvent(new window.Event("change", { bubbles: true })); }
}); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
