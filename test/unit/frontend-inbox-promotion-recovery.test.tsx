// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forceRemountAppAt, mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const version = "2026-09-28T00:00:00.000Z", next = "2026-09-28T00:00:00.001Z";
const taskKey = "memory-garden:task-write:v1:alice";
const taskIntent = { op: "subtask-create", taskId: "task-1", subtaskId: "child-1", title: "Pending child", status: "todo", position: 7 };
const taskMarker = JSON.stringify({ version: 1, memberId: "alice", intent: taskIntent });
const key = "memory-garden:planning-write:v1:alice:INBOX";
const marker = JSON.stringify({ version: 1, memberId: "alice", module: "INBOX", record: { token: "request-1", id: "row", expectedUpdatedAt: version } });
describe("inbox promotion recovery through App", () => {
  let app: MountedApp | undefined; let calls: string[] = []; let bodies: unknown[] = [];
  let taskBodies: unknown[] = []; let subtaskRows: unknown[] = []; let taskWriteStatus = 503;
  let writeStatus = 200, detailStatus = 200, listStatus = 200; let wrongId = false, staleReceipt = false, malformedDetail = false; let detailVersion: string | undefined;
  let status = "inbox", updatedAt = version; let delay = false; let resolveWrite: (() => void) | undefined;
  const row = () => ({ id: "row", clientKey: "key", kind: "text", content: "Private row", sourceUrl: null, status, promotedTaskId: status === "promoted" ? "task-1" : null, promotedSubmissionId: null, createdAt: version, updatedAt });
  const main = () => app!.container.querySelector("main")!;
  const action = () => [...main().querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Turn into task")!;
  const recover = () => main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!;
  const click = async (node: HTMLButtonElement) => { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const confirmAction = async () => {
    const before = bodies.length;
    await click(action()); expect(bodies).toHaveLength(before);
    await click(main().querySelector<HTMLButtonElement>("[data-confirm-action]")!);
  };
  const navigate = async (path: string) => { await act(async () => { expect(writeWorkspaceHistory("push", path)).toBe("committed"); }); };
  async function mount(raw: string | null = null, member = "alice", taskRaw: string | null = null) {
    app = await mountApp({ url: "https://app.test/inbox?page=2&status=inbox", configureBrowser(browser) {
      vi.stubGlobal("HTMLElement", browser.HTMLElement);
      if (raw !== null) browser.sessionStorage.setItem(key, raw);
      if (taskRaw !== null) browser.sessionStorage.setItem(taskKey, taskRaw);
    }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test"), path = url.pathname;
      if (path === "/api/session") return Response.json({ member: { id: member, email: `${member}@app.test`, role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (path === "/api/tasks/task-1/subtasks" && init?.method === "POST") {
        taskBodies.push(JSON.parse(String(init.body)));
        return apiError(taskWriteStatus, taskWriteStatus === 409 ? "SUBTASK_POSITION_CONFLICT" : "UNAVAILABLE", taskWriteStatus >= 500);
      }
      if (path === "/api/tasks/task-1/subtasks" || path === "/api/tasks/task-1/dependencies") return detailStatus !== 200 ? apiError(detailStatus, "UNAVAILABLE", detailStatus >= 500) : Response.json(path.endsWith("/subtasks") ? subtaskRows : []);
      if (path === "/api/tasks/task-1") {
        calls.push(`GET ${path}`);
        if (detailStatus !== 200) return apiError(detailStatus, "TASK_NOT_FOUND");
        return Response.json({ task: { id: "task-1", title: "Target task", notes: "Owned task notes", status: "todo", progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: version, updatedAt: next }, tags: [], links: [] });
      }
      if (path === "/api/notifications/summary") return Response.json({ unread: 0 });
      expect(path).toMatch(/^\/api\/inbox(?:\/|$)/);
      calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
      if (init?.method === "POST") {
        expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull();
        const body = JSON.parse(String(init.body)); bodies.push(body);
        const response = () => {
          if (writeStatus !== 200) return apiError(writeStatus, writeStatus === 409 ? "INBOX_VERSION_CONFLICT" : "UNAVAILABLE", writeStatus >= 500);
          status = "promoted"; updatedAt = new Date(Date.parse(body.expectedUpdatedAt) + 1).toISOString();
          return Response.json({ item: { ...row(), ...(wrongId ? { id: "wrong" } : {}), ...(staleReceipt ? { updatedAt: version } : {}) }, taskId: "task-1", promoted: true });
        };
        if (delay) return new Promise<Response>(resolve => { resolveWrite = () => resolve(response()); });
        return response();
      }
      if (path === "/api/inbox/row") return detailStatus !== 200 ? apiError(detailStatus, "UNAVAILABLE", detailStatus >= 500) : Response.json({ ...row(), ...(malformedDetail ? { id: "wrong" } : {}), ...(detailVersion ? { updatedAt: detailVersion } : {}) });
      if (listStatus !== 200) return apiError(listStatus, "UNAVAILABLE", listStatus >= 500);
      const matches = !url.searchParams.has("status") || url.searchParams.get("status") === status;
      return Response.json({ items: matches ? [row()] : [], pagination: { page: Number(url.searchParams.get("page") ?? 1), pageSize: 20, total: matches ? 21 : 20, totalPages: matches ? 2 : 1 } });
    } }); await waitForApp(() => listStatus === 200 ? !!action() : main().textContent!.includes("Unable to load"));
  }
  afterEach(async () => { await app?.unmount(); app = undefined; calls = []; bodies = []; taskBodies = []; subtaskRows = []; taskWriteStatus = 503; writeStatus = detailStatus = listStatus = 200; wrongId = staleReceipt = malformedDetail = delay = false; status = "inbox"; updatedAt = version; resolveWrite = undefined; detailVersion = undefined; });
  it("query navigation invalidates an unsubmitted decision without a marker", async () => {
    await mount(); await click(action()); const stale = main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await navigate("/inbox?page=2"); await waitForApp(() => !!action()); await click(stale);
    expect(bodies).toHaveLength(0); expect(app!.browser.sessionStorage.getItem(key)).toBeNull(); expect(main().querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("cancel and route exit leave no write or recovery marker", async () => {
    await mount(); await click(action()); expect(bodies).toHaveLength(0); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    await click(main().querySelector<HTMLButtonElement>("[data-cancel-action]")!);
    expect(bodies).toHaveLength(0); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    await click(action()); const stale = main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await navigate("/unknown"); await click(stale); expect(bodies).toHaveLength(0); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    await navigate("/inbox?page=2&status=inbox"); await waitForApp(() => !!action()); expect(main().querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("writes once, validates owned detail and refreshes the exact filtered page", async () => {
    await mount(); await confirmAction(); await waitForApp(() => !app!.browser.sessionStorage.getItem(key));
    expect(main().textContent).not.toContain("Private row");
    expect(bodies).toEqual([{ expectedUpdatedAt: version }]);
    expect(calls).toEqual(["GET /api/inbox?page=2&pageSize=20&status=inbox", "POST /api/inbox/row/promote/task", "GET /api/inbox/row", "GET /api/inbox?page=2&pageSize=20&status=inbox"]);
  });
  it.each([409, 503])("locks unknown result %s across forced teardown and recovers only by reading", async code => {
    await mount(); writeStatus = code; await confirmAction();
    expect(action().disabled).toBe(true); expect(recover()).toBeTruthy();
    expect(app!.browser.sessionStorage.getItem(key)).not.toContain("Private row");
    await act(async () => expect(writeWorkspaceHistory("push", "/unknown")).toBe("blocked"));
    await forceRemountAppAt(app!, "/unknown"); await navigate("/inbox?page=2&status=inbox"); await waitForApp(() => !!action());
    expect(action().disabled).toBe(true); await click(recover()); await waitForApp(() => !app!.browser.sessionStorage.getItem(key));
    expect(bodies).toHaveLength(1);
  });
  it.each(["id", "version"])("retains malformed %s receipt without automatic POST replay", async mode => {
    await mount(); wrongId = mode === "id"; staleReceipt = mode === "version"; await confirmAction();
    expect(recover()).toBeTruthy(); expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull();
    await click(recover()); await waitForApp(() => !app!.browser.sessionStorage.getItem(key)); expect(bodies).toHaveLength(1);
  });
  it.each([401, 403, 404, 503])("clears stale private rows on readback failure %s", async code => {
    await mount(); detailStatus = code; await confirmAction(); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().textContent).not.toContain("Private row"); expect(bodies).toHaveLength(1);
    expect(app!.browser.sessionStorage.getItem(key) === null).toBe(code === 401 || code === 403);
  });
  const open = () => [...main().querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Open task");
  it("opens the promoted task through its owned detail API", async () => {
    await mount(); await confirmAction(); await waitForApp(() => !app!.browser.sessionStorage.getItem(key));
    await navigate("/inbox?page=2&status=promoted"); await waitForApp(() => !!open()); await click(open()!);
    await waitForApp(() => [...app!.browser.document.querySelectorAll("input")].some(node => node.value === "Target task"));
    expect(calls).toContain("GET /api/tasks/task-1");
  });
  it.each([403, 404])("does not expose target content when target read returns %s", async code => {
    await mount(); await confirmAction(); await waitForApp(() => !app!.browser.sessionStorage.getItem(key));
    await navigate("/inbox?page=2&status=promoted"); await waitForApp(() => !!open()); detailStatus = code; await click(open()!);
    await waitForApp(() => calls.includes("GET /api/tasks/task-1"));
    expect(app!.browser.document.body.textContent).not.toContain("Owned task notes");
    expect([...app!.browser.document.querySelectorAll("input")].some(node => node.value === "Target task")).toBe(false);
  });
  it("suppresses double clicks and ignores late receipt after forced teardown", async () => {
    await mount(); delay = true; const button = action();
    await act(async () => { button.click(); button.click(); }); expect(bodies).toHaveLength(0);
    const confirm = main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await act(async () => { confirm.click(); confirm.click(); }); await waitForApp(() => !!resolveWrite);
    await act(async () => expect(writeWorkspaceHistory("push", "/unknown")).toBe("blocked"));
    await forceRemountAppAt(app!, "/unknown"); const count = calls.length; await act(async () => resolveWrite!());
    expect(calls).toHaveLength(count); expect(bodies).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull();
  });
  it("recovers a committed request whose response was lost without a second POST", async () => {
    await mount(); writeStatus = 503; await confirmAction(); status = "promoted"; updatedAt = next;
    await click(recover()); await waitForApp(() => !app!.browser.sessionStorage.getItem(key));
    expect(bodies).toHaveLength(1); expect(main().textContent).not.toContain("Private row");
  });
  it("keeps the recovery lock if the exact page cannot be reloaded", async () => {
    await mount(); listStatus = 503; await confirmAction(); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull(); listStatus = 200;
    await click(recover()); await waitForApp(() => !app!.browser.sessionStorage.getItem(key)); expect(bodies).toHaveLength(1);
  });
  it("restores a promotion marker on a fresh mount and performs only GET recovery", async () => {
    await mount(marker); expect(action().disabled).toBe(true); await click(recover());
    await waitForApp(() => !app!.browser.sessionStorage.getItem(key)); expect(bodies).toHaveLength(0);
    expect(calls.every(call => call.startsWith("GET "))).toBe(true);
  });
  it("does not use another member's marker", async () => {
    await mount(marker, "bob"); expect(action().disabled).toBe(false); expect(recover()).toBeFalsy(); expect(bodies).toHaveLength(0);
  });
  it("blocks writes when session recovery storage is unavailable", async () => {
    await mount(); vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await confirmAction(); expect(bodies).toHaveLength(0); expect(action().disabled).toBe(true);
  });

  const unknownTask = () => app!.container.querySelector("[data-task-write-unknown]");
  const taskButton = (label: string) => [...app!.browser.document.querySelectorAll("button")].find(button => button.textContent === label) as unknown as HTMLButtonElement;
  it("restores an actual uncertain subtask write after refresh without automatically replaying", async () => {
    await mount(); await confirmAction(); await waitForApp(() => !app!.browser.sessionStorage.getItem(key));
    await navigate("/inbox?page=2&status=promoted"); await waitForApp(() => !!open()); await click(open()!);
    await waitForApp(() => !!app!.browser.document.querySelector('[aria-label="Subtask title"]'));
    const input = app!.browser.document.querySelector('[aria-label="Subtask title"]') as unknown as HTMLInputElement;
    const propsKey = Object.keys(input).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { input.value = "Pending child"; (input as any)[propsKey].onChange({ currentTarget: input }); });
    await click(taskButton("Add subtask")); await waitForApp(() => !!unknownTask());
    const original = app!.browser.sessionStorage.getItem(taskKey);
    expect(original).toContain("Pending child"); expect(taskBodies).toHaveLength(1);
    await forceRemountAppAt(app!, "/inbox?page=2&status=promoted");
    await waitForApp(() => !!unknownTask());
    expect(taskBodies).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(original);
    taskWriteStatus = 409;
    await click(taskButton("Retry same operation")); await waitForApp(() => taskBodies.length === 2);
    expect(taskBodies[1]).toEqual(taskBodies[0]); expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(original);
    expect(unknownTask()).not.toBeNull();
  });
  it("recovers a pending task outside the current Inbox filter using a read-only result check", async () => {
    await mount(null, "alice", taskMarker); await waitForApp(() => !!unknownTask());
    expect(taskBodies).toHaveLength(0); expect(open()).toBeUndefined();
    await click(taskButton("Check the result"));
    await waitForApp(() => !app!.browser.sessionStorage.getItem(taskKey));
    expect(taskBodies).toHaveLength(0); expect(unknownTask()).toBeNull();
  });
  it("does not restore another member's task operation", async () => {
    await mount(null, "bob", taskMarker);
    expect(unknownTask()).toBeNull(); expect(calls).not.toContain("GET /api/tasks/task-1");
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(taskMarker); expect(taskBodies).toHaveLength(0);
  });
  it.each([401, 403])("does not open pending private task content when Inbox access is denied with %s", async code => {
    listStatus = code; await mount(null, "alice", taskMarker);
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(unknownTask()).toBeNull(); expect(calls).not.toContain("GET /api/tasks/task-1");
    expect(app!.browser.document.body.textContent).not.toContain("Pending child");
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(taskMarker); expect(taskBodies).toHaveLength(0);
  });
  it.each([401, 403])("clears the restored editor when its exact task check loses permission with %s", async code => {
    await mount(null, "alice", taskMarker); await waitForApp(() => !!unknownTask());
    await waitForApp(() => [...app!.browser.document.querySelectorAll("input")].some(node => node.value === "Target task"));
    detailStatus = code; await click(taskButton("Check the result"));
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(unknownTask()).toBeNull(); expect(app!.browser.document.body.textContent).not.toContain("Private row");
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(taskMarker); expect(taskBodies).toHaveLength(0);
  });
  it("exposes a corrupt task operation record for explicit discard rather than silently losing it", async () => {
    await mount(null, "alice", "broken-record");
    await waitForApp(() => !!app!.container.querySelector("[data-task-write-record-blocked]"));
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe("broken-record"); expect(taskBodies).toHaveLength(0);
    const discard = app!.container.querySelector<HTMLButtonElement>("[data-task-write-record-blocked] button")!;
    await click(discard); expect(app!.browser.sessionStorage.getItem(taskKey)).toBeNull();
    expect(app!.container.querySelector("[data-task-write-record-blocked]")).toBeNull();
  });

  it.each([401, 403])("clears private UI without forgetting the unknown operation when replay is denied with %s", async code => {
    await mount(null, "alice", taskMarker); await waitForApp(() => !!unknownTask());
    taskWriteStatus = code; await click(taskButton("Retry same operation"));
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(unknownTask()).toBeNull(); expect(main().textContent).not.toContain("Private row");
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(taskMarker);
    expect(taskBodies).toEqual([{ id: "child-1", title: "Pending child", status: "todo", position: 7 }]);
    await navigate("/unknown");
  });

  it("does not turn a task-page creation marker into an Inbox create-task entry", async () => {
    const creation = JSON.stringify({ version: 1, memberId: "alice", intent: { op: "create", taskId: "new-task", fields: { title: "Private unsaved task", notes: "", priority: "medium", dueAt: null } } });
    await mount(null, "alice", creation);
    expect(unknownTask()).toBeNull();
    expect(app!.container.querySelector("[data-task-create-recovery] button")).not.toBeNull();
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(creation);
    expect(taskBodies).toHaveLength(0); expect(calls).not.toContain("GET /api/tasks/task-1");
    expect(app!.browser.document.body.textContent).not.toContain("Private unsaved task");
  });
  it("checks the original subtask ID after response loss without another POST", async () => {
    await mount(null, "alice", taskMarker); await waitForApp(() => !!unknownTask());
    subtaskRows = [{ id: "child-1", taskId: "task-1", title: "Pending child", status: "todo", position: 7, updatedAt: next }];
    await click(taskButton("Check the result"));
    await waitForApp(() => !app!.browser.sessionStorage.getItem(taskKey));
    expect(taskBodies).toHaveLength(0); expect(unknownTask()).toBeNull();
  });
  it("keeps the recovery lock when a confirmed read cannot remove the original marker", async () => {
    await mount(null, "alice", taskMarker); await waitForApp(() => !!unknownTask());
    const remove = vi.spyOn(app!.browser.sessionStorage, "removeItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    await click(taskButton("Check the result"));
    expect(unknownTask()).not.toBeNull(); expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(taskMarker);
    expect(writeWorkspaceHistory("push", "/unknown")).toBe("blocked"); expect(taskBodies).toHaveLength(0);
    remove.mockRestore();
  });

  it.each([401, 403, 503])("restores the preserved operation only after a failed Inbox read %s is explicitly retried", async code => {
    listStatus = code; await mount(null, "alice", taskMarker);
    expect(unknownTask()).toBeNull(); expect(calls).not.toContain("GET /api/tasks/task-1");
    if (code === 503) expect(writeWorkspaceHistory("push", "/unknown")).toBe("blocked");
    listStatus = 200; await click(taskButton("Try again"));
    await waitForApp(() => !!unknownTask());
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(taskMarker); expect(taskBodies).toHaveLength(0);
  });

});
