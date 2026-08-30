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

  it("cancels from a visible source without requesting or rendering a canceled column", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const gets: string[] = []; const posts: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { posts.push(String(init.body)); return mutation; }
      gets.push(url);
      const status = statusFromUrl(url); const todoAttempt = gets.filter((request) => statusFromUrl(request) === "todo").length;
      return boardPage(url, { todoTitle: todoAttempt === 1 ? "Cancel me" : undefined });
    });
    await renderBoard();

    await change(column("todo").querySelector('select[aria-label="Move Cancel me from To do"]') as HTMLSelectElement, "canceled");
    expect(column("todo").textContent).not.toContain("Cancel me");
    expect(posts).toEqual([JSON.stringify({ status: "canceled" })]);
    expect(container.querySelector('[data-board-column="canceled"]')).toBeNull();
    expect(gets.some((url) => statusFromUrl(url) === "canceled")).toBe(false);

    await act(async () => resolveMutation(Response.json(task("canceled", "Cancel me", "todo-task")))); await flush();
    expect(gets.filter((url) => statusFromUrl(url) === "todo")).toHaveLength(2);
    expect(gets.some((url) => statusFromUrl(url) === "canceled")).toBe(false);
  });

  it("restores only the canceled task to its source when cancellation fails", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? mutation
      : boardPage(String(input), { todoTitle: "Keep me" }));
    await renderBoard();

    await change(column("todo").querySelector('select[aria-label="Move Keep me from To do"]') as HTMLSelectElement, "canceled");
    expect(column("todo").textContent).not.toContain("Keep me");
    await act(async () => resolveMutation(errorResponse())); await flush();

    expect(column("todo").textContent).toContain("Keep me");
    expect(container.querySelector('[data-board-column="canceled"]')).toBeNull();
  });

  it("moves once while the target is loading and refreshes both visible columns on success", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const never = new Promise<Response>(() => undefined); const gets: string[] = []; const posts: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { posts.push(String(init.body)); return mutation; }
      gets.push(url);
      const status = statusFromUrl(url); const attempt = gets.filter((request) => statusFromUrl(request) === status).length;
      if (status === "doing" && attempt === 1) return never;
      return boardPage(url, { todoTitle: status === "todo" && attempt === 1 ? "Alpha" : undefined });
    });
    await renderBoard();

    const select = column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement;
    await act(async () => {
      select.value = "doing"; select.dispatchEvent(new window.Event("change", { bubbles: true }));
      select.value = "doing"; select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    expect(posts).toEqual([JSON.stringify({ status: "doing" })]);
    expect(column("todo").textContent).not.toContain("Alpha");
    expect(column("doing").textContent).toContain("Loading this task column");

    await act(async () => resolveMutation(Response.json(task("doing", "Alpha", "todo-task")))); await flush();
    expect(gets.filter((url) => statusFromUrl(url) === "todo")).toHaveLength(2);
    expect(gets.filter((url) => statusFromUrl(url) === "doing")).toHaveLength(2);
  });

  it("moves while the target is errored and failure rolls back the source only", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const gets: string[] = []; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { posts += 1; return mutation; }
      gets.push(url);
      if (statusFromUrl(url) === "doing") return errorResponse();
      return boardPage(url, { todoTitle: statusFromUrl(url) === "todo" ? "Alpha" : undefined });
    });
    await renderBoard();
    expect(column("doing").textContent).toContain("Unable to load this task column.");

    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing");
    expect(posts).toBe(1);
    expect(column("todo").textContent).not.toContain("Alpha");
    expect(column("doing").textContent).toContain("Unable to load this task column.");
    await act(async () => resolveMutation(errorResponse())); await flush();

    expect(column("todo").textContent).toContain("Alpha");
    expect(column("doing").textContent).toContain("Unable to load this task column.");
    expect(gets.filter((url) => statusFromUrl(url) === "doing")).toHaveLength(1);
  });

  it("preserves authoritative source target and unrelated queries when a pending mutation fails", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      const parsed = new URL(url, "https://app.test"); const status = statusFromUrl(url);
      const page = Number(parsed.searchParams.get("page")); const pageSize = Number(parsed.searchParams.get("pageSize"));
      if (status === "todo") return pageResponseFor(url, 41, page === 1 ? "Alpha" : "Todo authoritative");
      if (status === "doing") return pageResponseFor(url, 21, pageSize === 50 ? "Doing 50 authoritative" : "Doing initial");
      if (status === "blocked") return pageResponseFor(url, 21, page === 1 ? "Blocked initial" : "Blocked authoritative");
      return pageResponseFor(url, 0, "Done");
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing");

    await act(async () => (column("todo").querySelector('[aria-label="Page 2"]') as HTMLButtonElement).click()); await flush();
    await change(column("doing").querySelector('select[aria-label="Rows per page"]') as HTMLSelectElement, "50"); await flush();
    await act(async () => (column("blocked").querySelector('[aria-label="Page 2"]') as HTMLButtonElement).click()); await flush();
    expect(browser.location.search).toBe("?todoPage=2&doingPageSize=50&blockedPage=2");

    await act(async () => resolveMutation(errorResponse())); await flush();
    expect(browser.location.search).toBe("?todoPage=2&doingPageSize=50&blockedPage=2");
    expect(column("todo").textContent).toContain("Todo authoritative");
    expect(column("todo").textContent).not.toContain("Alpha");
    expect(column("doing").textContent).toContain("Doing 50 authoritative");
    expect(column("blocked").textContent).toContain("Blocked authoritative");
  });

  it("does not let an old success refresh overwrite a later optimistic mutation", async () => {
    let resolveSecondMutation!: (response: Response) => void;
    const secondMutation = new Promise<Response>((resolve) => { resolveSecondMutation = resolve; });
    let resolveOldTodo!: (response: Response) => void; let resolveOldDoing!: (response: Response) => void;
    const oldTodo = new Promise<Response>((resolve) => { resolveOldTodo = resolve; });
    const oldDoing = new Promise<Response>((resolve) => { resolveOldDoing = resolve; });
    const attempts: Record<string, number> = {}; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts += 1;
        return posts === 1 ? Response.json(task("doing", "Alpha", "todo-task")) : secondMutation;
      }
      const status = statusFromUrl(url)!; attempts[status] = (attempts[status] ?? 0) + 1;
      if (status === "todo" && attempts[status] === 2) return oldTodo;
      if (status === "doing" && attempts[status] === 2) return oldDoing;
      if (status === "todo") return pageResponseFor(url, attempts[status] === 1 ? 1 : 0, "Alpha");
      if (status === "blocked") return pageResponseFor(url, 1, "Gamma");
      return pageResponseFor(url, 0, status);
    });
    await renderBoard();

    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing"); await flush();
    await change(column("blocked").querySelector('select[aria-label="Move Gamma from Blocked"]') as HTMLSelectElement, "todo");
    expect(posts).toBe(2);
    expect(column("todo").textContent).toContain("Gamma");

    await act(async () => resolveOldTodo(pageResponseFor("/api/tasks?page=1&pageSize=20&status=todo", 0, "Stale"))); await flush();
    expect(column("todo").textContent).toContain("Gamma");

    await act(async () => resolveSecondMutation(errorResponse())); await flush();
    await act(async () => resolveOldDoing(pageResponseFor("/api/tasks?page=1&pageSize=20&status=doing", 1, "Alpha"))); await flush();
    expect(column("blocked").textContent).toContain("Gamma");
    expect(attempts.todo).toBe(3);
    expect(column("todo").querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("does not start refresh work after an in-flight mutation settles post-unmount", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; }); let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return mutation;
      gets += 1; return boardPage(String(input), { todoTitle: "Alpha" });
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing");
    await act(async () => root.unmount());
    await act(async () => resolveMutation(Response.json(task("doing", "Alpha", "todo-task")))); await flush();
    expect(gets).toBe(4);
    root = createRoot(container);
  });

  it("converges a contracted last source page with replace while preserving every other column query", async () => {
    browser.history.replaceState({}, "", "/boards?todoPage=2&doingPageSize=50&blockedPage=2&donePageSize=100");
    const replaceState = vi.spyOn(browser.history, "replaceState"); const pushState = vi.spyOn(browser.history, "pushState");
    const requests: string[] = []; let succeeded = false; let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      requests.push(url); const status = statusFromUrl(url);
      if (status === "todo") return pageResponseFor(url, succeeded ? 20 : 21, succeeded ? "Remaining todo" : "Last todo");
      if (status === "done") return pageResponseFor(url, succeeded ? 101 : 100, "Done task");
      if (status === "blocked") return pageResponseFor(url, 21, "Blocked task");
      return pageResponseFor(url, 0, "Doing task");
    });
    await renderBoard();

    await change(column("todo").querySelector('select[aria-label="Move Last todo from To do"]') as HTMLSelectElement, "done");
    expect(column("todo").textContent).toContain("Total 20");
    expect(column("done").textContent).toContain("Total 101");
    expect(column("done").querySelector('[aria-label="Page 2"]')).toBeTruthy();

    succeeded = true;
    await act(async () => resolveMutation(Response.json(task("done", "Last todo", "todo-task")))); await flush(); await flush(); await flush();
    expect(requests.filter((url) => statusFromUrl(url) === "todo").map(pageFromUrl)).toEqual([2, 2, 1]);
    expect(browser.location.search).toBe("?doingPageSize=50&blockedPage=2&donePageSize=100");
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(column("todo").textContent).toContain("Remaining todo");
    expect(column("todo").textContent).not.toContain("Last todo");
  });

  it("keeps page two and exact totals when its only-item move fails", async () => {
    browser.history.replaceState({}, "", "/boards?todoPage=2&donePageSize=100");
    const replaceState = vi.spyOn(browser.history, "replaceState"); let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? mutation
      : statusFromUrl(String(input)) === "todo" ? pageResponseFor(String(input), 21, "Last todo")
        : statusFromUrl(String(input)) === "done" ? pageResponseFor(String(input), 100, "Done task")
          : pageResponseFor(String(input), 0, "Empty"));
    await renderBoard();

    await change(column("todo").querySelector('select[aria-label="Move Last todo from To do"]') as HTMLSelectElement, "done");
    await act(async () => resolveMutation(errorResponse())); await flush();

    expect(browser.location.search).toBe("?todoPage=2&donePageSize=100");
    expect(replaceState).not.toHaveBeenCalled();
    expect(column("todo").textContent).toContain("Total 21");
    expect(column("todo").textContent).toContain("Last todo");
    expect(column("done").textContent).toContain("Total 100");
    expect(column("done").querySelector('[aria-label="Page 2"]')).toBeNull();
  });

  it("converges an empty out-of-range popstate once without dropping other column keys", async () => {
    const replaceState = vi.spyOn(browser.history, "replaceState"); const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); requests.push(url);
      return statusFromUrl(url) === "todo" ? pageResponseFor(url, 20, "Todo") : pageResponseFor(url, 0, "Empty");
    });
    await renderBoard();

    await act(async () => {
      browser.history.pushState({}, "", "/boards?todoPage=3&doingPageSize=50&donePageSize=100");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    });
    await flush();

    expect(requests.filter((url) => statusFromUrl(url) === "todo").map(pageFromUrl)).toEqual([1, 3, 1]);
    expect(browser.location.search).toBe("?doingPageSize=50&donePageSize=100");
    expect(replaceState).toHaveBeenCalledTimes(1);
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

