// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "../../frontend/lib/inbox-data";
import type { Goal } from "../../frontend/lib/goals-data";
import type { Project } from "../../frontend/lib/projects-data";
import type { CalendarEvent } from "../../frontend/lib/calendar-data";
import type { TaskItem, TaskSummary } from "../../frontend/lib/tasks-data";
import type { TodaySnapshot } from "../../frontend/lib/today-data";
import type { FocusSession } from "../../frontend/lib/focus-data";
import type { WorkbenchReviewSnapshot } from "../../frontend/lib/workbench-review-data";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

// Characterization evidence for M01, not a replacement for the canonical maturity registry.
const routes = ["inbox", "goals", "projects", "calendar", "today", "focus", "review"] as const;
type Route = typeof routes[number];
const lists = ["inbox", "goals", "projects", "calendar"] as const;
const endpoint: Record<Route, string> = {
  inbox: "/api/inbox", goals: "/api/goals", projects: "/api/projects", calendar: "/api/calendar/events",
  today: "/api/today", focus: "/api/focus/current", review: "/api/workbench/review",
};
const now = "2026-09-13T08:00:00.000Z";
const zero: TaskSummary = { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 };

function payload(route: Route, empty = false, suffix = "first") {
  const marker = `READY::${route}::${suffix}`;
  const common = { id: `${route}-${suffix}`, clientKey: `${route}-${suffix}`, createdAt: now, updatedAt: now };
  const inbox: InboxItem = { ...common, kind: "text", content: marker, sourceUrl: null, status: "inbox", promotedTaskId: null, promotedSubmissionId: null };
  const goal: Goal = { ...common, title: marker, description: null, status: "active", progress: 0, targetAt: null };
  const project: Project = { ...goal };
  const event: CalendarEvent = { ...common, kind: "event", title: marker, description: "", startsAt: now, endsAt: "2026-09-13T09:00:00.000Z", timezone: "UTC", allDay: false, status: "scheduled", taskId: null, projectId: null };
  const task: TaskItem = { id: `${route}-${suffix}`, title: marker, notes: "", status: route === "review" ? "done" : "todo", progress: 0, priority: "medium", dueAt: now, completedAt: route === "review" ? now : null, createdAt: now, updatedAt: now };
  const items = empty ? [] : [task];
  switch (route) {
    case "inbox": return { items: empty ? [] : [inbox] };
    case "goals": return { items: empty ? [] : [goal] };
    case "projects": return { items: empty ? [] : [project] };
    case "calendar": return { items: empty ? [] : [event] };
    case "today": return { date: "2026-09-13", tasks: { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } }, taskSummary: { ...zero, todo: items.length }, inbox: [], projects: [], calendar: [] } satisfies TodaySnapshot;
    case "focus": return { session: empty ? null : { ...common, taskId: marker, calendarEventId: null, status: "active", startedAt: now, pausedAt: null, endedAt: null, elapsedMs: 0 } satisfies FocusSession };
    case "review": return { id: "review-snapshot", period: "daily", periodKey: "2026-09-13", from: now, to: now, taskSummary: { ...zero, done: items.length }, completed: items, overdue: [], blocked: [], inbox: [], projects: [], focusElapsedMs: 0 } satisfies WorkbenchReviewSnapshot;
  }
}

function routeFetch(route: Route, requests: URL[], respond: (url: URL) => Response | Promise<Response>, allowed = true): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input), "https://app.test");
    if (url.pathname === "/api/navigation") {
      const tree = currentNavigationFixture("contributor", allowed ? "0x100000" : "0x0");
      if (allowed) tree[0]!.children.push(...routes.map((key) => ({ id: `server-${key}`, key, labelKey: `NAV_${key.toUpperCase()}`, path: `/${key}`, icon: null, groupName: "workspace", availability: "ready", children: [] })));
      return Response.json({ tree });
    }
    if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
    expect(init?.method ?? "GET").toBe("GET");
    requests.push(url);
    if (url.pathname === endpoint[route]) return respond(url);
    if (route === "projects" && /^\/api\/projects\/projects-(first|second)\/summary$/.test(url.pathname)) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
    throw new Error(`Unexpected extended route request: ${url.pathname}`);
  };
}

