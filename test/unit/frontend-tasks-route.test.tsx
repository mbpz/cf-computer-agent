import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceLeaveGuard } from "../../frontend/lib/workspace-location";
import type { WorkspaceLeaveDecision } from "../../frontend/lib/workspace-navigation-gate";
import { TasksRoute } from "../../frontend/app";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { ToastProvider } from "../../frontend/lib/use-toast";
import { stubListViewport } from "../helpers/list-viewport";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("private tasks route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/tasks?status=doing" }); vi.stubGlobal("window", browser); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { vi.useRealTimers(); await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(["cancel", "accept"] as const)("%s leaves task query side effects inside admitted navigation", async outcome => {
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { requests.push({ url: String(input), signal: init?.signal ?? undefined }); return taskPage(String(input)); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    let decision!: WorkspaceLeaveDecision;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: "confirm", version: "other-draft", prompt(value) { decision = value; }, dismiss() {} }));
    try {
      const count = requests.length;
      await selectFilter("Priority", "high"); await flush();
      expect(browser.location.search).toBe("?status=doing");
      expect(requests).toHaveLength(count); expect(requests[0]?.signal?.aborted).toBe(false);
      expect(filterTrigger("Priority").textContent).not.toContain("high");
      await act(async () => decision[outcome]()); await flush();
      if (outcome === "cancel") { expect(requests).toHaveLength(count); expect(browser.location.search).toBe("?status=doing"); }
      else { expect(requests).toHaveLength(count + 1); expect(requests.at(-1)?.url).toContain("priority=high"); expect(requests[0]?.signal?.aborted).toBe(true); }
    } finally { unregister(); }
  });

  it("restores filters on popstate, aborts the stale request, and ignores URL page params", async () => {
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); requests.push({ url, signal: init?.signal ?? undefined }); return taskPage(url); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    expect(requests[0]?.url).toContain("status=doing"); expect(requests[0]?.url).toContain("page=1"); expect(requests[0]?.url).toContain("pageSize=20");
    await act(async () => { browser.history.pushState({}, "", "/tasks?priority=high&pageSize=50"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests.at(-1)?.url).toContain("priority=high");
    expect(requests.at(-1)?.url).toContain("page=1"); expect(requests.at(-1)?.url).toContain("pageSize=20"); expect(requests.at(-1)?.url).not.toContain("pageSize=50");
  });

  it("clears a stale action error when browser history restores a query", async () => {
    let listRequests = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return rejectedResponse();
      listRequests += 1;
      return listRequests < 3 ? taskPage(String(input)) : new Promise<Response>(() => undefined);
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await selectFilter("Priority", "high"); await flush();
    await clickButton("Complete: Alpha (task-alpha)"); await flush();
    expect(container.textContent).toContain("Unable to update the task.");
    await act(async () => browser.history.back()); await flush();
    expect(browser.location.search).toContain("status=doing"); expect(listRequests).toBe(3);
    expect(container.textContent).not.toContain("Unable to update the task.");
  });

  it("distinguishes same-title task actions while preserving reopen and blank-title labels", async () => {
    browser.history.replaceState({}, "", "/tasks");
    const alphaOne = { ...createTask("Alpha"), id: "task-alpha-1" };
    const alphaTwo = { ...createTask("Alpha"), id: "task-alpha-2" };
    const beta = { ...createTask("Beta"), id: "task-beta", status: "done" as const };
    const blank = { ...createTask(""), id: "task-blank" };
    vi.stubGlobal("fetch", async () => Response.json({ items: [alphaOne, alphaTwo, beta, blank], pagination: { page: 1, pageSize: 20, total: 4, totalPages: 1 } }));
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    const names = [...container.querySelectorAll("button[aria-label]")].map((button) => button.getAttribute("aria-label")).filter((name) => /^(Complete|Reopen|Delete):/u.test(name ?? ""));
    expect(names).toEqual(expect.arrayContaining(["Complete: Alpha (task-alpha-1)", "Delete: Alpha (task-alpha-1)", "Complete: Alpha (task-alpha-2)", "Delete: Alpha (task-alpha-2)", "Reopen: Beta (task-beta)", "Delete: Beta (task-beta)", "Complete: task-blank", "Delete: task-blank"]));
    expect(new Set(names).size).toBe(names.length);
  });

  it("refreshes the window from page 1 after a delete", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); urls.push(url); if (init?.method === "DELETE") return new Response(null, { status: 204 }); return taskPage(url); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    const button = container.querySelector('button[aria-label^="Delete:"]') as HTMLButtonElement; expect(button).toBeTruthy();
    await act(async () => button.click()); await flush();
    expect(urls.filter((url) => url.startsWith("/api/tasks?")).length).toBe(1);
    await clickButton("Delete permanently"); await flush();
    const lists = urls.filter((url) => url.startsWith("/api/tasks?"));
    expect(lists).toHaveLength(2);
    expect(lists.at(-1)).toContain("page=1"); expect(lists.at(-1)).toContain("pageSize=20");
    expect(browser.location.search).toContain("status=doing"); expect(browser.location.search).not.toContain("page=");
  });

  it.each([
    ["Status", "blocked", "status"],
    ["Priority", "high", "priority"],
    ["Due", "today", "due"],
  ])("synchronizes %s into the URL", async (label, value, key) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => taskPage(String(input)));
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await selectFilter(label, value); await flush();
    expect(browser.location.search).toContain(`${key}=${value}`);
    expect(browser.location.search).not.toContain("page=");
  });

  it("appends the next page of tasks on end-of-list without duplicating the first page", async () => {
    stubListViewport(browser, "mobile");
    const urls: string[] = [];
    const pageFor = (url: string): Response => {
      const page = Number(new URL(url, "https://app.test").searchParams.get("page") || "1");
      const items = page === 1 ? Array.from({ length: 20 }, (_, index) => ({ ...createTask(`Alpha ${index}`), id: `task-alpha-${index}` })) : [createTask("Beta")];
      return Response.json({ items, pagination: { page, pageSize: 20, total: 21, totalPages: 2 } });
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); return pageFor(url); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    const requestedPages = () => urls.filter((url) => url.startsWith("/api/tasks?")).map((url) => new URL(url, "https://app.test").searchParams.get("page"));
    expect(requestedPages()).toEqual(["1"]);
    expect(container.textContent).toContain("Alpha 0");
    await scrollToEnd();
    expect(requestedPages()).toEqual(["1", "2"]);
    expect(container.textContent).toContain("Alpha 0"); expect(container.textContent).toContain("Beta");
    await scrollToEnd();
    expect(requestedPages()).toEqual(["1", "2"]);
  });

  it.each([["Search tasks", "q"], ["Tag", "tag"]])("debounces rapid %s changes into one replace transition and one request", async (label, key) => {
    let gets = 0;
    const replaceState = vi.spyOn(browser.history, "replaceState").mockClear(); const pushState = vi.spyOn(browser.history, "pushState").mockClear();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { gets += 1; return taskPage(String(input)); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush(); vi.useFakeTimers();
    const input = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
    await change(input, "a"); await change(input, "al"); await change(input, "alpha");
    expect(input.value).toBe("alpha"); expect(gets).toBe(1); expect(replaceState).not.toHaveBeenCalled(); expect(pushState).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(299); }); expect(gets).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); await settle();
    expect(gets).toBe(2); expect(replaceState).toHaveBeenCalledTimes(1); expect(pushState).not.toHaveBeenCalled();
    expect(browser.location.search).toContain(`${key}=alpha`); expect(browser.location.search).not.toContain("page=");
    vi.useRealTimers();
  });

  it("cancels a pending text filter timer on unmount", async () => {
    let gets = 0;
    const replaceState = vi.spyOn(browser.history, "replaceState").mockClear();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { gets += 1; return taskPage(String(input)); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush(); vi.useFakeTimers();
    await change(container.querySelector('[aria-label="Tag"]') as HTMLInputElement, "urgent");
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(gets).toBe(1); expect(replaceState).not.toHaveBeenCalled(); vi.useRealTimers();
  });

  it("aborts a debounced list request when unmounted", async () => {
    let gets = 0; let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      gets += 1; if (gets === 1) return taskPage(String(input));
      signal = init?.signal ?? undefined; return new Promise<Response>(() => undefined);
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush(); vi.useFakeTimers();
    await change(container.querySelector('[aria-label="Search tasks"]') as HTMLInputElement, "alpha");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); }); await settle();
    expect(gets).toBe(2); expect(signal?.aborted).toBe(false);
    await act(async () => root.unmount()); root = createRoot(container);
    expect(signal?.aborted).toBe(true); vi.useRealTimers();
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
    stubListViewport(browser, "mobile");
    let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      gets += 1;
      if (gets === 2) return errorResponse();
      const title = gets >= 3 ? "Beta" : "Alpha";
      const items = Array.from({ length: 20 }, (_, index) => ({ ...createTask(`${title} ${index}`), id: `task-${title.toLowerCase()}-${index}` }));
      return Response.json({ items, pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } });
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    expect(container.textContent).toContain("Alpha 0");
    await scrollToEnd();
    expect(container.textContent).toContain("Alpha 0"); expect(container.querySelector('[role="alert"]')).toBeTruthy();
    await clickButton("Try search again"); await flush(); await flush();
    expect(gets).toBe(3); expect(container.textContent).toContain("Beta 0"); expect(container.textContent).not.toContain("Alpha 0");
  });

  it("does not answer a failed condition change with the previous condition's rows", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => (++gets === 1 ? taskPage(String(input)) : errorResponse()));
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    expect(container.textContent).toContain("Alpha");
    await selectFilter("Priority", "high"); await flush();
    expect(container.textContent).not.toContain("Alpha");
    expect(container.textContent).toContain("Unable to load the page.");
    // The page shell and its filters stay mounted through the failed condition change.
    expect([...container.querySelectorAll("h1")]).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe(frontendText(createLocaleRuntime(), "TASKS_TITLE"));
    expect(filterTrigger("Priority")).not.toBeNull();
  });

  it.each([401, 403])("clears protected tasks when a list refresh returns %s", async (status) => {
    stubListViewport(browser, "mobile");
    const items = Array.from({ length: 20 }, (_, index) => ({ ...createTask(`Alpha ${index}`), id: `task-alpha-${index}` }));
    let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      gets += 1;
      return gets === 1
        ? Response.json({ items, pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } })
        : Response.json({ error: { code: "DENIED", message: "private detail" } }, { status });
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    expect(container.textContent).toContain("Alpha 0");
    await scrollToEnd();
    expect(container.textContent).not.toContain("Alpha 0");
    expect(container.querySelector('[aria-label="Complete: Alpha 0 (task-alpha-0)"]')).toBeNull();
    expect(container.textContent).toContain("Try search again");
    expect(container.textContent).not.toContain("private detail");
  });

  it.each([401, 403])("clears protected tasks when a mutation returns %s", async (status) => {
    let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return Response.json({ error: { code: "DENIED" } }, { status }); }
      return taskPage(String(input));
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Complete: Alpha (task-alpha)"); await flush();
    expect(container.textContent).not.toContain("Alpha");
    expect(container.textContent).toContain("Try search again");
    await clickButton("Try search again"); await flush();
    expect(container.textContent).toContain("Alpha");
    expect(posts).toBe(1); // Explicit recovery is a GET, never a replayed mutation.
  });

  it.each([401, 403])("clears protected tasks when the post-mutation read returns %s", async (status) => {
    let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json(createTask("Alpha"));
      return ++gets === 1 ? taskPage(String(input)) : Response.json({ error: { code: "DENIED" } }, { status });
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Complete: Alpha (task-alpha)"); await flush();
    expect(container.textContent).not.toContain("Alpha");
    expect(container.textContent).toContain("Try search again");
  });

  it("ignores a late list response after a mutation revokes access", async () => {
    let gets = 0;
    let resolveRead!: (response: Response) => void;
    let resolveMutation!: (response: Response) => void;
    const read = new Promise<Response>((resolve) => { resolveRead = resolve; });
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return mutation;
      return ++gets === 1 ? taskPage(String(input)) : read;
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Complete: Alpha (task-alpha)");
    await selectFilter("Priority", "high"); await flush();
    expect(gets).toBe(2);
    await act(async () => resolveMutation(Response.json({ error: { code: "DENIED" } }, { status: 403 }))); await flush();
    expect(container.textContent).not.toContain("Alpha");
    await act(async () => resolveRead(taskPage(browser.location.href, "Late private title"))); await flush();
    expect(container.textContent).not.toContain("Late private title");
    expect(container.textContent).toContain("Try search again");
  });

  it("does not let a mutation refresh overwrite a newer query", async () => {
    let gets = 0; let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return mutation;
      gets += 1; return taskPage(String(input), gets === 1 ? "Alpha" : "Latest");
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await act(async () => (container.querySelector('[aria-label="Complete: Alpha (task-alpha)"]') as HTMLButtonElement).click());
    await selectFilter("Priority", "high"); await flush();
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
    await clickButton("Complete: Alpha (task-alpha)"); await flush();
    expect(container.textContent).toContain("Alpha"); expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).toContain("Unable to load the page."); expect(container.textContent).toContain("Try search again");
    expect(container.textContent).not.toContain("Unable to update the task.");
  });

  it("reports definite mutation rejections as non-load action errors", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? rejectedResponse() : taskPage(String(input)));
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Complete: Alpha (task-alpha)"); await flush();
    expect(container.textContent).toContain("Unable to update the task."); expect(container.textContent).not.toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Try search again");
  });

  it("clears a stale action error when debounced query navigation starts", async () => {
    let listRequests = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return rejectedResponse();
      listRequests += 1;
      return listRequests === 1 ? taskPage(String(input)) : new Promise<Response>(() => undefined);
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Complete: Alpha (task-alpha)"); await flush();
    expect(container.textContent).toContain("Unable to update the task.");
    vi.useFakeTimers(); await change(container.querySelector('[aria-label="Search tasks"]') as HTMLInputElement, "beta");
    expect(container.textContent).toContain("Unable to update the task."); expect(listRequests).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); }); await settle();
    expect(listRequests).toBe(2); expect(container.textContent).not.toContain("Unable to update the task.");
    vi.useRealTimers();
  });

  it("locks every task mutation control while one mutation is pending", async () => {
    browser.history.replaceState({}, "", "/tasks"); let mutations = 0; let resolveMutation!: (response: Response) => void;
    const mutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    const items = [{ ...createTask("Alpha"), id: "task-alpha" }, { ...createTask("Beta"), id: "task-beta" }];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { mutations += 1; return mutation; }
      return Response.json({ items, pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } });
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Complete: Alpha (task-alpha)");
    const secondComplete = container.querySelector('[aria-label="Complete: Beta (task-beta)"]') as HTMLButtonElement;
    const secondDelete = container.querySelector('[aria-label="Delete: Beta (task-beta)"]') as HTMLButtonElement;
    expect(secondComplete.disabled).toBe(true); expect(secondDelete.disabled).toBe(true);
    await act(async () => secondComplete.click()); expect(mutations).toBe(1);
    await act(async () => resolveMutation(Response.json(items[0]))); await flush();
  });

  it("cancels deletion without HTTP writes then deletes the exact same-title target once", async () => {
    browser.history.replaceState({}, "", "/tasks"); const writes: Array<{ url: string; body: string | null }> = []; let finish!: (response: Response) => void;
    const items = [{ ...createTask("Same"), id: "first" }, { ...createTask("Same"), id: "second-id" }];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") { writes.push({ url: String(input), body: init.body === undefined || init.body === null ? null : String(init.body) }); return new Promise<Response>(resolve => { finish = resolve; }); }
      return Response.json({ items: writes.length ? [items[0]] : items, pagination: { page: 1, pageSize: 20, total: writes.length ? 1 : 2, totalPages: 1 } });
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search="" />)); await flush();
    await clickButton("Delete: Same (second-id)"); expect(writes).toEqual([]); await clickButton("Cancel"); expect(writes).toEqual([]);
    await clickButton("Delete: Same (second-id)"); const confirm = document.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await act(async () => { confirm.click(); confirm.click(); });
    // The confirmed row's own version is the precondition: an old confirmation cannot delete a newer task.
    expect(writes).toEqual([{ url: "/api/tasks/second-id", body: JSON.stringify({ expectedUpdatedAt: items[1]!.updatedAt }) }]);
    expect((container.querySelector('[aria-label="Delete: Same (first)"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish(new Response(null, { status: 204 }))); await flush();
    expect(container.querySelector('[aria-label="Delete: Same (second-id)"]')).toBeNull();
    expect((container.querySelector('[aria-label="Delete: Same (first)"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([401, 403])("clears tasks and does not replay a confirmed delete denied with %s", async status => {
    let deletes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") { deletes++; return Response.json({ error: { code: "DENIED", message: "private server detail" } }, { status }); }
      return taskPage(String(input));
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Delete: Alpha (task-alpha)"); expect(deletes).toBe(0); await clickButton("Delete permanently"); await flush();
    expect(deletes).toBe(1); expect(container.textContent).not.toContain("Alpha"); expect(container.textContent).not.toContain("private server detail");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull(); await clickButton("Try search again"); await flush();
    expect(deletes).toBe(1); expect(container.textContent).toContain("Alpha");
  });

  it("invalidates an open delete during browser history read and rejects its stale button", async () => {
    let gets = 0; let deletes = 0; let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") { deletes++; return new Response(null, { status: 204 }); }
      return ++gets === 1 ? taskPage(String(input)) : new Promise<Response>(resolve => { finish = resolve; });
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Delete: Alpha (task-alpha)"); const old = document.querySelector('[data-confirm-action]') as HTMLButtonElement;
    // Same condition set: this is a refresh read, so the rows stay with their controls disabled.
    await act(async () => { browser.history.pushState({}, "", "/tasks?status=doing&page=1"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull(); expect((container.querySelector('[aria-label="Delete: Alpha (task-alpha)"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => old.click()); expect(deletes).toBe(0);
    await act(async () => finish(taskPage("/api/tasks?status=doing&page=1"))); await flush();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull(); expect(deletes).toBe(0);
  });

  it("blocks stale deletion after a successful delete whose list read fails until explicit GET recovery", async () => {
    let gets = 0; let deletes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") { deletes++; return new Response(null, { status: 204 }); }
      if (++gets === 2) return errorResponse(); return taskPage(String(input));
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Delete: Alpha (task-alpha)"); await clickButton("Delete permanently"); await flush();
    const stale = container.querySelector('[aria-label="Delete: Alpha (task-alpha)"]') as HTMLButtonElement; expect(stale.disabled).toBe(true);
    await act(async () => stale.click()); expect(document.querySelector('[role="alertdialog"]')).toBeNull(); expect(deletes).toBe(1);
    await clickButton("Try search again"); await flush(); expect(gets).toBe(3); expect(deletes).toBe(1);
    expect((container.querySelector('[aria-label="Delete: Alpha (task-alpha)"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not automatically repeat a rejected delete and requires a fresh confirmation for another attempt", async () => {
    let deletes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") { deletes++; return rejectedResponse(); } return taskPage(String(input));
    });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    await clickButton("Delete: Alpha (task-alpha)"); await clickButton("Delete permanently"); await flush();
    expect(deletes).toBe(1); expect(container.textContent).toContain("Unable to update the task."); expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await clickButton("Delete: Alpha (task-alpha)"); expect(deletes).toBe(1); await clickButton("Cancel"); expect(deletes).toBe(1);
  });

  describe("unknown list writes", () => {
    const KEY = "memory-garden:task-write:v1:alice";
    async function leave() { let result: string | undefined; await act(async () => { result = writeWorkspaceHistory("push", "/settings"); }); return result; }
    async function render(memberId?: string) { const locale = createLocaleRuntime(); await act(async () => root.render(<ToastProvider locale={locale}><TasksRoute locale={locale} search={browser.location.search} {...(memberId ? { memberId } : {})} /></ToastProvider>)); await flush(); }
    const banner = () => container.querySelector("[data-task-list-unknown]") as HTMLElement | null;

    it("locks an unknown status change, keeps list queries usable, and settles it by a read-only check", async () => {
      let posts = 0; const gets: string[] = [];
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") { posts += 1; return errorResponse(); }
        gets.push(url);
        if (url === "/api/tasks/task-alpha") return Response.json({ task: { ...createTask("Alpha"), status: "done" }, tags: [], links: [] });
        return taskPage(url);
      });
      await render();
      await clickButton("Complete: Alpha (task-alpha)"); await flush();
      expect(banner()?.textContent).toContain("Alpha");
      expect(banner()?.textContent).toContain("unknown");
      expect(container.textContent).not.toContain("Unable to update the task.");
      expect((container.querySelector('[aria-label="Delete: Alpha (task-alpha)"]') as HTMLButtonElement).disabled).toBe(true);
      expect(await leave()).toBe("blocked");
      const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
      await selectFilter("Priority", "high"); await flush();
      expect(browser.location.search).toContain("priority=high");
      expect(banner()).not.toBeNull();

      await clickButton("Check the result"); await flush();
      expect(posts).toBe(1); expect(gets).toContain("/api/tasks/task-alpha");
      expect(banner()).toBeNull();
      // A settled save is transient feedback: it lives in the toast channel, outside the route tree.
      expect(browser.document.body.textContent).toContain("The change was saved.");
      expect(await leave()).toBe("committed");
    });

    it("reports a checked change that is not on the task and unlocks", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") return errorResponse();
        if (url === "/api/tasks/task-alpha") return Response.json({ task: createTask("Alpha"), tags: [], links: [] });
        return taskPage(url);
      });
      await render();
      await clickButton("Complete: Alpha (task-alpha)"); await flush();
      await clickButton("Check the result"); await flush();
      expect(banner()).toBeNull();
      expect(container.textContent).toContain("The change is not on the task.");
      expect((container.querySelector('[aria-label="Complete: Alpha (task-alpha)"]') as HTMLButtonElement).disabled).toBe(false);
    });

    it("retries an unknown delete and accepts a 404 retry as already deleted", async () => {
      let deletes = 0; let gone = false;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") { deletes += 1; if (deletes === 1) { gone = true; throw new TypeError("Network failed"); } return Response.json({ error: { code: "TASK_NOT_FOUND", message: "missing" } }, { status: 404 }); }
        return gone ? Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }) : taskPage(String(input));
      });
      browser.history.replaceState({}, "", "/tasks");
      await render();
      await clickButton("Delete: Alpha (task-alpha)"); await clickButton("Delete permanently"); await flush();
      expect(banner()).not.toBeNull();
      await clickButton("Retry same operation"); await flush();
      expect(deletes).toBe(2);
      expect(banner()).toBeNull();
      // A settled save is transient feedback: it lives in the toast channel, outside the route tree.
      expect(browser.document.body.textContent).toContain("The change was saved.");
    });

    it("restores an unknown delete after refresh from the tab record and checks it", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "DELETE") throw new TypeError("Network failed");
        if (url === "/api/tasks/task-alpha") return Response.json({ error: { code: "TASK_NOT_FOUND", message: "missing" } }, { status: 404 });
        return taskPage(url);
      });
      await render("alice");
      await clickButton("Delete: Alpha (task-alpha)"); await clickButton("Delete permanently"); await flush();
      expect(JSON.parse(browser.sessionStorage.getItem(KEY)!)).toEqual({ version: 1, memberId: "alice", intent: { op: "delete", taskId: "task-alpha", expectedUpdatedAt: "2026-01-01T00:00:00.000Z" } });
      await act(async () => root.unmount()); root = createRoot(container); await render("alice");
      expect(banner()?.textContent).toContain("task-alpha");
      expect(await leave()).toBe("blocked");
      await clickButton("Check the result"); await flush();
      expect(banner()).toBeNull();
      // A settled save is transient feedback: it lives in the toast channel, outside the route tree.
      expect(browser.document.body.textContent).toContain("The change was saved.");
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
    });

    it("restores a status write after refresh as a list check instead of an editor", async () => {
      browser.sessionStorage.setItem(KEY, JSON.stringify({ version: 1, memberId: "alice", intent: { op: "status", taskId: "task-alpha", status: "done", expectedStatus: "doing" } }));
      vi.stubGlobal("fetch", async (input: RequestInfo | URL) => String(input) === "/api/tasks/task-alpha"
        ? Response.json({ task: { ...createTask("Alpha"), status: "done" }, tags: [], links: [] }) : taskPage(String(input)));
      await render("alice");
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(banner()).not.toBeNull();
      await clickButton("Check the result"); await flush();
      expect(banner()).toBeNull();
    });

    it("clears the record on a definite rejection and shows the failure", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? rejectedResponse() : taskPage(String(input)));
      await render("alice");
      await clickButton("Complete: Alpha (task-alpha)"); await flush();
      expect(container.textContent).toContain("Unable to update the task.");
      expect(banner()).toBeNull();
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
    });

    it("sends the row status as expected and reports a change made elsewhere, then reloads", async () => {
      const bodies: string[] = []; let lists = 0;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") { bodies.push(String(init.body)); return Response.json({ error: { code: "TASK_STATUS_CONFLICT", message: "changed" } }, { status: 409 }); }
        lists += 1; return taskPage(String(input));
      });
      await render();
      const before = lists;
      await clickButton("Complete: Alpha (task-alpha)"); await flush();
      expect(bodies).toEqual([JSON.stringify({ status: "done", expectedStatus: "doing" })]);
      expect(container.textContent).toContain("changed elsewhere");
      expect(banner()).toBeNull();
      expect(lists).toBeGreaterThan(before);
    });

    it("does not send a list write it cannot record", async () => {
      let posts = 0;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { if (init?.method === "POST") posts += 1; return taskPage(String(input)); });
      await render("alice");
      vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
      await clickButton("Complete: Alpha (task-alpha)"); await flush();
      expect(posts).toBe(0);
      expect(container.textContent).toContain("was not sent");
    });
  });

  async function clickButton(name: string) {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name) as HTMLButtonElement;
    expect(button).toBeTruthy(); await act(async () => button.click());
  }

  // The shared beUI listbox keeps each filter's historical accessible name in an sr-only span.
  function filterTrigger(name: string) {
    const trigger = [...container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]')].find((node) => node.querySelector(".sr-only")?.textContent === name);
    expect(trigger, name).toBeTruthy();
    return trigger!;
  }

  async function selectFilter(name: string, value: string) {
    const trigger = filterTrigger(name);
    await act(async () => trigger.click());
    const option = [...trigger.parentElement!.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((node) => node.textContent === value);
    expect(option, value).toBeTruthy();
    await act(async () => option!.click());
  }

  async function scrollToEnd() {
    // The append feed scrolls the beUI todo list's viewport.
    const scroller = container.querySelector("[data-todo-list-viewport]") as HTMLElement;
    await act(async () => {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new browser.Event("scroll", { bubbles: true }));
    });
    await flush();
  }
});

function createTask(title: string) { return { id: `task-${title.toLowerCase()}`, title, notes: "", status: "doing", progress: 10, priority: "high", dueAt: null, completedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }; }
function taskPage(url: string, title = "Alpha"): Response { const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20"); return Response.json({ items: [createTask(title)], pagination: { page, pageSize, total: 1, totalPages: 1 } }); }
function rejectedResponse(): Response { return Response.json({ error: { code: "TASK_TRANSITION_INVALID", message: "invalid", retryable: false } }, { status: 422 }); }
function errorResponse(): Response { return Response.json({ error: { code: "TEST_ERROR", message: "failed", retryable: true } }, { status: 500 }); }
async function change(input: HTMLInputElement, value: string) { await act(async () => {
  input.value = value;
  const reactPropsKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
  const reactProps = reactPropsKey ? (input as unknown as Record<string, { onChange?: (event: { currentTarget: HTMLInputElement }) => void }>)[reactPropsKey] : undefined;
  reactProps?.onChange?.({ currentTarget: input });
}); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
async function settle() { await act(async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
