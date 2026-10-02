// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forceRemountAppAt, mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const V0 = "2026-09-01T00:00:00.000Z";
describe("goal task association journey", () => {
  let app: MountedApp | undefined, revision: number, links: Set<string>, writes: string[], versions: string[], reads: string[];
  let failure: number, readFailure: number, badReceipt: boolean, oldRead: boolean, hold: Promise<void> | undefined;
  const main = () => app!.container.querySelector("main")!;
  const editor = () => main().querySelector("[data-goal-tasks-editor]")!;
  const button = (text: string, root: Element = main()) => [...root.querySelectorAll("button")].find(b => b.textContent === text)!;
  afterEach(async () => { await app?.unmount(); app = undefined; });
  async function mount(initial = false) {
    revision = 0; links = new Set(initial ? ["t-0"] : []); writes = []; versions = []; reads = []; failure = 0; readFailure = 0; badReceipt = false; oldRead = false; hold = undefined;
    app = await mountAuthenticatedApp({ url: "https://app.test/goals", role: "contributor", permissionMask: "0x100000", configureBrowser(browser) { vi.stubGlobal("HTMLElement", browser.HTMLElement); }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      const version = () => new Date(Date.parse(V0) + revision).toISOString();
      const goal = () => ({ id: "g", clientKey: "g", title: "Private goal", description: null, status: "active", progress: 37, targetAt: null, createdAt: V0, updatedAt: version() });
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (url.pathname === "/api/goals") return Response.json({ items: [goal()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      if (url.pathname === "/api/goals/g") return Response.json(goal());
      if (init?.method === "POST" || init?.method === "DELETE") {
        writes.push(`${init.method} ${url.pathname}`); const body = JSON.parse(String(init.body)); versions.push(body.expectedUpdatedAt); await hold;
        if ([400, 401, 403, 404].includes(failure)) return apiError(failure, "REJECTED", false);
        revision++; if (failure === 409) return apiError(409, "GOAL_VERSION_CONFLICT", false);
        const linked = init.method === "POST", taskId = linked ? body.taskId : url.pathname.split("/").at(-1)!;
        if (linked) links.add(taskId); else links.delete(taskId);
        if (failure) return apiError(failure, "UNKNOWN", true);
        return Response.json({ goalId: badReceipt ? "foreign" : "g", taskId, linked, changed: true, updatedAt: version() });
      }
      // Shell unread reads are not goal-task readbacks.
      if (url.pathname === "/api/notifications/summary") return Response.json({ unread: 0 });
      expect(url.pathname).toBe("/api/goals/g/tasks");
      reads.push(url.search);
      if (readFailure) return apiError(readFailure, "READ_FAILED", readFailure >= 500);
      const page = Number(url.searchParams.get("page")), pageSize = Number(url.searchParams.get("pageSize"));
      return Response.json({ goalId: "g", expectedUpdatedAt: oldRead ? V0 : version(), summary: { taskCount: links.size, completedTaskCount: 0 }, items: Array.from({ length: 23 }, (_, i) => ({ id: `t-${i}`, title: `Private task ${i}`, linked: links.has(`t-${i}`) })).slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: 23, totalPages: Math.ceil(23 / pageSize) } });
    } });
    await waitForApp(() => !!button("Manage task links") && !button("Manage task links").disabled);
    await act(async () => button("Manage task links").click());
    await waitForApp(() => editor()?.textContent?.includes("Private task 0") === true);
  }
  const confirm = () => main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
  const keep = () => main().querySelector<HTMLButtonElement>("[data-cancel-action]")!;
  const captured = (node: HTMLElement) => (node as any)[Object.keys(node).find(key => key.startsWith("__reactProps$"))!].onClick;
  const marker = () => app!.browser.sessionStorage.getItem("memory-garden:planning-write:v1:contributor-route-auditor:GOALS");
  const unload = () => { const event = new app!.browser.Event("beforeunload", { cancelable: true }); app!.browser.dispatchEvent(event); return event.defaultPrevented; };
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function confirmWrite() { await click(confirm()); }
  it.each([false, true])("requires exact goal/task impact confirmation for linked=%s, with zero-write cancellation", async initial => {
    await mount(initial); const action = button(initial ? "Unlink" : "Link", editor()); const count = reads.length;
    await click(action); expect(writes).toEqual([]); expect(marker()).toBeNull(); expect(confirm()).toBeTruthy();
    const dialog = main().querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain("Private goal"); expect(dialog.textContent).toContain("Private task 0");
    expect(dialog.textContent).toContain("does not delete"); expect(document.activeElement).toBe(keep());
    await click(keep()); expect(writes).toEqual([]); expect(reads).toHaveLength(count); expect(document.activeElement).toBe(action);
    await click(action); const approve = captured(confirm()); await act(async () => { approve(); approve(); });
    await waitForApp(() => !button("Close links", editor()).disabled);
    expect(writes).toEqual([initial ? "DELETE /api/goals/g/tasks/t-0" : "POST /api/goals/g/tasks"]);
    expect(versions).toEqual([V0]); expect(marker()).toBeNull(); expect(unload()).toBe(false);
  });
  it("blocks captured close, pagination, duplicate row actions and navigation during the decision", async () => {
    await mount(); const action = captured(button("Link", editor())), close = captured(button("Close links", editor()));
    const next = captured(editor().querySelector<HTMLButtonElement>('[aria-label="Next page"]')!); const count = reads.length;
    await act(async () => { action(); close(); next(); action(); expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    expect(editor()).toBeTruthy(); expect(confirm()).toBeTruthy(); expect(writes).toEqual([]); expect(reads).toHaveLength(count);
    await click(keep()); await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("committed"));
  });
  it("Escape cancels, restores focus, and invalidates old decisions against a new prompt", async () => {
    await mount(); const action = button("Link", editor()); await click(action); expect(confirm()).toBeTruthy();
    const oldConfirm = captured(confirm()), oldCancel = captured(keep());
    await act(async () => keep().dispatchEvent(new app!.browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(confirm()).toBeNull(); expect(document.activeElement).toBe(action);
    await click(action); await act(async () => { oldConfirm(); oldCancel(); });
    expect(confirm()).toBeTruthy(); expect(writes).toEqual([]); expect(marker()).toBeNull();
  });
  it("locks close and route navigation in the same event as approval until readback", async () => {
    await mount(); let release!: () => void; hold = new Promise(resolve => { release = resolve; });
    const close = captured(button("Close links", editor())); await click(button("Link", editor())); expect(confirm()).toBeTruthy();
    const approve = captured(confirm()); await act(async () => { approve(); close(); approve(); expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    expect(writes).toHaveLength(1); expect(editor()).toBeTruthy(); expect(marker()).not.toBeNull(); expect(unload()).toBe(true);
    await act(async () => release()); await waitForApp(() => !button("Close links", editor()).disabled); expect(unload()).toBe(false);
  });
  it("keeps unknown write protected after editor close and releases by explicit GET only", async () => {
    await mount(); readFailure = 503; failure = 503; await click(button("Link", editor())); await confirmWrite();
    await waitForApp(() => !!button("Retry links", editor())); await click(button("Close links", editor())); await waitForApp(() => !editor());
    expect(unload()).toBe(true); await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"));
    readFailure = 0; await click(main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!);
    await waitForApp(() => !button("Manage task links").disabled); expect(marker()).toBeNull(); expect(writes).toHaveLength(1);
    expect(unload()).toBe(false); await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("committed"));
  });
  it("rejects a captured old row after pagination and only confirms the new page target", async () => {
    await mount(); const stale = captured(button("Link", editor())); await click(editor().querySelector<HTMLButtonElement>('[aria-label="Next page"]')!);
    await waitForApp(() => editor()?.textContent?.includes("Private task 22") === true);
    await act(async () => stale()); expect(confirm()).toBeNull(); expect(writes).toEqual([]);
    await click(button("Link", editor())); await confirmWrite(); await waitForApp(() => !!button("Unlink", editor()));
    expect(writes).toHaveLength(1); expect(links.has("t-20")).toBe(true); expect(links.has("t-0")).toBe(false);
  });
  it("invalidates captured row handlers synchronously when closing", async () => {
    await mount(); const stale = captured(button("Link", editor())), close = captured(button("Close links", editor()));
    await act(async () => { close(); stale(); }); await waitForApp(() => !editor());
    expect(confirm()).toBeNull(); expect(writes).toEqual([]); expect(marker()).toBeNull();
  });
  it("invalidates confirmation after forced teardown without a mutation", async () => {
    await mount(); await click(button("Link", editor())); expect(confirm()).toBeTruthy(); const approve = captured(confirm());
    await forceRemountAppAt(app!, "/settings"); await act(async () => approve()); expect(writes).toEqual([]); expect(marker()).toBeNull();
  });
  it("links and unlinks tasks with authoritative counts while keeping manual progress", async () => {
    await mount(); expect(editor().textContent).toContain("0/0"); expect(main().textContent).toContain("37%");
    await act(async () => button("Link", editor()).click()); await confirmWrite();
    await waitForApp(() => !!button("Unlink", editor()) && !button("Unlink", editor()).disabled);
    expect(editor().textContent).toContain("0/1"); expect(versions).toEqual([V0]);
    await act(async () => button("Unlink", editor()).click()); await confirmWrite();
    await waitForApp(() => editor().textContent?.includes("0/0") === true);
    expect(writes).toEqual(["POST /api/goals/g/tasks", "DELETE /api/goals/g/tasks/t-0"]);
    expect(main().textContent).toContain("37%");
    await act(async () => button("Close links", editor()).click());
    await waitForApp(() => !button("Manage task links").disabled);
    expect(app!.browser.document.activeElement).toBe(button("Manage task links"));
  });
  it("paginates owned candidates and prevents other goal mutations while editing", async () => {
    await mount(); expect((main().querySelector('input[type="range"]') as HTMLInputElement).disabled).toBe(true);
    await act(async () => (editor().querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click());
    await waitForApp(() => editor().textContent?.includes("Private task 22") === true);
    expect(editor().textContent).not.toContain("Private task 0"); expect(reads.at(-1)).toContain("page=2");
  });
  it("deduplicates clicks and locks close until write/readback completes", async () => {
    await mount(); let release!: () => void; hold = new Promise(resolve => { release = resolve; });
    await act(async () => { button("Link", editor()).click(); button("Link", editor()).click(); }); await confirmWrite();
    expect(writes).toHaveLength(1); expect(button("Close links", editor()).disabled).toBe(true);
    await act(async () => release()); await waitForApp(() => !button("Close links", editor()).disabled); expect(writes).toHaveLength(1);
  });
  it.each([409, 408, 503, "receipt"])("does not replay uncertain result %s", async result => {
    await mount(); if (typeof result === "number") failure = result; else badReceipt = true;
    await act(async () => button("Link", editor()).click()); await confirmWrite();
    await waitForApp(() => !button("Close links", editor()).disabled);
    expect(writes).toHaveLength(1); expect(reads).toHaveLength(2);
    expect(editor().textContent).toContain(result === 409 ? "record changed" : "not confirmed");
    failure = 0; badReceipt = false;
    if (result === 409) { await act(async () => button("Link", editor()).click()); await confirmWrite(); await waitForApp(() => !!button("Unlink", editor())); expect(versions[1]).toBe("2026-09-01T00:00:00.001Z"); }
  });
  it("keeps definite validation failure editable without re-reading", async () => {
    await mount(); failure = 400; await act(async () => button("Link", editor()).click()); await confirmWrite(); await waitForApp(() => !button("Link", editor()).disabled);
    expect(writes).toHaveLength(1); expect(reads).toHaveLength(1);
  });
  it.each([401, 403, 404])("clears all goal and task private data on write denial %s", async status => {
    await mount(); failure = status; await act(async () => button("Link", editor()).click()); await confirmWrite(); await waitForApp(() => !main().textContent?.includes("Private goal")); expect(editor()).toBeNull(); expect(main().textContent).not.toContain("Private task");
  });
  it("keeps a read-only recovery lock on failed readback and recovers only by GET", async () => {
    await mount(); readFailure = 503; await act(async () => button("Link", editor()).click()); await confirmWrite(); await waitForApp(() => !!button("Retry links", editor()));
    expect(editor().textContent).not.toContain("Private task"); expect(main().textContent).not.toContain("Private goal");
    const stored = Array.from({ length: app!.browser.sessionStorage.length }, (_, i) => app!.browser.sessionStorage.getItem(app!.browser.sessionStorage.key(i)!)!); expect(stored.join()).not.toContain("Private task");
    readFailure = 0; await act(async () => button("Retry links", editor()).click()); await waitForApp(() => !!button("Unlink", editor())); expect(writes).toHaveLength(1);
  });
  it("rejects a post-write read older than the confirmed receipt", async () => {
    await mount(); oldRead = true; await act(async () => button("Link", editor()).click()); await confirmWrite(); await waitForApp(() => !!button("Retry links", editor())); expect(editor().textContent).not.toContain("Private task");
    oldRead = false; await act(async () => button("Retry links", editor()).click()); await waitForApp(() => !!button("Unlink", editor())); expect(writes).toHaveLength(1);
  });
  it.each([401, 403, 404])("clears all private state on denied association read %i", async status => {
    await mount(); readFailure = status;
    await act(async () => editor().querySelector<HTMLButtonElement>('[aria-label="Next page"]')!.click());
    await waitForApp(() => !editor()); expect(main().textContent).not.toContain("Private goal"); expect(main().textContent).not.toContain("Private task");
  });
  it("blocks route exit, ignores a late write after forced teardown and recovers by explicit GET without replay", async () => {
    await mount(); let release!: () => void; hold = new Promise<void>(resolve => { release = resolve; });
    await act(async () => button("Link", editor()).click()); await confirmWrite();
    const key = Array.from({ length: app!.browser.sessionStorage.length }, (_, i) => app!.browser.sessionStorage.key(i)!).find(key => key.includes("planning-write:"))!;
    const marker = app!.browser.sessionStorage.getItem(key); expect(marker).not.toBeNull();
    async function navigate(path: string) { await act(async () => { expect(writeWorkspaceHistory("push", path)).toBe("committed"); }); }
    await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"));
    await forceRemountAppAt(app!, "/settings"); await act(async () => release()); expect(app!.browser.sessionStorage.getItem(key)).toBe(marker);
    await navigate("/goals"); await waitForApp(() => !!main().querySelector("[data-planning-write-recover]"));
    expect(button("Manage task links").disabled).toBe(true); expect(writes).toHaveLength(1);
    await act(async () => main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!.click());
    await waitForApp(() => !button("Manage task links").disabled); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    await act(async () => button("Manage task links").click()); await waitForApp(() => !!editor() && !!button("Unlink", editor())); expect(writes).toHaveLength(1);
  });

});