function pageResponseFor(url: string, total: number, title: string): Response {
  const parsed = new URL(url, "https://app.test"); const status = parsed.searchParams.get("status") as TaskItem["status"];
  const page = Number(parsed.searchParams.get("page") ?? "1"); const pageSize = Number(parsed.searchParams.get("pageSize") ?? "20");
  const offset = (page - 1) * pageSize; const count = Math.max(0, Math.min(pageSize, total - offset));
  const items = Array.from({ length: count }, (_unused, index) => task(status, index === 0 ? title : `${title} ${index + 1}`, index === 0 ? `${status}-task` : `${status}-task-${offset + index}`));
  return Response.json({ items, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } });
}

function task(status: TaskItem["status"], title: string, id: string): TaskItem {
  return { id, title, notes: "", status, progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
}

function statusFromUrl(url: string): string | null { return new URL(url, "https://app.test").searchParams.get("status"); }
function pageFromUrl(url: string): number { return Number(new URL(url, "https://app.test").searchParams.get("page")); }
function errorResponse(): Response { return Response.json({ error: { code: "TEST_ERROR", message: "failed", retryable: true } }, { status: 500 }); }
async function change(select: HTMLSelectElement, value: string) { await act(async () => { select.value = value; select.dispatchEvent(new window.Event("change", { bubbles: true })); }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
async function settle() { await act(async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
