import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
// @vitest-environment node
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardsRoute } from "../../frontend/app";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { readWorkspaceLocation, WORKSPACE_LOCATION_CHANGE_EVENT, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
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
    vi.stubGlobal("window", browser); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("document", browser.document);
    vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div"); browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("loads four bounded status pages and appends only the selected column at the end of its list", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); requests.push(url); return pagedResponse(url, statusFromUrl(url) === "todo" ? 21 : 0, "Todo"); });
    await renderBoard();

    expect(requests).toHaveLength(4);
    expect(requests.map(statusFromUrl).sort()).toEqual(["blocked", "doing", "done", "todo"]);
    for (const url of requests) expect(url).toMatch(/page=1&pageSize=20&status=(todo|doing|blocked|done)$/u);
    expect(requests.some((url) => url.includes("canceled"))).toBe(false);

    await scrollToEnd("todo");
    expect(requests).toHaveLength(5);
    expect(requests.at(-1)).toContain("page=2&pageSize=20&status=todo");
    expect(boardTaskIds(column("todo"))).toHaveLength(21);
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
    expect(mutations).toEqual([{ url: "/api/tasks/todo-task/status", body: JSON.stringify({ status: "doing", expectedStatus: "todo" }) }]);

    await act(async () => resolveMutation(rejectedResponse())); await flush();
    expect(column("todo").textContent).toContain("Alpha");
    expect(column("doing").textContent).not.toContain("Alpha");
    expect(container.textContent).toContain("Unable to move the task.");
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    expect((column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement).disabled).toBe(false);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("moves a focused card with arrow keys only when the next column is a legal status, and keeps columns in a horizontal scroller", async () => {
    const mutations: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        mutations.push(String(init.body));
        const requested = JSON.parse(String(init.body)) as { status: TaskItem["status"] };
        return Response.json(task(requested.status, "Alpha", "todo-task"));
      }
      const status = new URL(url, "https://app.test").searchParams.get("status");
      if (status === "done") return pageResponse("done", 1, 1, "Finished");
      if (status === "todo") return pageResponse("todo", 1, 1, "Alpha");
      return boardPage(url);
    });
    await renderBoard();

    const scroller = container.querySelector("[data-board-columns]") as HTMLElement;
    expect(scroller.className).toContain("overflow-x-auto");
    expect(column("todo").className).toContain("shrink-0");
    expect(column("doing").className).toContain("snap-start");

    const select = column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement;
    select.focus();
    await act(async () => { select.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    await flush();
    expect(mutations).toEqual([]);

    const card = column("todo").querySelector("[data-board-task='todo-task']") as HTMLElement;
    expect(card.tabIndex).toBe(0);
    card.focus();
    await act(async () => { card.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    await flush();
    expect(mutations).toEqual([JSON.stringify({ status: "doing", expectedStatus: "todo" })]);

    const done = column("done").querySelector("[data-board-task='done-task']") as HTMLElement;
    done.focus();
    await act(async () => { done.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    await flush();
    expect(mutations).toEqual([JSON.stringify({ status: "doing", expectedStatus: "todo" })]);
  });

  it("rolls back a move rejected because the task changed elsewhere and reloads every column", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ error: { code: "TASK_STATUS_CONFLICT", message: "changed", retryable: false } }, { status: 409 });
      requests.push(String(input)); return boardPage(String(input), { todoTitle: "Alpha" });
    });
    await renderBoard();
    const before = requests.length;
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing"); await flush();
    expect(container.textContent).toContain("changed elsewhere");
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    for (const status of ["todo", "doing", "blocked", "done"]) expect(requests.slice(before).filter((url) => statusFromUrl(url) === status).length).toBe(1);
  });

  it("blocks leaving during an in-flight move while the source column still appends its next page", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return mutation;
      const url = String(input); requests.push(url); return pagedResponse(url, statusFromUrl(url) === "todo" ? 41 : 0, "Alpha");
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "doing");

    let result: string | undefined;
    await act(async () => { result = writeWorkspaceHistory("push", "/tasks"); });
    expect(result).toBe("blocked");
    expect(browser.location.pathname).toBe("/boards");
    const unload = new browser.Event("beforeunload", { cancelable: true });
    browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await scrollToEnd("todo");
    expect(browser.location.search).toBe("");
    expect(requests.filter((url) => statusFromUrl(url) === "todo" && pageFromUrl(url) === 2)).toHaveLength(1);

    await act(async () => resolveMutation(Response.json(task("doing", "Alpha", "todo-p1-0")))); await flush();
    await act(async () => { result = writeWorkspaceHistory("push", "/tasks"); });
    expect(result).toBe("committed");
  });

  it.each([
    ["a server error", () => errorResponse()],
    ["a network failure", () => { throw new TypeError("network down"); }],
    ["a malformed receipt", () => Response.json({ id: "other" })],
  ] as const)("keeps an unknown move locked after %s until its exact result is checked", async (_label, failure) => {
    const gets: string[] = []; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { posts += 1; return failure(); }
      gets.push(url);
      if (url === "/api/tasks/todo-p1-0") return detailResponse(task("doing", "Alpha p1.1", "todo-p1-0"));
      return pagedResponse(url, statusFromUrl(url) === "todo" ? 21 : 0, "Alpha");
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "doing"); await flush();

    const alert = container.querySelector("[data-board-move-unknown]") as HTMLElement;
    expect(alert.textContent).toContain("result of moving Alpha p1.1 to Doing is unknown");
    expect(container.textContent).not.toContain("Unable to move the task.");
    expect((column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement).disabled).toBe(true);
    expect(gets).not.toContain("/api/tasks/todo-p1-0");
    let result: string | undefined;
    await act(async () => { result = writeWorkspaceHistory("push", "/tasks"); });
    expect(result).toBe("blocked");
    const unload = new browser.Event("beforeunload", { cancelable: true });
    browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await scrollToEnd("todo");
    expect(browser.location.search).toBe("");

    const before = gets.length;
    await act(async () => buttonByText(container, "Check the result").click()); await flush();
    expect(posts).toBe(1);
    expect(gets.slice(before)).toContain("/api/tasks/todo-p1-0");
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    expect(container.textContent).toContain("The move to Doing was saved.");
    for (const status of ["todo", "doing", "blocked", "done"]) expect(gets.slice(before).filter((url) => statusFromUrl(url) === status).length).toBe(1);
    await act(async () => { result = writeWorkspaceHistory("push", "/tasks"); });
    expect(result).toBe("committed");
  });

  it("reports a not-saved move and keeps the lock when the check itself fails", async () => {
    let detailFails = true;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return errorResponse();
      if (url === "/api/tasks/todo-task") return detailFails ? errorResponse() : detailResponse(task("todo", "Alpha", "todo-task"));
      return boardPage(url, { todoTitle: "Alpha" });
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "done"); await flush();

    await act(async () => buttonByText(container, "Check the result").click()); await flush();
    expect(container.querySelector("[data-board-move-unknown]")).toBeTruthy();
    expect(container.textContent).toContain("Unable to check the result.");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");

    detailFails = false;
    await act(async () => buttonByText(container, "Check the result").click()); await flush();
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    expect(container.textContent).toContain("The move was not saved. The task is still in To do.");
    await flush();
    expect((column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement).disabled).toBe(false);
  });

  it("reports a task changed elsewhere or removed when checking an unknown move", async () => {
    let detail: () => Response = () => detailResponse(task("blocked", "Alpha", "todo-task"));
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return errorResponse();
      if (url === "/api/tasks/todo-task") return detail();
      return boardPage(url, { todoTitle: "Alpha" });
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing"); await flush();
    await act(async () => buttonByText(container, "Check the result").click()); await flush();
    expect(container.textContent).toContain("The task is now in Blocked because it changed elsewhere.");

    detail = () => Response.json({ error: { code: "TASK_NOT_FOUND", message: "missing", retryable: false } }, { status: 404 });
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing"); await flush();
    await act(async () => buttonByText(container, "Check the result").click()); await flush();
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    expect(container.textContent).toContain("The task is no longer available.");
  });

  it("retries exactly the same unknown move and releases only after a matching receipt", async () => {
    const posts: Array<{ url: string; body: string }> = []; let attempt = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push({ url, body: String(init.body) }); attempt += 1;
        if (attempt === 1) throw new TypeError("network down");
        if (attempt === 2) return errorResponse();
        return Response.json(task("doing", "Alpha", "todo-task"));
      }
      return boardPage(url, { todoTitle: "Alpha" });
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing"); await flush();

    await act(async () => buttonByText(container, "Retry the same move").click()); await flush();
    expect(container.querySelector("[data-board-move-unknown]")).toBeTruthy();
    expect(container.textContent).toContain("The result is still unknown.");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");

    await act(async () => {
      buttonByText(container, "Retry the same move").click();
      buttonByText(container, "Retry the same move").click();
    }); await flush();
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map((post) => `${post.url} ${post.body}`))).toEqual(new Set([`/api/tasks/todo-task/status ${JSON.stringify({ status: "doing", expectedStatus: "todo" })}`]));
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    expect(container.textContent).toContain("The move to Doing was saved.");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("releases an unknown move when the retry is definitively rejected", async () => {
    let attempt = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { attempt += 1; return attempt === 1 ? errorResponse() : rejectedResponse(); }
      return boardPage(String(input), { todoTitle: "Alpha" });
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing"); await flush();
    await act(async () => buttonByText(container, "Retry the same move").click()); await flush();
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    expect(container.textContent).toContain("Unable to move the task.");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it.each([401, 403])("clears the board and the unknown move when checking is denied with %s", async (status) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return errorResponse();
      if (url === "/api/tasks/todo-task") return deniedResponse(status);
      return boardPage(url, { todoTitle: "Private" });
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Private from To do"]') as HTMLSelectElement, "doing"); await flush();
    await act(async () => buttonByText(container, "Check the result").click()); await flush();
    expect(container.querySelectorAll("[data-board-task]")).toHaveLength(0);
    expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    expect(container.textContent).not.toContain("Private");
  });

  it("ignores a late unknown-move check after the route unmounts", async () => {
    let resolveDetail!: (response: Response) => void;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return errorResponse();
      if (url === "/api/tasks/todo-task") return new Promise<Response>((resolve) => { resolveDetail = resolve; });
      return boardPage(url, { todoTitle: "Alpha" });
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing"); await flush();
    await act(async () => buttonByText(container, "Check the result").click());
    await act(async () => root.unmount());
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
    await act(async () => resolveDetail(detailResponse(task("doing", "Alpha", "todo-task")))); await flush();
    root = createRoot(container);
  });

  it("restores the exact evicted item and order when a full target page move fails", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      if (statusFromUrl(url) === "todo") return pageResponseFor(url, 1, "Alpha");
      if (statusFromUrl(url) === "doing") return pageResponseFor(url, 20, "Target");
      return pageResponseFor(url, 0, "Empty");
    });
    await renderBoard();
    const originalTargetIds = Array.from({ length: 20 }, (_unused, index) => index === 0 ? "doing-task" : `doing-task-${index}`);
    expect(boardTaskIds(column("doing"))).toEqual(originalTargetIds);

    await change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing");
    expect(boardTaskIds(column("doing"))).toEqual(["todo-task", ...originalTargetIds.slice(0, 19)]);
    await act(async () => resolveMutation(errorResponse())); await flush();

    expect(boardTaskIds(column("doing"))).toEqual(originalTargetIds);
    expect(columnTotal("doing")).toBe("20");
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
    expect(posts).toEqual([JSON.stringify({ status: "canceled", expectedStatus: "todo" })]);
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
    expect(posts).toEqual([JSON.stringify({ status: "doing", expectedStatus: "todo" })]);
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

  it("preserves each column's appended window when a pending mutation fails", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const counters: Record<string, number> = {};
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      const status = statusFromUrl(url)!; const page = pageFromUrl(url);
      counters[status] = (counters[status] ?? 0) + 1;
      if (status === "todo") return pagedResponse(url, 41, page === 1 ? (counters.todo === 1 ? "Alpha" : "Todo authoritative") : "Todo tail");
      if (status === "doing") return pagedResponse(url, 41, page === 1 ? (counters.doing === 1 ? "Doing initial" : "Doing authoritative") : "Doing tail");
      if (status === "blocked") return pagedResponse(url, 41, "Blocked");
      return pagedResponse(url, 0, "Done");
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "doing");

    await scrollToEnd("todo");
    await scrollToEnd("doing");
    await scrollToEnd("blocked");
    expect(browser.location.search).toBe("");

    await act(async () => resolveMutation(errorResponse())); await flush(); await flush();
    expect(browser.location.search).toBe("");
    expect(column("todo").textContent).toContain("Todo authoritative p1.1");
    expect(column("todo").textContent).not.toContain("Alpha p1.1");
    expect(column("todo").textContent).not.toContain("Todo tail");
    expect(column("doing").textContent).toContain("Doing authoritative p1.1");
    expect(column("blocked").textContent).toContain("Blocked p2.1");
  });

  it("replaces a same-query retry superseded by mutation failure instead of remaining pending", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const never = new Promise<Response>(() => undefined); let todoAttempts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      if (statusFromUrl(url) !== "todo") return pagedResponse(url, 0, "Empty");
      todoAttempts += 1;
      if (todoAttempts === 2) return errorResponse();
      if (todoAttempts === 3) return never;
      return pagedResponse(url, 21, "Alpha");
    });
    await renderBoard();
    await scrollToEnd("todo");
    expect(column("todo").textContent).toContain("Unable to load this task column.");

    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "doing");
    await act(async () => buttonByText(column("todo"), "Try this column again").click()); await flush();
    expect(todoAttempts).toBe(3);
    expect(column("todo").querySelector('[aria-busy="true"]')).toBeTruthy();

    await act(async () => resolveMutation(errorResponse())); await flush(); await flush();
    expect(todoAttempts).toBe(4);
    expect(column("todo").textContent).toContain("Alpha p1.1");
    expect(column("todo").querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("does not apply an old inverse when the source window was replaced before the mutation failed", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; }); let pageOneAttempts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      if (statusFromUrl(url) !== "todo") return pagedResponse(url, 0, "Empty");
      if (pageFromUrl(url) === 2) return errorResponse();
      pageOneAttempts += 1;
      return pageOneAttempts === 1 ? pagedResponse(url, 41, "Alpha") : pageResponseWithPrefix(url, 40, "new-a", "New A");
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "doing");

    await scrollToEnd("todo");
    await act(async () => buttonByText(column("todo"), "Try this column again").click()); await flush();
    expect(boardTaskIds(column("todo"))).toHaveLength(20);
    expect(boardTaskIds(column("todo"))[0]).toBe("new-a-0");

    await act(async () => resolveMutation(errorResponse())); await flush(); await flush();
    expect(boardTaskIds(column("todo"))).toHaveLength(20);
    expect(boardTaskIds(column("todo"))[0]).toBe("new-a-0");
    expect(boardTaskIds(column("todo"))).not.toContain("todo-task");
    expect(columnTotal("todo")).toBe("40");
  });

  it("does not let an old failure inverse modify newer same-query authoritative data", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; }); let todoAttempts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      if (statusFromUrl(url) !== "todo") return pagedResponse(url, 0, "Empty");
      todoAttempts += 1;
      if (todoAttempts === 2) return errorResponse();
      if (todoAttempts >= 3) return pageResponseWithPrefix(url, 20, "new-authoritative", "New authoritative");
      return pagedResponse(url, 21, "Alpha");
    });
    await renderBoard();
    await scrollToEnd("todo");
    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "doing");
    await act(async () => buttonByText(column("todo"), "Try this column again").click()); await flush();
    expect(boardTaskIds(column("todo"))).toHaveLength(20);
    expect(boardTaskIds(column("todo"))[0]).toBe("new-authoritative-0");

    await act(async () => resolveMutation(errorResponse())); await flush(); await flush();
    expect(boardTaskIds(column("todo"))).toHaveLength(20);
    expect(boardTaskIds(column("todo"))[0]).toBe("new-authoritative-0");
    expect(boardTaskIds(column("todo"))).not.toContain("todo-task");
    expect(columnTotal("todo")).toBe("20");
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

  it("replaces the appended source window with the first page after a successful move", async () => {
    const requests: string[] = []; let succeeded = false; let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return mutation;
      requests.push(url); const status = statusFromUrl(url);
      if (status === "todo") return pagedResponse(url, 41, succeeded ? "Remaining todo" : "Alpha");
      if (status === "done") return pagedResponse(url, 20, "Done task");
      if (status === "blocked") return pagedResponse(url, 41, "Blocked task");
      return pagedResponse(url, 0, "Doing task");
    });
    await renderBoard();
    await scrollToEnd("todo");
    expect(boardTaskIds(column("todo"))).toHaveLength(40);

    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "done");
    succeeded = true;
    await act(async () => resolveMutation(Response.json(task("done", "Alpha", "todo-p1-0")))); await flush(); await flush(); await flush();

    expect(requests.filter((url) => statusFromUrl(url) === "todo").map(pageFromUrl)).toEqual([1, 2, 1]);
    expect(requests.filter((url) => statusFromUrl(url) === "blocked")).toHaveLength(1);
    expect(browser.location.search).toBe("");
    expect(column("todo").textContent).toContain("Remaining todo p1.1");
    expect(column("todo").textContent).not.toContain("Alpha p2");
    expect(boardTaskIds(column("todo"))).toHaveLength(20);
  });

  it("keeps the appended page and exact totals when its only-item move fails", async () => {
    let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? mutation
      : statusFromUrl(String(input)) === "todo" ? pagedResponse(String(input), 21, "Last todo")
        : statusFromUrl(String(input)) === "done" ? pagedResponse(String(input), 20, "Done task")
          : pagedResponse(String(input), 0, "Empty"));
    await renderBoard();
    await scrollToEnd("todo");
    const idsBefore = boardTaskIds(column("todo"));
    expect(idsBefore).toHaveLength(21);

    await change(column("todo").querySelector('select[aria-label="Move Last todo p2.1 from To do"]') as HTMLSelectElement, "done");
    await act(async () => resolveMutation(errorResponse())); await flush(); await flush();

    expect(browser.location.search).toBe("");
    expect(boardTaskIds(column("todo"))).toEqual(idsBefore);
    expect(columnTotal("todo")).toBe("21");
    expect(columnTotal("done")).toBe("20");
  });

  it("ignores board page params pushed through browser history", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); requests.push(url);
      return statusFromUrl(url) === "todo" ? pagedResponse(url, 21, "Todo") : pagedResponse(url, 0, "Empty");
    });
    await renderBoard();
    const before = requests.length;

    await act(async () => {
      browser.history.pushState({}, "", "/boards?todoPage=3&doingPageSize=50&donePageSize=100");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    });
    await flush();

    expect(requests).toHaveLength(before);
    expect(requests.map(pageFromUrl)).toEqual([1, 1, 1, 1]);
    expect(boardTaskIds(column("todo"))).toHaveLength(20);
  });

  it("aborts and ignores a superseded column read when a move reloads that window", async () => {
    let staleSignal: AbortSignal | undefined; let resolveStale!: (response: Response) => void;
    const stale = new Promise<Response>((resolve) => { resolveStale = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return Response.json(task("doing", "Alpha", "todo-p1-0"));
      const status = statusFromUrl(url); const page = pageFromUrl(url);
      if (status === "doing" && page === 2) { staleSignal = init?.signal ?? undefined; return stale; }
      if (status === "todo") return pagedResponse(url, 1, "Alpha");
      if (status === "doing") return pagedResponse(url, 41, "Doing");
      return pagedResponse(url, 0, "Empty");
    });
    await renderBoard();

    await scrollToEnd("doing");
    expect(staleSignal?.aborted).toBe(false);

    await change(column("todo").querySelector('select[aria-label="Move Alpha p1.1 from To do"]') as HTMLSelectElement, "doing");
    await flush();
    expect(staleSignal?.aborted).toBe(true);
    expect(column("doing").textContent).toContain("Doing p1.1");

    await act(async () => resolveStale(pagedResponse("/api/tasks?page=2&pageSize=20&status=doing", 41, "Stale"))); await flush();
    expect(column("doing").textContent).toContain("Doing p1.1");
    expect(column("doing").textContent).not.toContain("Stale");
  });

  it("ignores board page params on a deep link and keeps the base Boards URL clean on re-entry", async () => {
    browser.history.replaceState({}, "", "/boards?todoPage=2");
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/navigation") throw new Error("navigation unavailable");
      requests.push(path);
      return pagedResponse(path, statusFromUrl(path) === "todo" ? 21 : 0, "First page");
    });
    const session = {
      member: { id: "member-1", email: "member@example.com", role: "contributor" as const },
      capabilities: ["knowledge:read"], permissionMask: "0x100000", logoutUrl: "/auth/logout",
    };
    function Harness() {
      const [location, setLocation] = useState(readWorkspaceLocation);
      useEffect(() => {
        const update = () => setLocation(readWorkspaceLocation());
        window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update);
        return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update);
      }, []);
      return <AppShell session={session} pathname={location.pathname} locale={createLocaleRuntime()} onNavigate={(path) => writeWorkspaceHistory("push", path)}>
        <BoardsRoute locale={createLocaleRuntime()} search={location.search} />
      </AppShell>;
    }
    await act(async () => root.render(<Harness />));
    await waitForBoardRequest(requests, (path) => statusFromUrl(path) === "todo" && pageFromUrl(path) === 1);
    expect(requests.filter((path) => statusFromUrl(path) === "todo")).toHaveLength(1);
    expect(column("todo").textContent).toContain("First page p1.1");

    const boardsLink = container.querySelector("nav[data-shell-collaboration-navigation] a[href='/boards']") as HTMLAnchorElement;
    expect(boardsLink).not.toBeNull();
    await act(async () => boardsLink.click());
    await flush();

    expect(browser.location.pathname).toBe("/boards");
    expect(browser.location.search).toBe("");
    expect(column("todo").querySelector('[aria-label="Page 1"]')).toBeNull();
  });

  it.each([401, 403])("clears every column after a move is denied with %s", async (status) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST" ? deniedResponse(status) : pageResponseFor(String(input), 1, "Private"));
    await renderBoard();
    expect(container.querySelectorAll("[data-board-task]")).toHaveLength(4);
    await change(column("todo").querySelector('select[aria-label="Move Private from To do"]') as HTMLSelectElement, "doing");
    await flush();
    expect(container.querySelectorAll("[data-board-task]")).toHaveLength(0);
    expect(container.textContent).not.toContain("Private");
  });

  it.each([401, 403])("clears old pages on read denial %s and only explicitly retries all columns", async (status) => {
    let denied = false;
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");
      const url = String(input); requests.push(url);
      return denied && statusFromUrl(url) === "todo" ? deniedResponse(status) : pagedResponse(url, 21, "Private");
    });
    await renderBoard(); denied = true;
    await scrollToEnd("todo");
    expect(container.querySelectorAll("[data-board-task]")).toHaveLength(0);
    const count = requests.length;
    await act(async () => writeWorkspaceHistory("push", "/boards?doingPage=2")); await flush();
    expect(requests).toHaveLength(count);
    denied = false;
    await act(async () => buttonByText(column("todo"), "Try this column again").click()); await flush();
    expect(requests).toHaveLength(count + 4);
    for (const name of ["todo", "doing", "blocked", "done"]) expect(boardTaskIds(column(name)).length).toBeGreaterThan(0);
  });

  it.each([401, 403])("clears optimistic cards if authoritative readback is denied with %s", async (status) => {
    let posted = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posted = true; return Response.json(task("doing", "Private", "todo-task")); }
      return posted ? deniedResponse(status) : pageResponseFor(String(input), 1, "Private");
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Private from To do"]') as HTMLSelectElement, "doing"); await flush();
    expect(posted).toBe(true);
    // The successful write schedules a render, then a separate authoritative-read effect.
    await flush();
    expect(container.querySelectorAll("[data-board-task]")).toHaveLength(0);
  });

  it("aborts other reads and ignores late successful pages after a denial", async () => {
    let resolveLate!: (response: Response) => void;
    let lateSignal: AbortSignal | undefined;
    let deny = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (statusFromUrl(url) === "doing") {
        lateSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => { resolveLate = resolve; });
      }
      return deny ? deniedResponse(403) : pageResponseFor(url, 21, "Private");
    });
    await renderBoard(); deny = true;
    await scrollToEnd("todo");
    expect(lateSignal?.aborted).toBe(true);
    await act(async () => resolveLate(pageResponse("doing", 1, 1, "Late private"))); await flush();
    expect(container.querySelectorAll("[data-board-task]")).toHaveLength(0);
  });

  it.each([true, false])("does not restore cards from a pending move after read denial (success=%s)", async (success) => {
    let resolveMove!: (response: Response) => void;
    let deny = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { resolveMove = resolve; });
      return deny ? deniedResponse(401) : pagedResponse(String(input), 21, "Private");
    });
    await renderBoard();
    await change(column("todo").querySelector('select[aria-label="Move Private p1.1 from To do"]') as HTMLSelectElement, "doing");
    deny = true;
    await scrollToEnd("blocked");
    expect(container.querySelectorAll("[data-board-task]")).toHaveLength(0);
    deny = false;
    await act(async () => buttonByText(column("todo"), "Try this column again").click()); await flush();
    const recoveredIds = [...container.querySelectorAll("[data-board-task]")].map((element) => element.getAttribute("data-board-task"));
    expect(recoveredIds.length).toBeGreaterThan(0);
    await act(async () => resolveMove(success ? Response.json(task("doing", "Private", "todo-p1-0")) : errorResponse())); await flush();
    expect([...container.querySelectorAll("[data-board-task]")].map((element) => element.getAttribute("data-board-task"))).toEqual(recoveredIds);
  });

  describe("unknown move across refresh", () => {
    const KEY = "memory-garden:board-move:v1:member-a";
    const moveAlpha = () => change(column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement, "doing");
    async function leave() {
      let result: string | undefined;
      await act(async () => { result = writeWorkspaceHistory("push", "/tasks"); });
      return result;
    }
    async function refresh(memberId = "member-a") {
      await act(async () => root.unmount());
      root = createRoot(container);
      await renderBoard(memberId);
    }

    it("records the move before sending and clears it after a matching receipt", async () => {
      const seenAtSend: Array<string | null> = [];
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") { seenAtSend.push(browser.sessionStorage.getItem(KEY)); return Response.json(task("doing", "Alpha", "todo-task")); }
        return boardPage(String(input), { todoTitle: "Alpha" });
      });
      await renderBoard("member-a");
      await moveAlpha(); await flush();
      expect(seenAtSend).toHaveLength(1);
      expect(JSON.parse(seenAtSend[0]!)).toEqual({ version: 1, memberId: "member-a", intent: { taskId: "todo-task", title: "Alpha", source: "todo", target: "doing" } });
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
    });

    it("restores an unknown move after refresh, keeps it locked, and settles it by checking", async () => {
      let posts = 0;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") { posts += 1; return errorResponse(); }
        if (url === "/api/tasks/todo-task") return detailResponse(task("doing", "Alpha", "todo-task"));
        return boardPage(url, { todoTitle: "Alpha" });
      });
      await renderBoard("member-a");
      await moveAlpha(); await flush();
      expect(browser.sessionStorage.getItem(KEY)).not.toBeNull();

      await refresh();
      const alert = container.querySelector("[data-board-move-unknown]") as HTMLElement;
      expect(alert.textContent).toContain("result of moving Alpha to Doing is unknown");
      expect((column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement).disabled).toBe(true);
      expect(await leave()).toBe("blocked");
      const unload = new browser.Event("beforeunload", { cancelable: true });
      browser.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);
      expect(posts).toBe(1);

      await act(async () => buttonByText(container, "Check the result").click()); await flush();
      expect(posts).toBe(1);
      expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
      expect(container.textContent).toContain("The move to Doing was saved.");
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
      expect(await leave()).toBe("committed");
    });

    it("retries the restored move with the same target after refresh", async () => {
      const posts: string[] = []; let attempt = 0;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") { posts.push(`${url} ${String(init.body)}`); attempt += 1; return attempt === 1 ? errorResponse() : Response.json(task("doing", "Alpha", "todo-task")); }
        return boardPage(url, { todoTitle: "Alpha" });
      });
      await renderBoard("member-a");
      await moveAlpha(); await flush();
      await refresh();
      await act(async () => buttonByText(container, "Retry the same move").click()); await flush();
      expect(new Set(posts)).toEqual(new Set([`/api/tasks/todo-task/status ${JSON.stringify({ status: "doing", expectedStatus: "todo" })}`]));
      expect(posts).toHaveLength(2);
      expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
    });

    it("clears the record when the move is definitively rejected", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? rejectedResponse() : boardPage(String(input), { todoTitle: "Alpha" }));
      await renderBoard("member-a");
      await moveAlpha(); await flush();
      expect(container.textContent).toContain("Unable to move the task.");
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
      await refresh();
      expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
    });

    it("does not show one member's unknown move to another member in the same tab", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? errorResponse() : boardPage(String(input), { todoTitle: "Alpha" }));
      await renderBoard("member-a");
      await moveAlpha(); await flush();
      await refresh("member-b");
      expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
      expect(await leave()).toBe("committed");
      expect(browser.sessionStorage.getItem(KEY)).not.toBeNull();
    });

    it("blocks moves behind an unreadable record until the member discards it", async () => {
      let posts = 0;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") { posts += 1; return Response.json(task("doing", "Alpha", "todo-task")); }
        return boardPage(String(input), { todoTitle: "Alpha" });
      });
      browser.sessionStorage.setItem(KEY, "{not json");
      await renderBoard("member-a");
      const blocked = container.querySelector("[data-board-move-record-blocked]") as HTMLElement;
      expect(blocked.textContent).toContain("can't be read");
      expect((column("todo").querySelector('select[aria-label="Move Alpha from To do"]') as HTMLSelectElement).disabled).toBe(true);
      await moveAlpha(); await flush();
      expect(posts).toBe(0);

      await act(async () => buttonByText(container, "Discard record").click()); await flush();
      expect(container.querySelector("[data-board-move-record-blocked]")).toBeNull();
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
      await moveAlpha(); await flush();
      expect(posts).toBe(1);
    });

    it("does not send a move it cannot record in this tab", async () => {
      let posts = 0;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") { posts += 1; return Response.json(task("doing", "Alpha", "todo-task")); }
        return boardPage(String(input), { todoTitle: "Alpha" });
      });
      await renderBoard("member-a");
      vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
      await moveAlpha(); await flush();
      expect(posts).toBe(0);
      expect(container.textContent).toContain("was not sent");
      expect(column("todo").textContent).toContain("Alpha");
      expect(await leave()).toBe("committed");
    });

    it("keeps the move locked when a confirmed receipt cannot clear its record", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") return Response.json(task("doing", "Alpha", "todo-task"));
        if (url === "/api/tasks/todo-task") return detailResponse(task("doing", "Alpha", "todo-task"));
        return boardPage(url, { todoTitle: "Alpha" });
      });
      await renderBoard("member-a");
      const remove = vi.spyOn(browser.sessionStorage, "removeItem").mockImplementationOnce(() => { throw new Error("storage"); });
      await moveAlpha(); await flush();
      expect(container.querySelector("[data-board-move-unknown]")).toBeTruthy();
      expect(await leave()).toBe("blocked");
      remove.mockRestore();
      await act(async () => buttonByText(container, "Check the result").click()); await flush();
      expect(container.querySelector("[data-board-move-unknown]")).toBeNull();
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
      expect(await leave()).toBe("committed");
    });
  });

  async function renderBoard(memberId?: string) {
    await act(async () => root.render(<BoardsRoute locale={createLocaleRuntime()} search={browser.location.search} {...(memberId ? { memberId } : {})} />));
    await flush();
  }

  function column(status: string): HTMLElement {
    return container.querySelector(`[data-board-column="${status}"]`) as HTMLElement;
  }

  function columnTotal(status: string): string | null {
    return column(status).querySelector("div.bg-secondary")?.textContent ?? null;
  }

  async function scrollToEnd(status: string) {
    const scroller = column(status).querySelector("div.overflow-auto") as HTMLElement;
    await act(async () => {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new browser.Event("scroll", { bubbles: true }));
    });
    await flush();
  }
});

