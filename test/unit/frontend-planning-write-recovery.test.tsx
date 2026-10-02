// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forceRemountAppAt, mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
for (const module of ["goals", "projects"] as const) describe(`${module} persistent write recovery through real App`, () => {
  const version = "2026-09-27T00:00:00.000Z";
  const key = `memory-garden:planning-write:v1:alice:${module.toUpperCase()}`;
  const marker = JSON.stringify({ version: 1, memberId: "alice", module: module.toUpperCase(), record: { token: "request-1", id: "row", expectedUpdatedAt: version } });
  let app: MountedApp | undefined; let writes: Record<string, unknown>[] = []; let reads: string[] = [];
  let failure: number | undefined; let detailId = "row"; let defer: ((value: Response) => void) | undefined; let delayed = false; let writeStatus = 503; let listFailure: number | undefined; let detailVersion = version; let delayDetail = false; let resolveDetail: (() => void) | undefined;
  const row = () => ({ id: detailId, clientKey: "row", title: "Current row", description: null, status: "active", progress: 10, targetAt: null, createdAt: version, updatedAt: detailVersion });
  const main = () => app!.container.querySelector("main")!;
  const complete = () => [...main().querySelectorAll("button")].find(node => node.textContent === "Complete")!;
  const recover = () => main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!;
  async function click(node: HTMLButtonElement) { await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function navigate(path: string) { await act(async () => { expect(writeWorkspaceHistory("push", path)).toBe("committed"); }); }
  // Both planning routes block normal navigation until reconciliation; forced teardown
  // keeps the independent late-callback/remount recovery contract under test.
  async function leavePending(path: string) {
    await act(async () => { expect(writeWorkspaceHistory("push", path)).toBe("blocked"); });
    await forceRemountAppAt(app!, path);
  }
  async function mount(raw: string | null = null, memberId = "alice") {
    app = await mountApp({ url: `https://app.test/${module}`, configureBrowser(browser) { vi.stubGlobal("HTMLElement", browser.HTMLElement); if (raw !== null) browser.sessionStorage.setItem(key, raw); }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test"); const path = url.pathname;
      if (path === "/api/session") return Response.json({ member: { id: memberId, email: `${memberId}@app.test`, role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (init?.method === "POST") {
        expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull();
        writes.push(JSON.parse(String(init.body)));
        if (delayed) return new Promise<Response>(resolve => { defer = resolve; });
        if (writeStatus === 200) return Response.json({ ...row(), status: "completed", updatedAt: "2026-09-27T00:00:00.001Z" });
        return apiError(writeStatus, "UNAVAILABLE", writeStatus >= 500);
      }
      reads.push(path);
      if (path === `/api/${module}/row`) { if (failure) return apiError(failure, "DENIED", failure >= 500); if (delayDetail) return new Promise<Response>(resolve => { resolveDetail = () => resolve(Response.json(row())); }); return Response.json(row()); }
      if (path.endsWith("/summary")) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
      if (listFailure) return apiError(listFailure, "UNAVAILABLE", true);
      return Response.json({ items: [row()], pagination: { page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 20), total: 1, totalPages: 1 } });
    } }); await waitForApp(() => !!complete());
  }
  async function submitStatus() {
    const count = writes.length;
    await click(complete()); expect(writes).toHaveLength(count);
    const confirm = main().querySelector<HTMLButtonElement>("[data-confirm-action]"); expect(confirm).not.toBeNull();
    await click(confirm!);
  }
  afterEach(async () => { await app?.unmount(); app = undefined; writes = []; reads = []; failure = undefined; detailId = "row"; delayed = false; defer = undefined; writeStatus = 503; listFailure = undefined; detailVersion = version; delayDetail = false; resolveDetail = undefined; });
  it("cancel and route exit leave no write recovery marker or request", async () => {
    await mount(); await click(complete()); expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    await click(main().querySelector<HTMLButtonElement>("[data-cancel-action]")!); expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    await click(complete()); await navigate("/settings"); await navigate(`/${module}`); await waitForApp(() => !!complete());
    expect(main().querySelector('[role="alertdialog"]')).toBeNull(); expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it("persists before POST and recovers an unknown write after a route return using GET only", async () => {
    await mount(); await submitStatus(); expect(writes).toEqual([{ status: "completed", expectedUpdatedAt: version }]);
    expect(complete().disabled).toBe(true); expect(recover()).toBeTruthy();
    const raw = app!.browser.sessionStorage.getItem(key); expect(raw).toContain('"id":"row"');
    await leavePending("/settings"); await navigate(`/${module}`); await waitForApp(() => !!complete());
    expect(complete().disabled).toBe(true); expect(writes).toHaveLength(1);
    await click(recover()); await waitForApp(() => !complete().disabled);
    expect(reads).toContain(`/api/${module}/row`); expect(writes).toHaveLength(1);
    expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    expect(main().textContent).toContain("does not prove");
  });
  it("restores a fresh browser realm without auto mutation and only clears after explicit readback", async () => {
    await mount(marker); expect(complete().disabled).toBe(true); expect(writes).toEqual([]);
    const raw = app!.browser.sessionStorage.getItem(key); await app!.unmount(); app = undefined;
    await mount(raw); expect(complete().disabled).toBe(true); await click(recover());
    await waitForApp(() => !complete().disabled); expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it("does not render or clear another member's marker", async () => {
    await mount(marker, "bob"); expect(complete().disabled).toBe(false); expect(recover()).toBeNull(); expect(app!.browser.sessionStorage.getItem(key)).toBe(marker);
  });
  it("blocks corrupted storage and refuses to discard it", async () => {
    await mount("{bad"); expect(complete().disabled).toBe(true); await click(recover());
    expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBe("{bad"); expect(complete().disabled).toBe(true);
  });
  it("fails closed before POST on quota failure, and storage retry never writes", async () => {
    await mount(); const spy = vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await submitStatus(); expect(writes).toEqual([]); expect(complete().disabled).toBe(true);
    spy.mockRestore(); await click(recover()); await waitForApp(() => !complete().disabled); expect(writes).toEqual([]);
  });
  it.each([503, 401, 403, 404])("keeps recovery read-only on target read failure %s", async status => {
    await mount(marker); failure = status; await click(recover()); expect(writes).toEqual([]);
    if (status === 401 || status === 403) { expect(main().textContent).not.toContain("Current row"); expect(app!.browser.sessionStorage.getItem(key)).toBeNull(); }
    else { expect(app!.browser.sessionStorage.getItem(key)).toBe(marker); expect(complete()?.disabled ?? true).toBe(true); }
    if (status === 404) expect(main().textContent).not.toContain("Current row");
  });
  it("refuses mismatched target receipts and failed record cleanup", async () => {
    await mount(marker); detailId = "other"; await click(recover()); expect(app!.browser.sessionStorage.getItem(key)).toBe(marker); expect(complete().disabled).toBe(true);
    detailId = "row"; const spy = vi.spyOn(app!.browser.sessionStorage, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    await click(recover()); expect(app!.browser.sessionStorage.getItem(key)).toBe(marker); expect(complete().disabled).toBe(true);
    spy.mockRestore(); await click(recover()); await waitForApp(() => !complete().disabled); expect(writes).toEqual([]);
  });
  it("ignores a late success from the old mount and never clears its new recovery barrier", async () => {
    await mount(); delayed = true; await submitStatus(); await waitForApp(() => !!defer);
    const raw = app!.browser.sessionStorage.getItem(key); await leavePending("/settings"); await navigate(`/${module}`); await waitForApp(() => !!complete());
    await act(async () => defer!(Response.json({ ...row(), status: "completed", updatedAt: "2026-09-27T00:00:00.001Z" })));
    expect(app!.browser.sessionStorage.getItem(key)).toBe(raw); expect(complete().disabled).toBe(true); expect(writes).toHaveLength(1);
  });
  it("clears a successful write only after readback and preserves a success whose readback fails", async () => {
    await mount(); writeStatus = 200; await submitStatus(); await waitForApp(() => !complete().disabled);
    expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
    listFailure = 503; await submitStatus(); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull(); expect(writes).toHaveLength(2);
    listFailure = undefined; await click(recover()); await waitForApp(() => !!complete() && !complete().disabled); expect(writes).toHaveLength(2);
  });
  it("releases a known rejected write but retains retryable failures", async () => {
    await mount(); writeStatus = 400; await submitStatus(); expect(app!.browser.sessionStorage.getItem(key)).toBeNull(); expect(complete().disabled).toBe(false);
    writeStatus = 408; await submitStatus(); expect(app!.browser.sessionStorage.getItem(key)).not.toBeNull(); expect(complete().disabled).toBe(true);
  });
  it.each(["invalid", "2026-09-26T00:00:00.000Z"])("keeps the barrier for invalid or regressed target version %s", async value => {
    await mount(marker); detailVersion = value; await click(recover()); expect(app!.browser.sessionStorage.getItem(key)).toBe(marker); expect(complete().disabled).toBe(true); expect(writes).toEqual([]);
  });
  it("does not clear after a late recovery GET following a route exit", async () => {
    await mount(marker); delayDetail = true; await click(recover()); await waitForApp(() => !!resolveDetail);
    await leavePending("/settings"); await act(async () => resolveDetail!()); expect(app!.browser.sessionStorage.getItem(key)).toBe(marker);
    delayDetail = false; await navigate(`/${module}`); await waitForApp(() => !!complete()); expect(complete().disabled).toBe(true); expect(writes).toEqual([]);
  });
  it("invalidates pending recovery when the page query changes, without clearing the barrier", async () => {
    await mount(marker); delayDetail = true; await click(recover()); await waitForApp(() => !!resolveDetail);
    await leavePending(`/${module}?page=1&pageSize=50`);
    await act(async () => resolveDetail!());
    await waitForApp(() => !!recover() && !recover().disabled);
    expect(app!.browser.sessionStorage.getItem(key)).toBe(marker); expect(writes).toEqual([]);
    delayDetail = false; await click(recover()); await waitForApp(() => !complete().disabled);
    expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it("uses the new displayed version for a new explicit action after review, not the old request", async () => {
    await mount(marker); detailVersion = "2026-09-27T00:00:00.002Z"; await click(recover()); await waitForApp(() => !complete().disabled);
    await submitStatus(); expect(writes).toEqual([{ status: "completed", expectedUpdatedAt: "2026-09-27T00:00:00.002Z" }]);
  });
  if (module === "goals") it("persists the progress write barrier too", async () => {
    await mount(); const node = main().querySelector('input[type="range"]')!; const prop = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { (node as unknown as Record<string, { onChange: (event: unknown) => void }>)[prop].onChange({ currentTarget: { value: "75" } }); });
    expect(writes).toEqual([{ progress: 75, expectedUpdatedAt: version }]); expect(recover()).toBeTruthy(); expect(complete().disabled).toBe(true);
  });
});
