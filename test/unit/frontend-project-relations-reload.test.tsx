// @vitest-environment node
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const version = "2026-09-27T00:00:00.000Z";
const key = "memory-garden:planning-write:v1:alice:PROJECTS";
describe("project relations persistent read-only recovery through App", () => {
  let app: MountedApp | undefined;
  let linked: boolean, revision: number, failure: number, readFailure: boolean, summaryFailure: boolean;
  let holdWrite: Promise<void> | undefined, holdRead: Promise<void> | undefined, readVersion: string | undefined;
  let writes: { method: string; path: string; body: unknown }[], reads: string[], markers: (string | null)[];
  const project = () => ({ id: "p", clientKey: "p", title: "Private project", description: null, status: "active", progress: 0, targetAt: null, createdAt: version, updatedAt: new Date(Date.parse(version) + revision).toISOString() });
  const summary = () => ({ goalCount: linked ? 1 : 0, taskCount: 0, completedTaskCount: 0, goals: linked ? [{ id: "target", title: "Private target" }] : [] });
  const main = () => app!.container.querySelector("main")!;
  const editor = () => main().querySelector("[data-project-relations-editor]")!;
  const button = (text: string, root: Element = main()) => [...root.querySelectorAll("button")].find(b => b.textContent === text)!;
  const recovery = () => main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!;
  const stored = () => app!.browser.sessionStorage.getItem(key);
  async function click(node: HTMLButtonElement) { await act(async () => { node.click(); }); }
  async function navigate(path: string) { await act(async () => { window.history.pushState({}, "", path); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); }); }
  async function mount(raw: string | null = null, memberId = "alice") {
    app = await mountApp({ url: "https://app.test/projects", configureBrowser(browser) { if (raw !== null) browser.sessionStorage.setItem(key, raw); }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/session") return Response.json({ member: { id: memberId, email: `${memberId}@app.test`, role: "contributor" }, capabilities: ["knowledge:read"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (init?.method === "POST" || init?.method === "DELETE") {
        markers.push(stored()); writes.push({ method: init.method, path: url.pathname, body: JSON.parse(String(init.body)) });
        await holdWrite;
        if ([400, 401, 403, 404].includes(failure)) return apiError(failure, "DENIED", false);
        revision++; linked = init.method === "POST";
        if (failure) return apiError(failure, "UNKNOWN", true);
        return Response.json(init.method === "POST" ? { linked: true, project: summary() } : summary());
      }
      reads.push(url.pathname);
      if (url.pathname === "/api/projects") return Response.json({ items: [project()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      if (url.pathname === "/api/projects/p") return Response.json(project());
      if (url.pathname.endsWith("/summary")) return summaryFailure ? apiError(503, "UNAVAILABLE", true) : Response.json(summary());
      await holdRead;
      if (readFailure) return apiError(503, "UNAVAILABLE", true);
      return Response.json({ projectId: "p", kind: url.pathname.endsWith("/tasks") ? "tasks" : "goals", expectedUpdatedAt: readVersion ?? project().updatedAt, items: [{ id: "target", title: "Private target", linked }], pagination: { page: Number(url.searchParams.get("page")), pageSize: Number(url.searchParams.get("pageSize")), total: 1, totalPages: 1 } });
    } });
    await waitForApp(() => !!button("Manage links"));
  }
  async function open(kind = "goals") {
    await click(button("Manage links")); await waitForApp(() => !!editor()?.textContent?.includes("Private target"));
    if (kind === "tasks") { await click(button("Tasks", editor())); await waitForApp(() => !!button(linked ? "Unlink" : "Link", editor()) && !button(linked ? "Unlink" : "Link", editor()).disabled); }
  }
  beforeEach(() => { linked = false; revision = 0; failure = 0; readFailure = false; summaryFailure = false; holdWrite = undefined; holdRead = undefined; readVersion = undefined; writes = []; reads = []; markers = []; });
  afterEach(async () => { await app?.unmount(); app = undefined; vi.restoreAllMocks(); });
  it.each([ ["goals", false], ["goals", true], ["tasks", false], ["tasks", true] ] as const)("persists %s linked=%s before mutation; returning only permits read-only review", async (kind, initial) => {
    linked = initial; await mount(); await open(kind); let release!: () => void;
    holdWrite = new Promise(resolve => { release = resolve; });
    await click(button(initial ? "Unlink" : "Link", editor()));
    expect(writes).toHaveLength(1); expect(markers[0]).not.toBeNull();
    const raw = stored()!; expect(JSON.parse(raw).record).toMatchObject({ id: "p", expectedUpdatedAt: version });
    expect(raw).not.toContain("Private target"); expect(recovery().disabled).toBe(true);
    await navigate("/settings"); await navigate("/projects"); await waitForApp(() => !!button("Manage links"));
    await act(async () => release());
    expect(stored()).toBe(raw); expect(button("Manage links").disabled).toBe(true);
    await click(recovery()); await waitForApp(() => !button("Manage links").disabled);
    expect(writes).toHaveLength(1); expect(stored()).toBeNull(); expect(reads).toContain("/api/projects/p");
    await open(kind); await click(button(initial ? "Link" : "Unlink", editor()));
    await waitForApp(() => !button("Close links", editor()).disabled);
    expect(writes).toHaveLength(2); expect(writes[1]!.body).toMatchObject({ expectedUpdatedAt: "2026-09-27T00:00:00.001Z" }); expect(stored()).toBeNull();
  });
  it("restores a fresh realm and isolates another member without replay", async () => {
    await mount(); await open(); failure = 503; readFailure = true; await click(button("Link", editor())); await waitForApp(() => !!button("Retry links", editor()));
    const raw = stored(); expect(raw).not.toBeNull(); await app!.unmount(); app = undefined;
    await mount(raw, "bob"); expect(button("Manage links").disabled).toBe(false); expect(stored()).toBe(raw); expect(writes).toHaveLength(1);
    await app!.unmount(); app = undefined; await mount(raw); expect(button("Manage links").disabled).toBe(true);
    await click(recovery()); await waitForApp(() => !button("Manage links").disabled); expect(writes).toHaveLength(1); expect(stored()).toBeNull();
  });
  it("holds the barrier through failed readback and clears only after explicit GET retry", async () => {
    await mount(); await open(); failure = 503; readFailure = true; await click(button("Link", editor())); await waitForApp(() => !!button("Retry links", editor()));
    expect(stored()).not.toBeNull(); expect(recovery().disabled).toBe(true);
    readFailure = false; await click(button("Retry links", editor())); await waitForApp(() => !!button("Unlink", editor()));
    expect(stored()).toBeNull(); expect(writes).toHaveLength(1);
  });
  it("closing a failed editor cannot bypass the pending marker", async () => {
    await mount(); await open(); readFailure = true; await click(button("Link", editor())); await waitForApp(() => !!button("Retry links", editor()));
    await click(button("Close links", editor())); expect(editor()).toBeNull(); expect(button("Manage links").disabled).toBe(true); expect(stored()).not.toBeNull();
    await click(recovery()); await waitForApp(() => !button("Manage links").disabled); expect(stored()).toBeNull(); expect(writes).toHaveLength(1);
  });
  it.each(["throw", "drop"])("refuses a write when journal persistence is %s", async mode => {
    await mount(); await open(); vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { if (mode === "throw") throw new Error("quota"); });
    await click(button("Link", editor())); expect(writes).toEqual([]); expect(button("Link", editor()).disabled).toBe(true);
  });
  it("keeps all mutations blocked if marker removal fails", async () => {
    await mount(); await open(); const spy = vi.spyOn(app!.browser.sessionStorage, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    await click(button("Link", editor())); await waitForApp(() => !!button("Unlink", editor()));
    expect(stored()).not.toBeNull(); expect(button("Unlink", editor()).disabled).toBe(true);
    await click(button("Unlink", editor())); expect(writes).toHaveLength(1);
    spy.mockRestore(); await click(button("Close links", editor())); await click(recovery()); await waitForApp(() => !button("Manage links").disabled); expect(stored()).toBeNull();
  });
  it.each([401, 403, 404])("clears private UI on write denial %s with the correct journal retention", async status => {
    await mount(); await open(); failure = status; await click(button("Link", editor())); await waitForApp(() => !main().textContent!.includes("Private project"));
    expect(main().textContent).not.toContain("Private target"); if (status === 404) expect(stored()).not.toBeNull(); else expect(stored()).toBeNull();
  });
  it("retains the barrier when the relation list version regresses", async () => {
    await mount(); await open(); readVersion = "2026-09-26T00:00:00.000Z"; await click(button("Link", editor()));
    await waitForApp(() => !!button("Retry links", editor())); expect(stored()).not.toBeNull(); expect(editor().textContent).not.toContain("Private target");
    readVersion = undefined; await click(button("Retry links", editor())); await waitForApp(() => !!button("Unlink", editor())); expect(stored()).toBeNull(); expect(writes).toHaveLength(1);
  });
  it("does not clear a marker after a late relation read following route exit", async () => {
    await mount(); await open(); let release!: () => void; holdRead = new Promise(resolve => { release = resolve; });
    await click(button("Link", editor())); await waitForApp(() => reads.filter(p => p.endsWith("/goals")).length === 2);
    const raw = stored(); expect(raw).not.toBeNull(); await navigate("/settings"); await act(async () => release()); expect(stored()).toBe(raw);
  });
  it("releases a known 400 rejection and preserves the original relation", async () => {
    await mount(); await open(); failure = 400; await click(button("Link", editor())); await waitForApp(() => !button("Link", editor()).disabled);
    expect(markers[0]).not.toBeNull(); expect(stored()).toBeNull(); expect(writes).toHaveLength(1);
  });
  it("retains the barrier if the relation list succeeds but counts fail", async () => {
    await mount(); await open(); summaryFailure = true; await click(button("Link", editor())); await waitForApp(() => !!button("Retry links", editor()));
    expect(stored()).not.toBeNull(); summaryFailure = false; await click(button("Retry links", editor())); await waitForApp(() => !!button("Unlink", editor())); expect(stored()).toBeNull(); expect(writes).toHaveLength(1);
  });
});
