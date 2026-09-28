// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const stamp = "2026-09-28T00:00:00.000Z";
const task = (id: number) => ({id: `task-${id}`, title: `Owned task ${id}`, notes: "", status: "todo", priority: "medium", progress: 0, dueAt: null, completedAt: null, createdAt: stamp, updatedAt: stamp});
const page = (number = 1, size = 20, total = 21) => ({items: Array.from({length: Math.max(0, Math.min(size, total - (number - 1) * size))}, (_, i) => task((number - 1) * size + i + 1)), pagination: {page: number, pageSize: size, total, totalPages: Math.ceil(total / size)}});
describe("Focus owned task selection through App", () => {
  let app: MountedApp | undefined;
  let calls: {path: string; method: string; body?: any; signal?: AbortSignal | null}[] = [];
  let listStatus = 0, detailStatus = 0, postStatus = 0, wrongPage = false, wrongTarget = false, empty = false;
  let delayed: (() => Promise<Response>) | undefined;
  let current: any = null;
  const main = () => app!.container.querySelector("main")!;
  const button = (text: string) => [...main().querySelectorAll<HTMLButtonElement>("button")].find(n => n.textContent === text)!;
  const click = async (node: HTMLElement) => act(async () => node.click());
  async function input(value: string) { await act(async () => { const node = main().querySelector('input[aria-label="Search tasks"]')!; const key = Object.keys(node).find(k => k.startsWith("__reactProps$"))!; (node as any)[key].onChange({currentTarget: {value}}); }); }
  async function mount() {
    app = await mountAuthenticatedApp({url: "https://app.test/focus", role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test"), method = init?.method ?? "GET";
      calls.push({path: url.pathname + url.search, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal});
      if (url.pathname === "/api/navigation") return Response.json({tree: currentNavigationFixture("contributor", "0x100000")});
      if (url.pathname === "/api/telemetry/pageview") return Response.json({});
      if (url.pathname === "/api/focus/current") return Response.json({session: current});
      if (url.pathname === "/api/tasks") {
        if (delayed) return delayed();
        if (listStatus) return apiError(listStatus, "DENIED", "Denied");
        return Response.json(page(wrongPage ? 2 : Number(url.searchParams.get("page")), Number(url.searchParams.get("pageSize")), empty ? 0 : 21));
      }
      if (url.pathname.startsWith("/api/tasks/")) {
        if (detailStatus) return apiError(detailStatus, "TASK_NOT_FOUND", "Unavailable");
        return Response.json({task: task(wrongTarget ? 99 : Number(url.pathname.split("-").pop())), tags: [], links: []});
      }
      if (url.pathname === "/api/focus" && method === "POST") {
        if (postStatus) return apiError(postStatus, "TASK_NOT_FOUND", "Unavailable");
        const body = JSON.parse(String(init!.body)); current = {...body, status: "active", calendarEventId: null, startedAt: stamp, elapsedMs: 0, pausedAt: null, endedAt: null};
        return Response.json({session: current, created: true});
      }
      throw new Error(`Unexpected ${method} ${url}`);
    }});
    await waitForApp(() => !!button("Start focus"));
  }
  async function open() { await click(button("Choose task")); await waitForApp(() => !!button("Owned task 1") || !!main().querySelector('[role="alert"]') || main().textContent!.includes("No matching tasks")); }
  async function select() { await open(); await click(button("Owned task 1")); }
  afterEach(async () => {await app?.unmount(); app = undefined; calls = []; current = null; listStatus = detailStatus = postStatus = 0; wrongPage = wrongTarget = empty = false; delayed = undefined; vi.unstubAllGlobals();});
  it("replaces pasted IDs with owned selection and reauthorizes the exact task before starting", async () => {
    await mount(); expect(main().querySelector('input[aria-label="Task ID"]')).toBeNull(); expect(button("Start focus").disabled).toBe(true);
    await select(); expect(button("Start focus").disabled).toBe(false); await click(button("Start focus")); await waitForApp(() => main().textContent!.includes("Current session"));
    const actions = calls.filter(c => c.path === "/api/tasks/task-1" || c.path === "/api/focus");
    expect(actions.map(c => c.method)).toEqual(["GET", "POST"]); expect(actions[1].body.taskId).toBe("task-1");
  });
  it("paginates owned tasks and resets search to page one", async () => {
    await mount(); await open(); await click(main().querySelector<HTMLButtonElement>('[aria-label="Next page"]')!); await waitForApp(() => !!button("Owned task 21"));
    expect(button("Owned task 1")).toBeUndefined(); await input("  special  "); await click(button("Search tasks")); await waitForApp(() => !!button("Owned task 1"));
    const requests = calls.filter(c => c.path.startsWith("/api/tasks?")); const last = new URL(requests.at(-1)!.path, "https://app.test");
    expect(last.searchParams.get("q")).toBe("special"); expect(last.searchParams.get("page")).toBe("1"); expect(last.searchParams.has("memberId")).toBe(false);
  });
  it("shows an honest empty search without enabling start", async () => {empty = true; await mount(); await open(); expect(main().textContent).toContain("No matching tasks"); expect(button("Start focus").disabled).toBe(true);});
  it("rejects mismatched page metadata", async () => {wrongPage = true; await mount(); await open(); expect(button("Owned task 21")).toBeUndefined(); expect(main().textContent).toContain("Unable to load");});
  it("retries a failed list with GET only", async () => {listStatus = 500; await mount(); await open(); listStatus = 0; await click(button("Retry tasks")); await waitForApp(() => !!button("Owned task 1")); expect(calls.filter(c => c.path.startsWith("/api/tasks?")).map(c => c.method)).toEqual(["GET", "GET"]);});
  it.each([401,403])("clears private selection UI when task list access returns %i", async status => {listStatus = status; await mount(); await open(); expect(main().textContent).toContain("Unable to load"); expect(button("Start focus")).toBeUndefined(); expect(main().textContent).not.toContain("Owned task");});
  it.each([401,403,404])("does not POST when the selected task preflight returns %i", async status => {await mount(); await select(); detailStatus = status; await click(button("Start focus")); await waitForApp(() => !!main().querySelector('[role="alert"]') || main().textContent!.includes("Unable to load")); expect(calls.filter(c => c.path === "/api/tasks/task-1")).toHaveLength(1); expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(0); expect(main().querySelector('[data-focus-selected]')).toBeNull(); if(status === 404) expect(button("Start focus").disabled).toBe(true);});
  it("rejects a wrong-target preflight without writing", async () => {await mount(); await select(); wrongTarget = true; await click(button("Start focus")); await waitForApp(() => !!main().querySelector('[role="alert"]')); expect(calls.filter(c => c.path === "/api/tasks/task-1")).toHaveLength(1); expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(0); expect(button("Start focus").disabled).toBe(true);});
  it("invalidates selection if the task disappears between preflight and POST", async () => {await mount(); await select(); postStatus = 404; await click(button("Start focus")); await waitForApp(() => !!main().querySelector('[role="alert"]')); expect(button("Start focus").disabled).toBe(true); expect(main().textContent).toContain("Task is unavailable");});
  it("changes page size using the shared pagination contract", async () => {
    await mount(); await open(); await act(async () => {
      const node = main().querySelector<HTMLSelectElement>('select[aria-label="Rows per page"]')!;
      node.value = "50"; node.dispatchEvent(new app!.browser.Event("change", {bubbles: true}));
    });
    await waitForApp(() => !!button("Owned task 21"));
    expect(calls.filter(c => c.path.startsWith("/api/tasks?")).at(-1)!.path).toContain("page=1&pageSize=50");
    expect(button("Owned task 1")).toBeDefined();
  });
  it("ignores an old search response after a newer query succeeds", async () => {
    let resolve!: (response: Response) => void; delayed = () => new Promise(done => {resolve = done;});
    await mount(); await click(button("Choose task")); await waitForApp(() => !!resolve);
    const old = calls.find(c => c.path.startsWith("/api/tasks?"))!;
    delayed = undefined; empty = true; await input("nothing"); await click(button("Search tasks"));
    await waitForApp(() => main().textContent!.includes("No matching tasks")); expect(old.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json(page())));
    expect(button("Owned task 1")).toBeUndefined(); expect(main().textContent).toContain("No matching tasks");
  });
  it("aborts a closed picker and ignores a late private list", async () => {
    let resolve!: (response: Response) => void; delayed = () => new Promise(done => {resolve = done;}); await mount(); await click(button("Choose task")); await waitForApp(() => !!resolve);
    const request = calls.find(c => c.path.startsWith("/api/tasks?"))!; await click(button("Close task picker")); expect(request.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json(page()))); expect(button("Owned task 1")).toBeUndefined(); expect(button("Start focus").disabled).toBe(true);
  });
});
