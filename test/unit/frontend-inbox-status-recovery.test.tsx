// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const version = "2026-09-28T00:00:00.000Z", next = "2026-09-28T00:00:00.001Z";
const key = "memory-garden:planning-write:v1:alice:INBOX";
const marker = JSON.stringify({ version: 1, memberId: "alice", module: "INBOX", record: { token: "request-1", id: "row", expectedUpdatedAt: version } });
describe("inbox archive and restore recovery through App", () => {
  let app: MountedApp | undefined; let calls: string[] = []; let bodies: unknown[] = [];
  let writeStatus = 200, detailStatus = 200, listStatus = 200; let wrongId = false, staleReceipt = false, malformedDetail = false; let detailVersion: string | undefined;
  let status = "inbox", updatedAt = version; let delay = false; let resolveWrite: (() => void) | undefined;
  const row = () => ({ id: "row", clientKey: "key", kind: "text", content: "Private row", sourceUrl: null, status, promotedTaskId: null, promotedSubmissionId: null, createdAt: version, updatedAt });
  const main = () => app!.container.querySelector("main")!;
  const action = () => [...main().querySelectorAll<HTMLButtonElement>("button")].find(node => ["Archive", "Restore"].includes(node.textContent ?? ""))!;
  const recover = () => main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!;
  const click = async (node: HTMLButtonElement) => { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const confirmAction = async () => {
    const before = bodies.length;
    await click(action()); expect(bodies).toHaveLength(before);
    await click(main().querySelector<HTMLButtonElement>("[data-confirm-action]")!);
  };
  const navigate = async (path: string) => { await act(async () => { window.history.pushState({}, "", path); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); }); };
  async function mount(raw: string | null = null, member = "alice") {
    app = await mountApp({ url: "https://app.test/inbox?page=2&status=inbox", configureBrowser(browser) {
      vi.stubGlobal("HTMLElement", browser.HTMLElement);
      if (raw !== null) browser.sessionStorage.setItem(key, raw);
    }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test"), path = url.pathname;
      if (path === "/api/session") return Response.json({ member: { id: member, email: `${member}@app.test`, role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (path === "/api/notifications/summary") return Response.json({ unread: 0 });
      expect(path).toMatch(/^\/api\/inbox(?:\/|$)/);
      calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
      if (init?.method === "PATCH") {
        expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull();
        const body = JSON.parse(String(init.body)); bodies.push(body);
        const response = () => {
          if (writeStatus !== 200) return apiError(writeStatus, writeStatus === 409 ? "INBOX_VERSION_CONFLICT" : "UNAVAILABLE", writeStatus >= 500);
          status = body.status; updatedAt = new Date(Date.parse(body.expectedUpdatedAt) + 1).toISOString();
          return Response.json({ ...row(), ...(wrongId ? { id: "wrong" } : {}), ...(staleReceipt ? { updatedAt: version } : {}) });
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
  it("archives with version and owned detail plus exact current page readback", async () => {
    await mount(); await confirmAction(); await waitForApp(() => app!.browser.sessionStorage.getItem(key) === null);
    expect(main().textContent).not.toContain("Private row");
    expect(bodies).toEqual([{ status: "archived", expectedUpdatedAt: version }]);
    expect(calls).toEqual(["GET /api/inbox?page=2&pageSize=20&status=inbox", "PATCH /api/inbox/row", "GET /api/inbox/row", "GET /api/inbox?page=2&pageSize=20&status=inbox"]);
    expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    await navigate("/inbox?page=2&status=archived"); await waitForApp(() => action()?.textContent === "Restore");
    await confirmAction(); await waitForApp(() => app!.browser.sessionStorage.getItem(key) === null); expect(bodies[1]).toEqual({ status: "inbox", expectedUpdatedAt: next });
    expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it.each([409, 503])("retains unknown/conflicting write %s across route return, recovers with GET only", async code => {
    await mount(); writeStatus = code; await confirmAction(); expect(action().disabled).toBe(true); expect(recover()).toBeTruthy();
    const saved = app!.browser.sessionStorage.getItem(key)!; expect(saved).not.toContain("Private row"); expect(saved).not.toContain('"status"');
    await navigate("/unknown"); await navigate("/inbox?page=2&status=inbox"); await waitForApp(() => !!action());
    expect(action().disabled).toBe(true); expect(bodies).toHaveLength(1);
    await click(recover()); await waitForApp(() => app!.browser.sessionStorage.getItem(key) === null);
    expect(bodies).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it.each(["id", "version"])("keeps a malformed %s receipt unresolved without write retry", async mode => {
    await mount(); wrongId = mode === "id"; staleReceipt = mode === "version";
    await confirmAction(); expect(recover()).toBeTruthy(); expect(bodies).toHaveLength(1);
    await click(recover()); await waitForApp(() => app!.browser.sessionStorage.getItem(key) === null); expect(bodies).toHaveLength(1);
  });
  it.each([401, 403, 404, 503])("clears private rows on owned read failure %s after ACK", async code => {
    await mount(); detailStatus = code; await confirmAction(); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().textContent).not.toContain("Private row"); expect(bodies).toHaveLength(1);
    expect(app!.browser.sessionStorage.getItem(key) === null).toBe(code === 401 || code === 403);
  });
  it("retains the lock when exact page readback fails and can recover without PATCH", async () => {
    await mount(); listStatus = 503; await confirmAction(); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(recover()).toBeTruthy(); listStatus = 200; await click(recover()); await waitForApp(() => app!.browser.sessionStorage.getItem(key) === null); expect(bodies).toHaveLength(1);
  });
  it("clears private rows and retains the marker for malformed recovery detail", async () => {
    await mount(marker); malformedDetail = true; await click(recover());
    expect(main().textContent).not.toContain("Private row"); expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull(); expect(bodies).toHaveLength(0);
  });
  it.each([401, 403, 404, 503])("clears stale rows on recovery GET failure %s without another write", async code => {
    await mount(marker); detailStatus = code; await click(recover());
    expect(main().textContent).not.toContain("Private row"); expect(bodies).toHaveLength(0);
    expect(app!.browser.sessionStorage.getItem(key) === null).toBe(code === 401 || code === 403);
  });
  it("unlocks a definite rejection but never silently retries it", async () => {
    await mount(); writeStatus = 400; await confirmAction(); expect(action().disabled).toBe(false);
    expect(app!.browser.sessionStorage.getItem(key)).toBeNull(); expect(bodies).toHaveLength(1);
  });
  it.each(["ack", "recovery"])("rejects a regressed owned version during %s", async phase => {
    await mount(phase === "recovery" ? marker : null);
    detailVersion = phase === "ack" ? version : "2026-09-27T00:00:00.000Z";
    if (phase === "ack") await confirmAction(); else await click(recover());
    expect(main().textContent).not.toContain("Private row"); expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull();
    expect(bodies).toHaveLength(phase === "ack" ? 1 : 0);
  });
  it("locks only the matching member's restored marker", async () => {
    await mount(marker, "bob"); expect(action().disabled).toBe(false); expect(recover()).toBeFalsy(); expect(bodies).toHaveLength(0);
  });
  it.each(["{bad", marker.replace('"INBOX"', '"GOALS"')])("fails closed for corrupt storage %#", async raw => {
    await mount(raw); expect(action().disabled).toBe(true); await click(recover()); expect(bodies).toHaveLength(0);
  });
  it("does not write when the recovery marker cannot be saved", async () => {
    await mount(); vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); }); await confirmAction(); expect(bodies).toHaveLength(0); expect(action().disabled).toBe(true);
  });
  it("deduplicates clicks and ignores a late response after route leave", async () => {
    await mount(); delay = true; const button = action(); await act(async () => { button.click(); button.click(); }); expect(bodies).toHaveLength(0);
    const confirm = main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await act(async () => { confirm.click(); confirm.click(); }); await waitForApp(() => !!resolveWrite);
    await navigate("/unknown"); const count = calls.length; await act(async () => resolveWrite!());
    expect(calls).toHaveLength(count); expect(bodies).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull();
    await navigate("/inbox?page=2"); await waitForApp(() => !!action()); expect(action().disabled).toBe(true);
  });
});
