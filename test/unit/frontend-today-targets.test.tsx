// @vitest-environment node
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const stamp = "2026-09-28T00:00:00.000Z";
const task = { id: "task-1", title: "Snapshot task", notes: "Fresh notes", status: "todo", priority: "medium", progress: 0, dueAt: stamp, completedAt: null, createdAt: stamp, updatedAt: stamp };
const event = { id: "event-1", clientKey: "key-1", title: "Snapshot event", description: "Fresh event description", kind: "event", status: "scheduled", startsAt: stamp, endsAt: "2026-09-28T01:00:00.000Z", timezone: "UTC", allDay: false, taskId: null, projectId: null, updatedAt: stamp };
const summary = { todo: 23, doing: 1, blocked: 2, done: 0, canceled: 0, dueToday: 15, overdue: 1 };
describe("Today traceable targets through App", () => {
  let app: MountedApp | undefined;
  let calls: {path: string; method: string; signal?: AbortSignal | null}[] = [];
  let deny = 0, wrongId = false;
  let detail: (() => Promise<Response>) | undefined;
  const main = () => app!.container.querySelector("main")!;
  const click = async (node: HTMLElement) => act(async () => node.click());
  const target = (kind: string) => main().querySelector<HTMLButtonElement>(`[data-today-target="${kind}"]`)!;
  const button = (text: string) => [...main().querySelectorAll<HTMLButtonElement>("button")].find(n => n.textContent === text)!;
  async function mount() {
    app = await mountAuthenticatedApp({url: "https://app.test/today", role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      calls.push({path: url.pathname + url.search, method: init?.method ?? "GET", signal: init?.signal});
      if (url.pathname === "/api/navigation") return Response.json({tree: currentNavigationFixture("contributor", "0x100000")});
      if (url.pathname === "/api/telemetry/pageview") return Response.json({});
      if (url.pathname === "/api/today") return Response.json({date: "2026-09-28", tasks: {items: Array.from({length: 15}, (_, i) => ({...task, id: `task-${i+1}`})), pagination: {page: 1, pageSize: 20, total: 15, totalPages: 1}}, taskSummary: summary, calendar: [event], inbox: [], projects: []});
      if (url.pathname === "/api/tasks") return Response.json({items: [task], pagination: {page: 1, pageSize: 20, total: 1, totalPages: 1}});
      if (url.pathname === "/api/tasks/summary") return Response.json(summary);
      if (url.pathname === "/api/calendar/events") return Response.json({items: [event], pagination: {page: 1, pageSize: 20, total: 1, totalPages: 1}});
      if (url.pathname === "/api/tasks/task-1" || url.pathname === "/api/calendar/events/event-1") {
        if (detail) return detail();
        if (deny) return apiError(deny, "DENIED", "Unavailable");
        return Response.json(url.pathname.includes("calendar") ? {...event, id: wrongId ? "other" : event.id, title: "Authorized event"} : {task: {...task, id: wrongId ? "other" : task.id, title: "Authorized task"}, tags: [], links: []});
      }
      throw new Error(`Unexpected ${url.pathname}`);
    }});
    await waitForApp(() => main().textContent!.includes("Snapshot task"));
  }
  afterEach(async () => { await app?.unmount(); app = undefined; calls = []; deny = 0; wrongId = false; detail = undefined; vi.unstubAllGlobals(); });
  it("explains bounded counts and provides all-items links with exact snapshot UTC calendar range", async () => {
    await mount();
    expect(main().querySelectorAll('[data-today-target="task"]')).toHaveLength(10);
    expect(main().textContent).toContain("Snapshot counts are not totals");
    expect(main().textContent).toContain("UTC");
    expect(main().querySelector('a[data-today-all="tasks"]')?.getAttribute("href")).toBe("/tasks?due=today&page=1&pageSize=20");
    const href = main().querySelector('a[data-today-all="calendar"]')?.getAttribute("href");
    expect(href).toBeTruthy(); const url = new URL(href!, "https://app.test");
    expect(url.pathname).toBe("/calendar"); expect(url.searchParams.get("from")).toBe(stamp); expect(url.searchParams.get("to")).toBe("2026-09-29T00:00:00.000Z");
  });
  it.each(["tasks", "calendar"])("opens the authorized %s list through its real route", async kind => {
    await mount(); await click(main().querySelector<HTMLAnchorElement>(`a[data-today-all="${kind}"]`)!);
    await waitForApp(() => calls.some(call => call.path.startsWith(kind === "tasks" ? "/api/tasks?" : "/api/calendar/events?")));
    expect(app!.browser.location.pathname).toBe(`/${kind}`);
    const request = calls.find(call => call.path.startsWith(kind === "tasks" ? "/api/tasks?" : "/api/calendar/events?"))!;
    const url = new URL(request.path, "https://app.test");
    if (kind === "tasks") expect(url.searchParams.get("due")).toBe("today");
    else {expect(url.searchParams.get("from")).toBe(stamp); expect(url.searchParams.get("to")).toBe("2026-09-29T00:00:00.000Z");}
    expect(url.searchParams.get("page")).toBe("1"); expect(request.method).toBe("GET");
  });
  it.each(["task", "calendar"])("reads authorized %s detail instead of showing cached snapshot content", async kind => {
    await mount(); await click(target(kind)); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes(kind === "task" ? "Authorized task" : "Authorized event"));
    const dialog = main().querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(kind === "task" ? "Fresh notes" : "Fresh event description");
    expect(calls.filter(call => call.path.startsWith(kind === "task" ? "/api/tasks/" : "/api/calendar/events/")).map(call => call.method)).toEqual(["GET"]);
  });
  it.each([401,403])("clears the private snapshot and detail on target denial %i", async status => {
    await mount(); deny = status; await click(target("task")); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().textContent).not.toContain("Snapshot task"); expect(main().querySelector('[role="dialog"]')).toBeNull();
  });
  it.each(["task", "calendar"])("does not fall back to cached %s detail for deleted or foreign targets", async kind => {
    await mount(); deny = 404; await click(target(kind)); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes("Unable to load"));
    expect(main().querySelector('[role="dialog"]')!.textContent).not.toContain("Snapshot");
    deny = 0; await click(button("Retry detail")); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes("Authorized"));
  });
  it.each(["task", "calendar"])("rejects a mismatched %s target receipt", async kind => {
    await mount(); wrongId = true; await click(target(kind)); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes("Unable to load"));
    expect(main().querySelector('[role="dialog"]')!.textContent).not.toContain("Authorized");
  });
  it("aborts a closed detail and ignores its late response", async () => {
    let resolve!: (response: Response) => void;
    detail = () => new Promise(done => {resolve = done;});
    await mount(); await click(target("task")); await waitForApp(() => !!resolve);
    const request = calls.find(call => call.path === "/api/tasks/task-1")!;
    await click(button("Close detail")); expect(request.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({task: {...task, title: "Late private title"}, tags: [], links: []})));
    expect(main().querySelector('[role="dialog"]')).toBeNull(); expect(main().textContent).not.toContain("Late private title");
  });
});