async function waitForBoardRequest(requests: string[], predicate: (path: string) => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flush();
    if (requests.some(predicate)) return;
  }
  throw new Error("board request not observed");
}

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

function pageResponseWithPrefix(url: string, total: number, idPrefix: string, title: string): Response {
  const parsed = new URL(url, "https://app.test"); const status = parsed.searchParams.get("status") as TaskItem["status"];
  const page = Number(parsed.searchParams.get("page") ?? "1"); const pageSize = Number(parsed.searchParams.get("pageSize") ?? "20");
  const offset = (page - 1) * pageSize; const count = Math.max(0, Math.min(pageSize, total - offset));
  const items = Array.from({ length: count }, (_unused, index) => task(status, `${title} ${index + 1}`, `${idPrefix}-${index}`));
  return Response.json({ items, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } });
}

/** Like `pageResponseFor`, but every page gets distinct row ids so a column can append without duplicate React keys. */
function pagedResponse(url: string, total: number, title: string): Response {
  const parsed = new URL(url, "https://app.test"); const status = parsed.searchParams.get("status") as TaskItem["status"];
  const page = Number(parsed.searchParams.get("page") ?? "1"); const pageSize = Number(parsed.searchParams.get("pageSize") ?? "20");
  const offset = (page - 1) * pageSize; const count = Math.max(0, Math.min(pageSize, total - offset));
  const items = Array.from({ length: count }, (_unused, index) => task(status, `${title} p${page}.${index + 1}`, `${status}-p${page}-${index}`));
  return Response.json({ items, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } });
}

