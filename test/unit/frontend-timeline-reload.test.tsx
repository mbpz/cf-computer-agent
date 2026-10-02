// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, waitForApp, forceRemountAppAt, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const stamp = "2026-09-27T00:00:00.000Z";
const createKey = "memory-garden:timeline-create:v1:alice:p";
const statusKey = "memory-garden:planning-write:v1:alice:TIMELINE:p";
describe("timeline persistent recovery through App", () => {
  let app: MountedApp | undefined, failure: number, readFail: boolean, rev: number;
  let hold: Promise<void> | undefined;
  let detailHold: Promise<void> | undefined, detailFailure: number, detailPatch: Record<string, unknown>;
  const barrier = () => JSON.stringify({ version: 1, memberId: "alice", module: "TIMELINE:p", record: { token: "pending-status", id: "row", expectedUpdatedAt: stamp } });
  let writes: { path: string; body: Record<string, any>; saved: string | null }[];
  const row = (p = "p") => ({ id: "row", projectId: p, clientKey: "row", title: "Private row", body: "private notes", kind: "meeting", status: "open", startsAt: null, dueAt: null, createdAt: stamp, updatedAt: new Date(Date.parse(stamp) + rev).toISOString() });
  const main = () => app!.container.querySelector("main")!;
  const button = (text: string) => [...main().querySelectorAll("button")].find(n => n.textContent === text)!;
  const title = () => main().querySelector<HTMLInputElement>('input[aria-label="Timeline title"]')!;
  const stored = (key = createKey) => app!.browser.sessionStorage.getItem(key);
  const recovery = () => main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!;
  async function click(n: HTMLButtonElement) { expect(n).toBeTruthy(); await act(async () => { n.click(); }); }
  async function fill(value: string) { const n = title(); const k = Object.keys(n).find(k => k.startsWith("__reactProps$"))!; await act(async () => (n as any)[k].onChange({ currentTarget: { value } })); }
  async function forcedRemount(p: string) { await forceRemountAppAt(app!, `/projects/${p}/timeline`); await waitForApp(() => !!title()); }
  async function mount(raw: string | null = null, member = "alice", key = createKey) {
    app = await mountApp({ url: "https://app.test/projects/p/timeline", configureBrowser(w) { if (raw) w.sessionStorage.setItem(key, raw); }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/session") return Response.json({ member: { id: member, email: `${member}@test.local`, role: "contributor" }, capabilities: ["knowledge:read"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      const p = url.pathname.split("/")[3];
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); writes.push({ path: url.pathname, body, saved: stored(url.pathname.endsWith("/status") ? statusKey : createKey) });
        await hold;
        if (failure) return apiError(failure, "FAILED", failure >= 500);
        rev++;
        return Response.json(url.pathname.endsWith("/status") ? { ...row(p), status: body.status } : { item: { ...row(p), ...body }, created: true });
      }
      if (readFail) return apiError(503, "UNAVAILABLE", true);
      if (url.pathname.endsWith("/timeline")) {
        const page = Number(url.searchParams.get("page") ?? 1), pageSize = Number(url.searchParams.get("pageSize") ?? 20);
        return Response.json({ items: page === 1 ? [row(p)] : [], pagination: { page, pageSize, total: 1, totalPages: 1 } });
      }
      if (url.pathname.endsWith("/row")) { await detailHold; return detailFailure ? apiError(detailFailure, "DETAIL_FAILED", detailFailure >= 500) : Response.json({ ...row(p), ...detailPatch }); }
      return Response.json({ id: p, clientKey: p, title: `Project ${p}`, description: null, status: "active", progress: 0, targetAt: null, createdAt: stamp, updatedAt: stamp });
    } }); await waitForApp(() => !!title());
  }
  beforeEach(() => { failure = 0; readFail = false; rev = 0; writes = []; hold = undefined; detailHold = undefined; detailFailure = 0; detailPatch = {}; });
  afterEach(async () => { await app?.unmount(); app = undefined; vi.restoreAllMocks(); });
  it("persists before creating and restores the exact unresolved intent after forced remount", async () => {
    await mount(); await fill("Meeting draft"); failure = 503; await click(button("Add to timeline"));
    expect(writes[0].saved).not.toBeNull(); const body = writes[0].body;
    await forceRemountAppAt(app!, "/projects/q/timeline"); await waitForApp(() => !!title()); expect(title().value).toBe(""); await forceRemountAppAt(app!, "/projects/p/timeline"); await waitForApp(() => !!title());
    expect(title().value).toBe("Meeting draft"); expect(title().disabled).toBe(true); expect(button("Mark done").disabled).toBe(true); expect(writes).toHaveLength(1);
    failure = 0; await click(button("Retry original creation")); await waitForApp(() => title().value === "");
    expect(writes[1].body).toEqual(body); expect(stored()).toBeNull();
  });
  it("restores fresh-realm unknown creation without replay and isolates members", async () => {
    await mount(); await fill("Saved draft"); failure = 503; await click(button("Add to timeline")); const raw = stored(); expect(raw).not.toBeNull();
    await app!.unmount(); app = undefined; await mount(raw, "bob"); expect(title().value).toBe(""); await app!.unmount(); app = undefined;
    await mount(raw); expect(title().value).toBe("Saved draft"); expect(writes).toHaveLength(1); expect(button("Retry original creation")).toBeTruthy();
  });
  it("restores acknowledged creation as GET-only after a failed readback", async () => {
    await mount(); await fill("Confirmed"); readFail = true; await click(button("Add to timeline"));
    await waitForApp(() => !!button("Retry list read")); const raw = stored(); expect(JSON.parse(raw!).acknowledged).toBe(true); readFail = false;
    await app!.unmount(); app = undefined; await mount(raw); await click(button("Retry list read"));
    await waitForApp(() => title().value === ""); expect(writes).toHaveLength(1); expect(stored()).toBeNull();
  });
  it("retains an unresolved creation across forced App teardown and page remount and ignores its late receipt", async () => {
    await mount(); await fill("Page-private draft"); let release!: () => void;
    hold = new Promise(r => { release = r; }); await click(button("Add to timeline")); const raw = stored();
    await act(async () => expect(writeWorkspaceHistory("push", "/projects/p/timeline?page=2")).toBe("blocked"));
    await forceRemountAppAt(app!, "/projects/p/timeline?page=2");
    await waitForApp(() => !!button("Retry original creation"));
    expect(title().value).toBe("Page-private draft"); expect(title().disabled).toBe(true);
    await act(async () => release()); expect(stored()).toBe(raw); expect(writes).toHaveLength(1);
    expect(main().textContent).not.toContain("Private row");
    await forceRemountAppAt(app!, "/projects/p/timeline"); await waitForApp(() => !!title()); expect(title().value).toBe("Page-private draft"); expect(writes).toHaveLength(1);
  });
  it("cancels a late detail recovery on forced page remount and permits explicit GET review off-page", async () => {
    await mount(barrier(), "alice", statusKey); let release!: () => void; detailHold = new Promise(r => { release = r; });
    await click(recovery());
    await act(async () => { expect(writeWorkspaceHistory("push", "/projects/p/timeline?page=2")).toBe("blocked"); });
    await forceRemountAppAt(app!, "/projects/p/timeline?page=2");
    await waitForApp(() => !!title()); await act(async () => release());
    expect(stored(statusKey)).toBe(barrier()); expect(title().disabled).toBe(true); expect(writes).toHaveLength(0);
    detailHold = undefined; await click(recovery()); await waitForApp(() => !title().disabled);
    expect(stored(statusKey)).toBeNull(); expect(main().textContent).not.toContain("Private row"); expect(writes).toHaveLength(0);
  });
  it.each(["throw", "drop"])("blocks create before network when storage %s", async mode => {
    await mount(); await fill("Draft"); vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { if (mode === "throw") throw Error("quota"); });
    await click(button("Add to timeline")); expect(writes).toHaveLength(0); expect(title().disabled).toBe(true);
  });
  it("blocks malformed creation storage and never silently replaces it", async () => {
    await mount("{"); expect(title().disabled).toBe(true); expect(button("Mark done").disabled).toBe(true); expect(stored()).toBe("{"); expect(writes).toHaveLength(0);
  });
  it("retains the acknowledged record when cleanup fails", async () => {
    await mount(); await fill("Draft"); vi.spyOn(app!.browser.sessionStorage, "removeItem").mockImplementation(() => { throw Error("denied"); });
    await click(button("Add to timeline")); expect(stored()).not.toBeNull(); expect(title().disabled).toBe(true); expect(button("Mark done").disabled).toBe(true);
  });
  it("does not let a late create acknowledgment clear the forced-remounted route intent", async () => {
    await mount(); await fill("Late"); let release!: () => void; hold = new Promise(r => { release = r; }); await click(button("Add to timeline"));
    const raw = stored(); expect(raw).not.toBeNull(); await forceRemountAppAt(app!, "/projects/q/timeline"); await waitForApp(() => !!title()); await forceRemountAppAt(app!, "/projects/p/timeline"); await waitForApp(() => !!title()); await act(async () => release());
    expect(stored()).toBe(raw); expect(title().value).toBe("Late"); expect(writes).toHaveLength(1);
  });
  it.each([401,403,404])("clears denied private UI on creation %s", async status => {
    await mount(); await fill("Secret"); failure = status; await click(button("Add to timeline")); await waitForApp(() => !!button("Try timeline again"));
    expect(main().textContent).not.toContain("Private row"); expect(title()).toBeNull(); if (status !== 404) expect(stored()).toBeNull(); else expect(stored()).not.toBeNull();
  });
  it("persists a status barrier across forced remount and only releases by GET review", async () => {
    await mount(); let release!: () => void; hold = new Promise(r => { release = r; }); await click(button("Mark done"));
    const raw = stored(statusKey); expect(raw).not.toBeNull(); expect(raw).not.toContain("Private row");
    await act(async () => { expect(writeWorkspaceHistory("push", "/projects/q/timeline")).toBe("blocked"); }); await forcedRemount("q"); expect(button("Mark done").disabled).toBe(false); await forcedRemount("p"); expect(button("Mark done").disabled).toBe(true);
    await act(async () => release()); expect(stored(statusKey)).toBe(raw); await click(recovery()); await waitForApp(() => !button("Mark done").disabled);
    expect(writes).toHaveLength(1); expect(stored(statusKey)).toBeNull(); expect(main().textContent).toContain("does not prove");
  });
  it("restores fresh-realm status barriers and isolates another member", async () => {
    await mount(); failure = 503; readFail = true; await click(button("Mark done")); const raw = stored(statusKey); expect(raw).not.toBeNull(); readFail = false;
    await app!.unmount(); app = undefined; await mount(raw, "bob", statusKey); expect(button("Mark done").disabled).toBe(false); await app!.unmount(); app = undefined;
    await mount(raw, "alice", statusKey); expect(button("Mark done").disabled).toBe(true); await click(recovery()); await waitForApp(() => !button("Mark done").disabled); expect(writes).toHaveLength(1); expect(stored(statusKey)).toBeNull();
  });
  it.each([
    { id: "foreign" }, { projectId: "q" }, { updatedAt: "2026-09-26T00:00:00.000Z" },
    { updatedAt: "yesterday" }, { updatedAt: "2026-09-27T00:00:00Z" }, { kind: "invalid" },
  ])("keeps status recovery locked on invalid detail %#", async patch => {
    await mount(barrier(), "alice", statusKey); detailPatch = patch;
    await click(recovery()); await waitForApp(() => !recovery().disabled);
    expect(button("Mark done").disabled).toBe(true); expect(stored(statusKey)).toBe(barrier()); expect(writes).toHaveLength(0);
    detailPatch = {}; await click(recovery()); await waitForApp(() => !button("Mark done").disabled); expect(stored(statusKey)).toBeNull();
  });
  it.each([401, 403, 404, 503])("handles detail denial or failure %s without replay", async status => {
    await mount(barrier(), "alice", statusKey); detailFailure = status;
    await click(recovery()); await waitForApp(() => status === 503 ? !recovery().disabled : !!button("Try timeline again"));
    expect(writes).toHaveLength(0);
    if (status !== 503) { expect(main().textContent).not.toContain("Private row"); expect(title()).toBeNull(); }
    expect(stored(statusKey)).toBe(status === 401 || status === 403 ? null : barrier());
  });
  it("keeps the barrier when confirmed review cannot clean storage", async () => {
    await mount(barrier(), "alice", statusKey);
    const remove = vi.spyOn(app!.browser.sessionStorage, "removeItem").mockImplementation(() => { throw Error("denied"); });
    await click(recovery()); await waitForApp(() => !recovery().disabled);
    expect(button("Mark done").disabled).toBe(true); expect(stored(statusKey)).toBe(barrier()); expect(writes).toHaveLength(0);
    remove.mockRestore(); await click(recovery()); await waitForApp(() => !button("Mark done").disabled); expect(stored(statusKey)).toBeNull();
  });
  it("ignores a late recovery detail after forced remount", async () => {
    await mount(barrier(), "alice", statusKey); let release!: () => void; detailHold = new Promise(r => { release = r; });
    await click(recovery()); await act(async () => { expect(writeWorkspaceHistory("push", "/projects/q/timeline")).toBe("blocked"); }); await forcedRemount("q"); await forcedRemount("p"); await act(async () => release());
    expect(stored(statusKey)).toBe(barrier()); expect(button("Mark done").disabled).toBe(true); expect(writes).toHaveLength(0);
    detailHold = undefined; await click(recovery()); await waitForApp(() => !button("Mark done").disabled);
  });
  it.each(["throw", "drop"])("does not mutate status when persistence %s", async mode => {
    await mount(); vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { if (mode === "throw") throw Error("quota"); });
    await click(button("Mark done")); expect(writes).toHaveLength(0); expect(button("Mark done").disabled).toBe(true);
  });
});
