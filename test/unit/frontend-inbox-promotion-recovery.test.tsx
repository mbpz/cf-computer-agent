// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const version = "2026-09-28T00:00:00.000Z", next = "2026-09-28T00:00:00.001Z";
const key = "memory-garden:planning-write:v1:alice:INBOX";
const marker = JSON.stringify({ version: 1, memberId: "alice", module: "INBOX", record: { token: "request-1", id: "row", expectedUpdatedAt: version } });
describe("inbox promotion recovery through App", () => {
  let app: MountedApp | undefined; let calls: string[] = []; let bodies: unknown[] = [];
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
  async function mount(raw: string | null = null, member = "alice") {
    app = await mountApp({ url: "https://app.test/inbox?page=2&status=inbox", configureBrowser(browser) {
      vi.stubGlobal("HTMLElement", browser.HTMLElement);
      if (raw !== null) browser.sessionStorage.setItem(key, raw);
    }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test"), path = url.pathname;
      if (path === "/api/session") return Response.json({ member: { id: member, email: `${member}@app.test`, role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
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
    } }); await waitForApp(() => !!action());
  }
  afterEach(async () => { await app?.unmount(); app = undefined; calls = []; bodies = []; writeStatus = detailStatus = listStatus = 200; wrongId = staleReceipt = malformedDetail = delay = false; status = "inbox"; updatedAt = version; resolveWrite = undefined; detailVersion = undefined; });
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
  it.each([409, 503])("locks unknown result %s across route return and recovers only by reading", async code => {
    await mount(); writeStatus = code; await confirmAction();
    expect(action().disabled).toBe(true); expect(recover()).toBeTruthy();
    expect(app!.browser.sessionStorage.getItem(key)).not.toContain("Private row");
    await navigate("/unknown"); await navigate("/inbox?page=2&status=inbox"); await waitForApp(() => !!action());
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
  it("suppresses double clicks and ignores late receipt after leaving", async () => {
    await mount(); delay = true; const button = action();
    await act(async () => { button.click(); button.click(); }); expect(bodies).toHaveLength(0);
    const confirm = main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await act(async () => { confirm.click(); confirm.click(); }); await waitForApp(() => !!resolveWrite);
    await navigate("/unknown"); const count = calls.length; await act(async () => resolveWrite!());
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

});
