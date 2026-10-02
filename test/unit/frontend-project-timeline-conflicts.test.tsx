// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const oldVersion = "2026-09-27T00:00:00.000Z", newVersion = "2026-09-27T00:00:00.001Z";
const row = (fresh = false) => ({ id: "row", projectId: "project", clientKey: "row", kind: "action_item", title: fresh ? "Fresh action" : "Stale action", body: "private notes", status: "open", startsAt: null, dueAt: null, createdAt: oldVersion, updatedAt: fresh ? newVersion : oldVersion });
describe("timeline status reconciliation through real App", () => {
  let app: MountedApp | undefined;
  let bodies: Record<string, unknown>[]; let reads: number; let readFailure: number | undefined;
  let post: (body: Record<string, unknown>) => Response | Promise<Response>;
  let delayed: boolean; let resolveRead: (() => void) | undefined; let readSignal: AbortSignal | null | undefined;
  const main = () => app!.container.querySelector("main")!;
  const button = (text: string) => [...main().querySelectorAll("button")].find(node => node.textContent === text)!;
  async function mount() {
    bodies = []; reads = 0; readFailure = undefined; delayed = false; resolveRead = undefined; readSignal = undefined;
    post = () => apiError(409, "PROJECT_TIMELINE_VERSION_CONFLICT", false);
    app = await mountAuthenticatedApp({ url: "https://app.test/projects/project/timeline", role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); bodies.push(body); return post(body); }
      if (url.pathname.endsWith("/timeline")) {
        reads++; readSignal = init?.signal;
        if (reads > 1 && readFailure) return apiError(readFailure, "READ_FAILED", true);
        const response = () => Response.json({ items: [row(reads > 1)], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
        if (reads > 1 && delayed) return new Promise<Response>(done => { resolveRead = () => done(response()); });
        return response();
      }
      return Response.json({ id: "project", clientKey: "project", title: "Private project", status: "active", progress: 0, createdAt: oldVersion, updatedAt: oldVersion });
    } });
    await waitForApp(() => !!button("Mark done"));
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  afterEach(async () => { await app?.unmount(); app = undefined; });
  it("sends the displayed version, refreshes 409, and uses the new version only after another explicit click", async () => {
    await mount(); await click(button("Mark done"));
    await waitForApp(() => main().textContent!.includes("Fresh action"));
    expect(bodies).toEqual([{ status: "done", expectedUpdatedAt: oldVersion }]);
    expect(main().textContent).not.toContain("Stale action"); expect(main().textContent).toContain("Review the latest data before trying again.");
    await click(button("Archive")); expect(bodies[1]).toEqual({ status: "archived", expectedUpdatedAt: newVersion });
  });
  it.each([401, 403, 404, 503])("clears stale data when conflict readback fails %s and retries only GET", async status => {
    await mount(); readFailure = status; await click(button("Mark done"));
    await waitForApp(() => !!button("Try timeline again"));
    expect(main().textContent).not.toContain("Stale action"); expect(main().querySelector("fieldset")).toBeNull();
    readFailure = undefined; await click(button("Try timeline again")); await waitForApp(() => main().textContent!.includes("Fresh action"));
    expect(bodies).toHaveLength(1);
  });
  it("locks same-tick writes and creation throughout conflict readback", async () => {
    await mount(); delayed = true; const done = button("Mark done"), archive = button("Archive");
    await act(async () => { done.click(); archive.click(); }); await waitForApp(() => !!resolveRead);
    expect(bodies).toHaveLength(1); expect(button("Mark done").disabled).toBe(true);
    expect((main().querySelector('input[aria-label="Timeline title"]') as HTMLInputElement).disabled).toBe(true);
    await act(async () => resolveRead!()); await waitForApp(() => !button("Mark done").disabled);
  });
  it("aborts and ignores conflict reconciliation after leaving the timeline", async () => {
    await mount(); delayed = true; await click(button("Mark done")); await waitForApp(() => !!resolveRead);
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("committed"); });
    expect(readSignal?.aborted).toBe(true); await act(async () => resolveRead!());
    expect(main().textContent).not.toContain("Fresh action"); expect(main().textContent).not.toContain("Review the latest data before trying again."); expect(bodies).toHaveLength(1);
  });
  it.each(["network", "timeout", "server"])("reconciles uncertain %s results by reading only, without claiming the write succeeded", async cause => {
    await mount(); post = () => cause === "network" ? Promise.reject(new TypeError("offline")) : apiError(cause === "timeout" ? 408 : 503, "UNAVAILABLE", true);
    await click(button("Mark done")); await waitForApp(() => main().textContent!.includes("Fresh action"));
    expect(bodies).toHaveLength(1); expect(main().textContent).toContain("The status update could not be confirmed.");
  });
  it("retains the unknown-result warning after a failed reconciliation and GET-only recovery", async () => {
    await mount(); post = () => Promise.reject(new TypeError("offline")); readFailure = 503;
    await click(button("Mark done")); await waitForApp(() => !!button("Try timeline again"));
    readFailure = undefined; await click(button("Try timeline again")); await waitForApp(() => main().textContent!.includes("Fresh action"));
    expect(bodies).toHaveLength(1); expect(main().textContent).toContain("The status update could not be confirmed.");
  });
  it("clears stale data after a confirmed write whose readback fails, without reposting on recovery", async () => {
    await mount(); post = body => Response.json({ ...row(true), status: body.status }); readFailure = 503;
    await click(button("Mark done")); await waitForApp(() => !!button("Try timeline again"));
    expect(main().textContent).not.toContain("Stale action"); readFailure = undefined;
    await click(button("Try timeline again")); await waitForApp(() => main().textContent!.includes("Fresh action")); expect(bodies).toHaveLength(1);
  });
  it.each(["projectId", "id", "status", "updatedAt"])("does not trust an invalid status receipt %s", async field => {
    await mount(); post = body => Response.json({ ...row(true), status: body.status, [field]: field === "status" ? "archived" : field === "updatedAt" ? oldVersion : "wrong" });
    await click(button("Mark done")); await waitForApp(() => main().textContent!.includes("Fresh action"));
    expect(main().textContent).toContain("The status update could not be confirmed."); expect(bodies).toHaveLength(1);
  });
  it("does not treat a known validation rejection as an uncertain successful write", async () => {
    await mount(); post = () => apiError(400, "PROJECT_TIMELINE_INVALID", false); await click(button("Mark done"));
    expect(reads).toBe(1); expect(main().textContent).toContain("Stale action"); expect(button("Mark done").disabled).toBe(false);
    expect(main().textContent).toContain("Unable to update the project timeline.");
  });
});
