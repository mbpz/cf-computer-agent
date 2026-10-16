// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { stubListViewport } from "../helpers/list-viewport";
import { currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const stamp = "2026-09-28T00:00:00.000Z";
const task = (id: number) => ({id: `task-${id}`, title: `Owned task ${id}`, notes: "", status: "todo", priority: "medium", progress: 0, dueAt: null, completedAt: null, createdAt: stamp, updatedAt: stamp});
const page = () => ({items: [task(1), task(2)], pagination: {page: 1, pageSize: 20, total: 2, totalPages: 1}});

describe("Focus start dialog", () => {
  let app: MountedApp | undefined;
  let calls: {path: string; method: string; body?: unknown; signal?: AbortSignal | null}[] = [];
  let current: Record<string, unknown> | null = null;
  const main = () => app!.container.querySelector("main")!;
  const button = (text: string) => [...main().querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text);
  const trigger = () => main().querySelector<HTMLButtonElement>("[data-focus-start-open]")!;
  const dialog = () => main().querySelector<HTMLElement>("[data-focus-start-dialog]");
  const click = async (node: HTMLElement) => act(async () => node.click());
  const openComposer = async () => { await act(async () => trigger().click()); await waitForApp(() => !!dialog() && !!button("Owned task 1")); return dialog()!; };
  /** The title field keeps the native event-style input, so tests drive it through React's own props. */
  const typeTitle = async (value: string) => {
    const field = dialog()!.querySelector<HTMLInputElement>("input[placeholder]")!;
    const propsKey = Object.keys(field).find(key => key.startsWith("__reactProps$"))!;
    const props = (field as unknown as Record<string, {onChange: (event: {currentTarget: {value: string}}) => void}>)[propsKey];
    await act(async () => props.onChange({currentTarget: {value}}));
  };

  async function mount() {
    app = await mountAuthenticatedApp({
      url: "https://app.test/focus",
      role: "contributor",
      permissionMask: "0x100000",
      configureBrowser: browser => stubListViewport(browser, "desktop"),
      fetch: async (input, init) => {
        const url = new URL(String(input), "https://app.test"), method = init?.method ?? "GET";
        calls.push({path: url.pathname + url.search, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal});
        if (url.pathname === "/api/navigation") return Response.json({tree: currentNavigationFixture("contributor", "0x100000")});
        if (url.pathname === "/api/notifications/summary") return Response.json({unread: 0});
        if (url.pathname === "/api/telemetry/pageview") return Response.json({});
        if (url.pathname === "/api/focus/current") return Response.json({session: current});
        if (url.pathname === "/api/tasks") return Response.json(page());
        if (url.pathname.startsWith("/api/tasks/")) return Response.json({task: task(Number(url.pathname.split("-").pop())), tags: [], links: []});
        if (url.pathname === "/api/focus" && method === "POST") {
          const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
          current = {...body, startTitle: body.title, status: "active", calendarEventId: null, startedAt: stamp, updatedAt: stamp, elapsedMs: 0, pausedAt: null, endedAt: null};
          return Response.json({session: current, created: true});
        }
        throw new Error(`Unexpected ${method} ${url}`);
      },
    });
    await waitForApp(() => !!trigger());
  }
  afterEach(async () => {await app?.unmount(); app = undefined; calls = []; current = null;});

  it("keeps the page free of any start composer and opens the whole flow in the dialog", async () => {
    await mount();
    const opener = trigger();
    expect(opener.textContent).toBe("Choose task");
    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(dialog()).toBeNull();
    expect(button("Start focus")).toBeUndefined();
    expect(main().querySelector("input[placeholder]")).toBeNull();
    expect(main().querySelector("[data-focus-selected]")).toBeNull();

    const panel = await openComposer();
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    const heading = panel.querySelector("h2")!;
    expect(heading.textContent).toBe("Start a focus session");
    expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    // Picker, title field and confirm all live inside the dialog.
    expect(panel.querySelector('input[aria-label="Search tasks"]')).not.toBeNull();
    expect(panel.querySelector("input[placeholder]")).not.toBeNull();
    const confirm = button("Start focus")!;
    expect(panel.contains(confirm)).toBe(true);
    expect(confirm.disabled).toBe(true);
    expect(panel.contains(button("Owned task 1")!)).toBe(true);
    expect(panel.contains(button("Owned task 2")!)).toBe(true);

    await click(button("Owned task 1")!);
    expect(dialog()).not.toBeNull();
    expect(panel.querySelector("[data-focus-selected]")?.textContent).toContain("Owned task 1");
    expect(button("Start focus")!.disabled).toBe(false);

    await typeTitle("Deep work");
    await act(async () => button("Start focus")!.click());
    await waitForApp(() => !!button("Pause"));
    expect(dialog()).toBeNull();
    const posts = calls.filter(call => call.path === "/api/focus" && call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toMatchObject({taskId: "task-1", title: "Deep work", durationMinutes: 25});
  });

  it("closes the composer on Escape and on the picker's cancel control without writing", async () => {
    await mount();
    const panel = await openComposer();
    const listed = calls.find(call => call.path.startsWith("/api/tasks?"))!;
    await act(async () => {
      panel.dispatchEvent(new app!.browser.KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(dialog()).toBeNull();
    expect(listed.signal?.aborted).toBe(true);
    expect(button("Start focus")).toBeUndefined();
    expect(main().querySelector("input[placeholder]")).toBeNull();
    expect(main().querySelector("[data-focus-selected]")).toBeNull();
    expect(calls.filter(call => call.path === "/api/focus")).toHaveLength(0);

    await openComposer();
    await click(button("Close task picker")!);
    expect(dialog()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(calls.filter(call => call.path === "/api/focus")).toHaveLength(0);
  });
});