describe("seven extended workbench routes: M01 runtime evidence", () => {
  let journey: MountedApp | undefined;
  afterEach(async () => { await journey?.unmount(); journey = undefined; });
  const main = () => journey!.container.querySelector("main")!;
  const ready = (route: Route, suffix = "first") => main().textContent?.includes(`READY::${route}::${suffix}`) === true;
  const loadMore = () => [...main().querySelectorAll("button")].find((button) => button.textContent === "Load more");

  for (const route of routes) {
    it(`${route}: pending read renders loading then server data`, async () => {
      const requests: URL[] = [];
      let resolve!: (response: Response) => void;
      const response = new Promise<Response>((done) => { resolve = done; });
      journey = await mountAuthenticatedApp({ url: `https://app.test/${route}`, role: "contributor", permissionMask: "0x100000", fetch: routeFetch(route, requests, () => response) });
      await waitForApp(() => requests.length > 0);
      expect(main().querySelector('[data-page-state="loading"]')).not.toBeNull();
      expect(ready(route)).toBe(false);
      await act(async () => resolve(Response.json(payload(route))));
      await waitForApp(() => ready(route));
      expect(main().querySelector('[data-page-state="loading"]')).toBeNull();
    });

    it(`${route}: failed read retries through the actual API and recovers`, async () => {
      const requests: URL[] = [];
      let attempts = 0;
      journey = await mountAuthenticatedApp({ url: `https://app.test/${route}`, role: "contributor", permissionMask: "0x100000", fetch: routeFetch(route, requests, () => ++attempts === 1 ? apiError(503, "SERVICE_UNAVAILABLE", true) : Response.json(payload(route))) });
      await waitForApp(() => main().querySelector('[role="alert"] button') !== null);
      expect(ready(route)).toBe(false);
      await act(async () => (main().querySelector('[role="alert"] button') as HTMLButtonElement).click());
      await waitForApp(() => ready(route));
      expect(attempts).toBe(2);
      expect(main().querySelector('[role="alert"]')).toBeNull();
      const reads = requests.filter((url) => url.pathname === endpoint[route]);
      expect(reads[1]!.search).toBe(reads[0]!.search);
    });

    it(`${route}: empty data has its route-specific usable state`, async () => {
      journey = await mountAuthenticatedApp({ url: `https://app.test/${route}`, role: "contributor", permissionMask: "0x100000", fetch: routeFetch(route, [], () => Response.json(payload(route, true))) });
      await waitForApp(() => main().querySelector('[data-page-state="loading"]') === null && main().querySelector("h1") !== null);
      expect(main().querySelector('[role="alert"]')).toBeNull();
      expect(ready(route)).toBe(false);
      if (route === "today") expect(main().textContent).toContain("No tasks due today");
      else if (route === "review") expect(main().textContent).toContain("No completed work in this snapshot");
      else if (route === "focus") {
        expect(main().querySelector('input[aria-label="Task ID"]')).not.toBeNull();
        expect([...main().querySelectorAll("button")].find((button) => button.textContent === "Start focus")?.disabled).toBe(true);
      } else expect(main().querySelector('[data-page-state="empty"]')).not.toBeNull();
    });

    it(`${route}: revoked workspace permission blocks direct access before data reads`, async () => {
      const requests: URL[] = [];
      journey = await mountAuthenticatedApp({ url: `https://app.test/${route}`, role: "contributor", permissionMask: "0x0", fetch: routeFetch(route, requests, () => Response.json(payload(route)), false) });
      await waitForApp(() => main().querySelector('[data-page-state="forbidden"]') !== null);
      expect(requests).toHaveLength(0);
      expect(journey.container.querySelector(`[data-route-id="${route}"]`)).toBeNull();
      expect(ready(route)).toBe(false);
    });
  }

  for (const route of lists) {
    it(`${route}: load more forwards opaque cursor, appends and stops at the end`, async () => {
      const requests: URL[] = [];
      const cursor = "opaque/+cursor=next";
      journey = await mountAuthenticatedApp({ url: `https://app.test/${route}`, role: "contributor", permissionMask: "0x100000", fetch: routeFetch(route, requests, (url) => Response.json(url.searchParams.has("cursor") ? payload(route, false, "second") : { ...payload(route), nextCursor: cursor })) });
      await waitForApp(() => ready(route));
      expect(loadMore()).toBeDefined();
      await act(async () => loadMore()!.click());
      await waitForApp(() => ready(route, "second"));
      expect(ready(route)).toBe(true);
      expect(loadMore()).toBeUndefined();
      const reads = requests.filter((url) => url.pathname === endpoint[route]);
      expect(reads).toHaveLength(2);
      expect(reads[1]!.searchParams.get("cursor")).toBe(cursor);
      expect(reads[1]!.searchParams.get("limit")).toBe(route === "calendar" ? "50" : "20");
    });
  }
});