function task(status: TaskItem["status"], title: string, id: string): TaskItem {
  return { id, title, notes: "", status, progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
}

function statusFromUrl(url: string): string | null { return new URL(url, "https://app.test").searchParams.get("status"); }
function pageFromUrl(url: string): number { return Number(new URL(url, "https://app.test").searchParams.get("page")); }
function boardTaskIds(column: HTMLElement): string[] { return [...column.querySelectorAll("[data-board-task]")].map((element) => element.getAttribute("data-board-task")!); }
function buttonByText(column: HTMLElement, text: string): HTMLButtonElement { return [...column.querySelectorAll("button")].find((button) => button.textContent?.includes(text)) as HTMLButtonElement; }
function errorResponse(): Response { return Response.json({ error: { code: "TEST_ERROR", message: "failed", retryable: true } }, { status: 500 }); }
function rejectedResponse(): Response { return Response.json({ error: { code: "TASK_TRANSITION_INVALID", message: "invalid", retryable: false } }, { status: 422 }); }
function detailResponse(item: TaskItem): Response { return Response.json({ task: item, tags: [], links: [] }); }
async function change(select: HTMLSelectElement, value: string) { await act(async () => { select.value = value; select.dispatchEvent(new window.Event("change", { bubbles: true })); }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }

function deniedResponse(status: number): Response { return Response.json({ error: { code: "FORBIDDEN", message: "denied", retryable: false } }, { status }); }
