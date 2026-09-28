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
  let delayedCurrent: (() => Promise<Response>) | undefined, delayedDetail: (() => Promise<Response>) | undefined, delayedPost: (() => Promise<Response>) | undefined;
  let current: any = null;
  let transitionStatus = 0;
  let receipt: any = null;
  let receiptStatus = 0;
  let seedStorage: [string, string][] = [];
  const journalKey = "memory-garden:focus-create:v1:contributor-route-auditor";
  const main = () => app!.container.querySelector("main")!;
  const button = (text: string) => [...main().querySelectorAll<HTMLButtonElement>("button")].find(n => n.textContent === text)!;
  const click = async (node: HTMLElement) => act(async () => node.click());
  async function input(value: string) { await act(async () => { const node = main().querySelector('input[aria-label="Search tasks"]')!; const key = Object.keys(node).find(k => k.startsWith("__reactProps$"))!; (node as any)[key].onChange({currentTarget: {value}}); }); }
  async function mount(wait = true) {
    app = await mountAuthenticatedApp({url: "https://app.test/focus", role: "contributor", permissionMask: "0x100000", configureBrowser: browser => {for (const [key, value] of seedStorage) browser.sessionStorage.setItem(key, value);}, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test"), method = init?.method ?? "GET";
      calls.push({path: url.pathname + url.search, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal});
      if (url.pathname === "/api/navigation") return Response.json({tree: currentNavigationFixture("contributor", "0x100000")});
      if (url.pathname === "/api/telemetry/pageview") return Response.json({});
      if (url.pathname === "/api/focus/current") return delayedCurrent ? delayedCurrent() : Response.json({session: current});
      if (/^\/api\/focus\/[^/]+$/.test(url.pathname)) return receiptStatus ? apiError(receiptStatus, "DENIED") : receipt && receipt.id === url.pathname.split("/").pop() ? Response.json(receipt) : apiError(404, "FOCUS_NOT_FOUND");
      if (url.pathname === "/api/tasks") {
        if (delayed) return delayed();
        if (listStatus) return apiError(listStatus, "DENIED", "Denied");
        return Response.json(page(wrongPage ? 2 : Number(url.searchParams.get("page")), Number(url.searchParams.get("pageSize")), empty ? 0 : 21));
      }
      if (url.pathname.startsWith("/api/tasks/")) {
        if (delayedDetail) return delayedDetail();
        if (detailStatus) return apiError(detailStatus, "TASK_NOT_FOUND");
        return Response.json({task: task(wrongTarget ? 99 : Number(url.pathname.split("-").pop())), tags: [], links: []});
      }
      if (/^\/api\/focus\/[^/]+\/(pause|resume|complete|abandon)$/.test(url.pathname)) {
        if (transitionStatus) return apiError(transitionStatus, "FOCUS_CONFLICT");
        const action = url.pathname.split("/").pop()!;
        const status = {pause: "paused", resume: "active", complete: "completed", abandon: "abandoned"}[action];
        const result = {...current, status, updatedAt: new Date(Date.parse(current.updatedAt) + 1).toISOString()}; current = status === "completed" || status === "abandoned" ? null : result;
        return Response.json(result);
      }
      if (url.pathname === "/api/focus" && method === "POST") {
        if (delayedPost) return delayedPost();
        if (postStatus) return apiError(postStatus, "TASK_NOT_FOUND");
        const body = JSON.parse(String(init!.body)); current = {...body, status: "active", calendarEventId: null, startedAt: stamp, updatedAt: stamp, elapsedMs: 0, pausedAt: null, endedAt: null};
        return Response.json({session: current, created: true});
      }
      throw new Error(`Unexpected ${method} ${url}`);
    }});
    if (wait) await waitForApp(() => !!button("Start focus"));
  }
  async function open() { await click(button("Choose task")); await waitForApp(() => !!button("Owned task 1") || !!main().querySelector('[role="alert"]') || main().textContent!.includes("No matching tasks")); }
  async function select() { await open(); await click(button("Owned task 1")); }
  afterEach(async () => {await app?.unmount(); app = undefined; calls = []; current = null; receipt = null; receiptStatus = 0; seedStorage = []; transitionStatus = 0; listStatus = detailStatus = postStatus = 0; wrongPage = wrongTarget = empty = false; delayed = delayedCurrent = delayedDetail = delayedPost = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks();});
  it("hides stale transition controls after an unknown result and recovers with GET only", async () => {
    await mount(); await select(); await click(button("Start focus")); await waitForApp(() => !!button("Pause"));
    transitionStatus = 500; await click(button("Pause")); await waitForApp(() => !!button("Try focus again"));
    expect(button("Pause")).toBeUndefined(); expect(button("Complete")).toBeUndefined();
    current = {...current, status: "paused"}; transitionStatus = 0;
    await click(button("Try focus again")); await waitForApp(() => !!button("Resume"));
    expect(calls.filter(c => c.path.endsWith("/pause"))).toHaveLength(1);
  });
  it("restores the complete unresolved payload after a fresh App mount without automatically posting", async () => {
    await mount(); await select(); delayedPost = async () => {throw new Error("lost");};
    await click(button("Start focus")); await waitForApp(() => !!button("Retry saved start"));
    const original = calls.find(c => c.path === "/api/focus")!.body;
    seedStorage = [[journalKey, app!.browser.sessionStorage.getItem(journalKey)!]];
    await app!.unmount(); app = undefined;
    await mount(false); await waitForApp(() => !!button("Retry saved start"));
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(1);
    delayedPost = undefined; await click(button("Retry saved start")); await waitForApp(() => !!button("Pause"));
    expect(calls.filter(c => c.path === "/api/focus").map(c => c.body)).toEqual([original, original]);
    expect(app!.browser.sessionStorage.getItem(journalKey)).toBeNull();
  });
  it.each([401, 403])("hides recovery actions after receipt read denies access with %i", async status => {
    await mount(); await select(); delayedPost = async () => {throw new Error("lost");};
    await click(button("Start focus")); await waitForApp(() => !!button("Retry saved start"));
    receiptStatus = status; await navigate("/settings"); await navigate("/focus");
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(button("Retry saved start")).toBeUndefined(); expect(button("Choose task")).toBeUndefined();
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(1);
    expect(app!.browser.sessionStorage.getItem(journalKey)).not.toBeNull();
  });
  it("retains acknowledged intent after current readback fails and retries with GET only", async () => {
    await mount(); await select();
    delayedPost = async () => {
      const body = calls.at(-1)!.body;
      receipt = {...body, status: "active", startedAt: stamp, updatedAt: stamp, elapsedMs: 0}; current = receipt;
      delayedCurrent = async () => {throw new Error("readback lost");};
      return Response.json({session: receipt});
    };
    await click(button("Start focus")); await waitForApp(() => !!main().querySelector('[role="alert"]'));
    expect(button("Retry saved start")).toBeUndefined();
    expect(JSON.parse(app!.browser.sessionStorage.getItem(journalKey)!).acknowledged).toBe(true);
    delayedCurrent = undefined; await click(button("Try focus again")); await waitForApp(() => !!button("Pause"));
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(1);
    expect(app!.browser.sessionStorage.getItem(journalKey)).toBeNull();
  });
  it("keeps an older uncertain request locked when its retry preflight finds a missing task", async () => {
    await mount(); await select(); delayedPost = async () => {throw new Error("lost");};
    await click(button("Start focus")); await waitForApp(() => !!button("Retry saved start"));
    detailStatus = 404; await click(button("Retry saved start"));
    await waitForApp(() => calls.filter(c => c.path === "/api/tasks/task-1").length === 2 && !button("Retry saved start")?.disabled);
    expect(button("Choose task")).toBeUndefined(); expect(app!.browser.sessionStorage.getItem(journalKey)).not.toBeNull();
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(1);
  });
  it("keeps an uncertain start locked across route reentry and replays exactly one persisted intent", async () => {
    await mount(); await select(); delayedPost = async () => { throw new Error("network lost"); };
    await click(button("Start focus")); await waitForApp(() => !!button("Retry saved start"));
    const original = calls.find(c => c.path === "/api/focus")!.body;
    expect(button("Choose task")).toBeUndefined();
    await navigate("/settings"); await navigate("/focus");
    await waitForApp(() => !!button("Retry saved start"));
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(1);
    delayedPost = undefined; await click(button("Retry saved start"));
    await waitForApp(() => !!button("Pause"));
    expect(calls.filter(c => c.path === "/api/focus").map(c => c.body)).toEqual([original, original]);
  });
  it("recovers a lost start receipt with GET alone, including an already ended session", async () => {
    await mount(); await select();
    delayedPost = async () => {const body = calls.at(-1)!.body; receipt = {...body, status: "completed", startedAt: stamp, updatedAt: stamp, elapsedMs: 1000, endedAt: stamp}; throw new Error("lost");};
    await click(button("Start focus")); await waitForApp(() => !!button("Retry saved start"));
    await navigate("/settings"); await navigate("/focus");
    await waitForApp(() => !!button("Choose task"));
    expect(main().textContent).toContain("Completed");
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(1);
  });
  it("fails closed before POST when tab storage rejects the saved intent", async () => {
    await mount(); await select();
    vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => {throw new Error("quota");});
    await click(button("Start focus")); await waitForApp(() => !!main().querySelector('[role="alert"]'));
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(0);
  });
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
  async function navigate(path: string) {
    await act(async () => {app!.browser.history.pushState({}, "", path); app!.browser.dispatchEvent(new app!.browser.PopStateEvent("popstate"));});
  }
  it("aborts an initial session read on route exit and ignores its late result after reentry", async () => {
    let resolve!: (response: Response) => void; delayedCurrent = () => new Promise(done => {resolve = done;});
    await mount(false); await waitForApp(() => !!resolve); const request = calls.find(c => c.path === "/api/focus/current")!;
    await navigate("/settings"); expect(request.signal?.aborted).toBe(true);
    delayedCurrent = undefined; await navigate("/focus"); await waitForApp(() => !!button("Start focus"));
    await act(async () => resolve(Response.json({session: {...task(1), taskId: "late-private-task", clientKey: "late", status: "active", startedAt: stamp, updatedAt: stamp, elapsedMs: 0}})));
    expect(main().textContent).not.toContain("late-private-task"); expect(button("Start focus")).toBeDefined();
  });
  it("never starts after leaving while the target preflight is pending", async () => {
    let resolve!: (response: Response) => void; delayedDetail = () => new Promise(done => {resolve = done;});
    await mount(); await select(); await click(button("Start focus")); await waitForApp(() => !!resolve);
    const request = calls.find(c => c.path === "/api/tasks/task-1")!; await navigate("/settings");
    expect(request.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({task: task(1), tags: [], links: []})));
    expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(0);
  });
  it("ignores a late write receipt without starting a new read after route exit", async () => {
    let resolve!: (response: Response) => void; delayedPost = () => new Promise(done => {resolve = done;});
    await mount(); await select(); await click(button("Start focus")); await waitForApp(() => !!resolve); await navigate("/settings");
    const reads = calls.filter(c => c.path === "/api/focus/current").length;
    await act(async () => resolve(Response.json({session: {id: "late", clientKey: "late", taskId: "task-1", status: "active", startedAt: stamp, updatedAt: stamp, elapsedMs: 0}})));
    await act(async () => {await new Promise(done => setTimeout(done, 20));});
    expect(calls.filter(c => c.path === "/api/focus/current")).toHaveLength(reads);
    expect(main().textContent).not.toContain("Current session");
  });
  it("uses a synchronous action guard for two starts in one event turn", async () => {
    let resolve!: (response: Response) => void; delayedDetail = () => new Promise(done => {resolve = done;});
    await mount(); await select(); await act(async () => {button("Start focus").click(); button("Start focus").click();});
    await waitForApp(() => !!resolve); expect(calls.filter(c => c.path === "/api/tasks/task-1")).toHaveLength(1);
    await act(async () => resolve(Response.json({task: task(1), tags: [], links: []})));
    await waitForApp(() => main().textContent!.includes("Current session")); expect(calls.filter(c => c.path === "/api/focus")).toHaveLength(1);
  });
  it("aborts the post-write reconciliation read on exit", async () => {
    let resolve!: (response: Response) => void; await mount(); await select(); delayedCurrent = () => new Promise(done => {resolve = done;});
    await click(button("Start focus")); await waitForApp(() => !!resolve); const request = calls.filter(c => c.path === "/api/focus/current").at(-1)!;
    await navigate("/settings"); expect(request.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({session: current})));
    expect(main().textContent).not.toContain("Current session");
  });
  it.each([["Complete", "Completed"], ["Abandon", "Abandoned"]])("shows pause/resume and %s receipt only after current readback", async (action, status) => {
    await mount(); await select(); await click(button("Start focus")); await waitForApp(() => !!button("Pause"));
    await click(button("Pause")); await waitForApp(() => !!button("Resume"));
    expect(main().textContent).toContain("Paused");
    await click(button("Resume")); await waitForApp(() => !!button("Pause"));
    await click(button(action)); await waitForApp(() => !!button("Start focus"));
    expect(main().querySelector('[role="status"]')?.textContent).toContain(status);
    const actions = calls.filter(c => /^\/api\/focus\/[^/]+\//.test(c.path));
    expect(actions.map(c => c.path.split("/").pop())).toEqual(["pause", "resume", action.toLowerCase()]);
    expect(calls.filter(c => c.path === "/api/focus/current")).toHaveLength(5);
  });
  it("requires GET recovery after a transition conflict and never automatically retries the write", async () => {
    await mount(); await select(); await click(button("Start focus")); await waitForApp(() => !!button("Pause"));
    transitionStatus = 409;
    await click(button("Pause")); await waitForApp(() => !!button("Try focus again"));
    expect(main().textContent).toContain("Focus changed. Reload its state before acting again.");
    expect(button("Pause")).toBeUndefined();
    current = {...current, status: "paused", pausedAt: stamp};
    await click(button("Try focus again")); await waitForApp(() => !!button("Resume"));
    expect(calls.filter(c => c.path.endsWith("/pause"))).toHaveLength(1);
  });
  it("renders restored active elapsed time from the clock rather than accumulating timer ticks", async () => {
    const now = Date.parse(stamp) + 10_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    current = {id: "restored", clientKey: "restored", taskId: "task-1", calendarEventId: null, status: "active", startedAt: stamp, updatedAt: stamp, pausedAt: null, endedAt: null, elapsedMs: 5_000};
    await mount(false);
    await waitForApp(() => main().querySelector('[data-focus-elapsed]')?.textContent === "00:00:15");
    clock.mockReturnValue(now + 60_000);
    await act(async () => {await new Promise(done => setTimeout(done, 1100));});
    await waitForApp(() => main().querySelector('[data-focus-elapsed]')?.textContent === "00:01:15");
    await navigate("/settings"); await navigate("/focus");
    await waitForApp(() => main().querySelector('[data-focus-elapsed]')?.textContent === "00:01:15");
    expect(calls.filter(c => c.method === "POST" && c.path.startsWith("/api/focus"))).toHaveLength(0);
  });
  it("restores paused elapsed without counting paused wall time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(stamp) + 600_000);
    current = {id: "paused", clientKey: "paused", taskId: "task-1", calendarEventId: null, status: "paused", startedAt: stamp, updatedAt: stamp, pausedAt: stamp, endedAt: null, elapsedMs: 65_000};
    await mount(false);
    await waitForApp(() => main().querySelector('[data-focus-elapsed]')?.textContent === "00:01:05");
    expect(button("Resume")).toBeDefined(); expect(button("Pause")).toBeUndefined();
  });
  it("aborts a closed picker and ignores a late private list", async () => {
    let resolve!: (response: Response) => void; delayed = () => new Promise(done => {resolve = done;}); await mount(); await click(button("Choose task")); await waitForApp(() => !!resolve);
    const request = calls.find(c => c.path.startsWith("/api/tasks?"))!; await click(button("Close task picker")); expect(request.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json(page()))); expect(button("Owned task 1")).toBeUndefined(); expect(button("Start focus").disabled).toBe(true);
  });
});
