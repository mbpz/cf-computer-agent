// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const LIST_DESKTOP_QUERY = "(min-width: 1024px)";
/** happy-dom reports a 1024px viewport, so every journey has to pick its surface explicitly. */
function stubViewport(browser: MountedApp["browser"], desktop: boolean) {
  Object.defineProperty(browser, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: query === LIST_DESKTOP_QUERY ? desktop : false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });
}
const project = (id: string) => ({ id, clientKey: id, title: `Project ${id}`, description: null, status: "active", progress: 37, targetAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" });
describe("project relation editing and readback", () => {
  let app: MountedApp | undefined;
  let holdWrite: Promise<void> | undefined, holdRead: Promise<void> | undefined, malformed = false, deniedRead = 0, malformedReceipt = false;
  let sentVersions: unknown[], revision: number;
  let goalLinks: Set<string>, taskLinks: Set<string>, writes: string[], reads: string[], failure: number, readFailure: boolean;
  afterEach(async () => { await app?.unmount(); app = undefined; });
  const main = () => app!.container.querySelector("main")!;
  const editor = () => main().querySelector("[data-project-relations-editor]")!;
  const button = (text: string, root: Element = main()) => [...root.querySelectorAll("button")].find(b => b.textContent === text)!;
  async function mount(desktop = false) {
    sentVersions = []; revision = 0; goalLinks = new Set(); taskLinks = new Set(); writes = []; reads = []; failure = 0; readFailure = false; holdWrite = undefined; holdRead = undefined; malformed = false; deniedRead = 0; malformedReceipt = false;
    app = await mountAuthenticatedApp({ url: "https://app.test/projects", role: "contributor", permissionMask: "0x100000", configureBrowser: browser => stubViewport(browser, desktop), fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      const summary = () => ({ goalCount: goalLinks.size, taskCount: taskLinks.size, completedTaskCount: 0, goals: [...goalLinks].slice(0, 10).map(id => ({ id, title: `Goal ${id.split("-")[1]}` })) });
      if (url.pathname === "/api/projects") return Response.json({ items: [project("a")], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      if (url.pathname.endsWith("/summary")) return readFailure ? apiError(503, "UNAVAILABLE", true) : Response.json(summary());
      if (init?.method === "POST" || init?.method === "DELETE") {
        writes.push(`${init.method} ${url.pathname}`); await holdWrite;
        const links = url.pathname.includes("/tasks") ? taskLinks : goalLinks;
        const body = init.body ? JSON.parse(String(init.body)) : {};
        sentVersions.push(body.expectedUpdatedAt);
        if ([400, 401, 403, 404].includes(failure)) return apiError(failure, "WRITE_FAILURE", false);
        revision++;
        if (failure === 409) return apiError(409, "PROJECT_VERSION_CONFLICT", false);
        const id = init.method === "POST" ? body.goalId ?? body.taskId : decodeURIComponent(url.pathname.split("/").at(-1)!);
        if (init.method === "POST") links.add(id); else links.delete(id);
        if (failure) return apiError(failure, "WRITE_FAILURE", failure !== 400);
        if (malformedReceipt) return Response.json({ linked: true });
        return Response.json(init.method === "POST" ? { linked: true, project: summary() } : summary());
      }
      reads.push(url.pathname + url.search); await holdRead;
      if (deniedRead) return apiError(deniedRead, "DENIED", false);
      if (readFailure) return apiError(503, "UNAVAILABLE", true);
      const page = Number(url.searchParams.get("page")); const pageSize = Number(url.searchParams.get("pageSize"));
      const kind = url.pathname.endsWith("/tasks") ? "tasks" : "goals";
      const items = Array.from({ length: 23 }, (_, i) => ({ id: `${kind === "goals" ? "goal" : "task"}-${i}`, title: `${kind === "goals" ? "Goal" : "Task"} ${i}`, linked: kind === "goals" ? goalLinks.has(`goal-${i}`) : taskLinks.has(`task-${i}`) })).slice((page - 1) * pageSize, page * pageSize);
      return Response.json({ expectedUpdatedAt: new Date(Date.parse(project("a").updatedAt) + revision).toISOString(), projectId: malformed ? "foreign" : "a", kind, items, pagination: { page, pageSize, total: 23, totalPages: Math.ceil(23 / pageSize) } });
    } });
    await waitForApp(() => !!button("Manage links") && !button("Manage links").disabled);
    await act(async () => button("Manage links").click());
    await waitForApp(() => editor()?.textContent?.includes("Goal 0") === true);
  }
  const card = (id: string) => [...main().querySelectorAll("tr")].find(tr => tr.querySelector(`[data-project-id="${id}"]`))!;
  async function confirm() { const n = document.querySelector<HTMLButtonElement>("[data-confirm-action]"); expect(n).toBeTruthy(); await act(async () => n!.click()); }
  /** The editor appends by scrolling its table container to the bottom. */
  async function next() {
    const scroller = editor().querySelector("div.overflow-auto") as HTMLElement;
    expect(scroller).toBeTruthy();
    await act(async () => { scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new app!.browser.Event("scroll", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    await waitForApp(() => editor().textContent?.includes("Goal 22") === true);
  }
  it("pages beyond previews, links/unlinks once, and reads fresh counts without changing manual progress", async () => {
    await mount(); await next();
    expect(editor().textContent).toContain("Goal 0");
    expect(editor().textContent).toContain("Goal 22");
    await act(async () => [...editor().querySelectorAll("button")].filter(b => b.textContent === "Link").at(-1)!.click());
    await confirm();
    await waitForApp(() => writes.length === 1 && card("a").textContent!.includes("Goal 22"));
    expect(writes).toHaveLength(1);
    expect(sentVersions).toEqual(["2026-09-01T00:00:00.000Z"]);
    expect(main().textContent).toContain("37%");
    // A write rebuilds the window from page one; the linked row returns when the next page appends.
    await next();
    await waitForApp(() => !!button("Unlink", editor()));
    await act(async () => button("Unlink", editor()).click()); await confirm();
    await waitForApp(() => writes.length === 2 && !button("Unlink", editor()));
    expect(sentVersions).toEqual(["2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.001Z"]);
    expect(reads.filter(p => p.includes("page=2"))).toHaveLength(2);
  });
  it("switches relation kind back to page one and disables unrelated project writes", async () => {
    await mount(); await next();
    expect(button("Complete").disabled).toBe(true);
    await act(async () => button("Tasks", editor()).click());
    await waitForApp(() => editor().textContent?.includes("Task 0") === true);
    expect(reads.at(-1)).toContain("/tasks?page=1&pageSize=20");
    await act(async () => button("Close links", editor()).click());
    expect(editor()).toBeNull(); expect(button("Complete").disabled).toBe(false);
    expect(app!.container.ownerDocument.activeElement).toBe(button("Manage links"));
  });
  it("reconciles uncertain writes using GET only, retains the warning through failed readback and retry", async () => {
    await mount(); await next(); failure = 503; readFailure = true;
    await act(async () => button("Link", editor()).click()); await confirm();
    await waitForApp(() => !!button("Retry links", editor()));
    expect(editor().textContent).toContain("not confirmed");
    expect(editor().textContent).not.toContain("Goal 22");
    expect(main().textContent).not.toContain("1/0");
    readFailure = false;
    await act(async () => button("Retry links", editor()).click());
    await waitForApp(() => editor().textContent?.includes("Goal 0") === true);
    // The retry re-read page one; the linked row surfaces once the next page appends.
    await next();
    await waitForApp(() => !!button("Unlink", editor()));
    expect(writes).toHaveLength(1); expect(editor().textContent).toContain("not confirmed");
  });
  it("links tasks through the existing API and reads task counts separately from manual progress", async () => {
    await mount();
    await act(async () => button("Tasks", editor()).click());
    await waitForApp(() => editor().textContent?.includes("Task 0") === true);
    await act(async () => button("Link", editor()).click()); await confirm();
    await waitForApp(() => !!button("Unlink", editor()));
    expect(writes).toEqual(["POST /api/projects/a/tasks"]);
    expect(card("a").textContent).toContain("0/1");
    expect(card("a").textContent).toContain("37%");
    await act(async () => button("Unlink", editor()).click()); await confirm();
    await waitForApp(() => !button("Unlink", editor()));
    expect(writes.at(-1)).toBe("DELETE /api/projects/a/tasks/task-0");
    expect(card("a").textContent).toContain("0/0");
  });
  it("holds the write lock across slow acknowledgement and readback", async () => {
    await mount(); let release!: () => void;
    holdWrite = new Promise<void>(resolve => { release = resolve; });
    await act(async () => { button("Link", editor()).click(); button("Link", editor()).click(); }); await confirm();
    expect(writes).toHaveLength(1); expect(button("Close links", editor()).disabled).toBe(true);
    expect(button("Tasks", editor()).disabled).toBe(true); expect(button("Manage links").disabled).toBe(true);
    await act(async () => release());
    await waitForApp(() => !button("Close links", editor()).disabled);
    expect(writes).toHaveLength(1);
  });
  it("ignores late page reads after closing and reopening the editor", async () => {
    await mount(); let release!: () => void;
    holdRead = new Promise<void>(resolve => { release = resolve; });
    await act(async () => {
      const scroller = editor().querySelector("div.overflow-auto") as HTMLElement;
      scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new app!.browser.Event("scroll", { bubbles: true }));
    });
    await act(async () => button("Close links", editor()).click());
    holdRead = undefined;
    await act(async () => button("Manage links").click());
    await waitForApp(() => editor()?.textContent?.includes("Goal 0") === true);
    await act(async () => release());
    expect(editor().textContent).toContain("Goal 0"); expect(editor().textContent).not.toContain("Goal 22"); expect(writes).toHaveLength(0);
  });
  it("clears mismatched relation data and counts, then retries only GET", async () => {
    await mount(); malformed = true;
    await act(async () => button("Tasks", editor()).click());
    await waitForApp(() => !!button("Retry links", editor()));
    expect(editor().textContent).not.toContain("Task 0");
    expect(card("a").textContent).toContain("Unable to load project counts.");
    malformed = false;
    await act(async () => button("Retry links", editor()).click());
    await waitForApp(() => editor().textContent?.includes("Task 0") === true);
    expect(writes).toHaveLength(0);
  });
  it.each([401, 403, 404])("clears private state after denied relation read %s", async status => {
    await mount(); deniedRead = status;
    await act(async () => button("Tasks", editor()).click());
    await waitForApp(() => !main().textContent?.includes("Project a"));
    expect(editor()).toBeNull(); expect(writes).toHaveLength(0);
  });
  it.each([409, 408, 500, "malformed"])("only reads after uncertain response %s", async result => {
    await mount(); await next();
    if (typeof result === "number") failure = result; else malformedReceipt = true;
    await act(async () => button("Link", editor()).click()); await confirm();
    await waitForApp(() => !!button(result === 409 ? "Link" : "Unlink", editor()) && !button(result === 409 ? "Link" : "Unlink", editor()).disabled);
    expect(editor().textContent).toContain(result === 409 ? "record changed" : "not confirmed"); expect(writes).toHaveLength(1);
    expect(reads).toHaveLength(3);
  });
  it("keeps a definite validation rejection editable without automatic replay", async () => {
    await mount(); failure = 400;
    await act(async () => button("Link", editor()).click()); await confirm();
    await waitForApp(() => !button("Link", editor()).disabled);
    expect(writes).toHaveLength(1); expect(reads).toHaveLength(1);
    expect(editor().textContent).not.toContain("not confirmed");
  });
  it.each([401, 403, 404])("clears private project state after denied mutation %s", async status => {
    await mount(); failure = status; const readsBefore = reads.length;
    await act(async () => button("Link", editor()).click()); await confirm();
    await waitForApp(() => !main().textContent?.includes("Project a"));
    expect(editor()).toBeNull(); expect(writes).toHaveLength(1); expect(reads).toHaveLength(readsBefore);
  });
  it("uses the conflict readback version only for a new explicit user action", async () => {
    await mount(); failure = 409;
    await act(async () => button("Link", editor()).click()); await confirm();
    await waitForApp(() => !!button("Link", editor()) && !button("Link", editor()).disabled);
    expect(editor().textContent).toContain("record changed");
    expect(writes).toHaveLength(1); expect(button("Unlink", editor())).toBeUndefined();
    failure = 0;
    await act(async () => button("Link", editor()).click()); await confirm();
    await waitForApp(() => !!button("Unlink", editor()));
    expect(sentVersions).toEqual(["2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.001Z"]);
    expect(writes).toHaveLength(2);
  });

});
