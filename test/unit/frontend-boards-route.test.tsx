// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardsRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { TaskItem } from "../../frontend/lib/tasks-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("task-backed boards route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/boards" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document);
    container = browser.document.createElement("div"); browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("loads four bounded status pages and paginates only the selected column", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); requests.push(url); return boardPage(url, { todoTotal: 21 }); });
    await renderBoard();

    expect(requests).toHaveLength(4);
    expect(requests.map(statusFromUrl).sort()).toEqual(["blocked", "doing", "done", "todo"]);
    for (const url of requests) expect(url).toMatch(/page=1&pageSize=20&status=(todo|doing|blocked|done)$/u);
    expect(requests.some((url) => url.includes("canceled"))).toBe(false);

    const todo = column("todo");
    const pageTwo = todo.querySelector('[aria-label="Page 2"]') as HTMLButtonElement;
    expect(pageTwo).toBeTruthy();
    await act(async () => pageTwo.click()); await flush();
    expect(requests).toHaveLength(5);
    expect(requests.at(-1)).toContain("page=2&pageSize=20&status=todo");
    for (const status of ["doing", "blocked", "done"]) expect(requests.filter((url) => statusFromUrl(url) === status)).toHaveLength(1);
  });

  it("survives the application StrictMode effect lifecycle", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => boardPage(String(input), { todoTitle: "Strict task" }));
    await act(async () => root.render(<React.StrictMode><BoardsRoute locale={createLocaleRuntime()} search={browser.location.search} /></React.StrictMode>));
    await flush();

    expect(column("todo").textContent).toContain("Strict task");
  });

  it("moves optimistically through the status API and rolls back on failure", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const mutations: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { mutations.push({ url, body: String(init.body) }); return mutation; }
      return boardPage(url, { todoTitle: "Alpha" });
    });
    await renderBoard();

    const select = column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    await change(select, "doing");
    expect(column("todo").textContent).not.toContain("Alpha");
    expect(column("doing").textContent).toContain("Alpha");
    expect(mutations).toEqual([{ url: "/api/tasks/todo-task/status", body: JSON.stringify({ status: "doing" }) }]);

    await act(async () => resolveMutation(errorResponse())); await flush();
    expect(column("todo").textContent).toContain("Alpha");
    expect(column("doing").textContent).not.toContain("Alpha");
    expect(container.textContent).toContain("Unable to move the task.");
  });

  it("aborts and ignores a stale column response after browser history restores a newer page", async () => {
    let staleSignal: AbortSignal | undefined; let resolveStale!: (response: Response) => void;
    const stale = new Promise<Response>((resolve) => { resolveStale = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const status = statusFromUrl(url); const page = Number(new URL(url, "https://app.test").searchParams.get("page"));
      if (status === "todo" && page === 2) { staleSignal = init?.signal ?? undefined; return stale; }
      return boardPage(url, { todoTitle: page === 3 ? "Latest" : "Initial", todoTotal: page === 3 ? 41 : 1 });
    });
    await renderBoard();

    await act(async () => { browser.history.pushState({}, "", "/boards?todoPage=2"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await settle();
    expect(staleSignal?.aborted).toBe(false);
    await act(async () => { browser.history.pushState({}, "", "/boards?todoPage=3"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(staleSignal?.aborted).toBe(true);
    expect(column("todo").textContent).toContain("Latest");

    await act(async () => resolveStale(pageResponse("todo", 2, 21, "Stale"))); await flush();
    expect(column("todo").textContent).toContain("Latest");
    expect(column("todo").textContent).not.toContain("Stale");
  });

  async function renderBoard() {
    await act(async () => root.render(<BoardsRoute locale={createLocaleRuntime()} search={browser.location.search} />));
    await flush();
  }

  function column(status: string): HTMLElement {
    return container.querySelector(`[data-board-column="${status}"]`) as HTMLElement;
  }
});

function boardPage(url: string, options: { todoTitle?: string; todoTotal?: number } = {}): Response {
  const parsed = new URL(url, "https://app.test");
  const status = parsed.searchParams.get("status") as TaskItem["status"];
  const page = Number(parsed.searchParams.get("page") ?? "1");
  const total = status === "todo" ? (options.todoTotal ?? (options.todoTitle ? 1 : 0)) : 0;
  return pageResponse(status, page, total, options.todoTitle ?? "Todo");
}

function pageResponse(status: TaskItem["status"], page: number, total: number, title: string): Response {
  const pageSize = 20; const offset = (page - 1) * pageSize; const count = Math.max(0, Math.min(pageSize, total - offset));
  const items = Array.from({ length: count }, (_unused, index) => task(status, index === 0 ? title : `${title} ${index + 1}`, `${status}-task${index ? `-${index}` : ""}`));
  return Response.json({ items, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } });
}

function task(status: TaskItem["status"], title: string, id: string): TaskItem {
  return { id, title, notes: "", status, progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
}

function statusFromUrl(url: string): string | null { return new URL(url, "https://app.test").searchParams.get("status"); }
function errorResponse(): Response { return Response.json({ error: { code: "TEST_ERROR", message: "failed", retryable: true } }, { status: 500 }); }
async function change(select: HTMLSelectElement, value: string) { await act(async () => { select.value = value; select.dispatchEvent(new window.Event("change", { bubbles: true })); }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
async function settle() { await act(async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
