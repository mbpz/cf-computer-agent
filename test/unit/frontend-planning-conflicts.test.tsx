// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
for (const kind of ["goals", "projects"] as const) describe(`${kind} conflict recovery through App`, () => {
  let app: MountedApp | undefined;
  let bodies: Record<string, unknown>[]; let reads: number; let failRead: number | undefined;
  let delay: boolean; let resolveRead: (() => void) | undefined;
  const oldVersion = "2026-09-27T00:00:00.000Z";
  const newVersion = "2026-09-27T00:00:00.001Z";
  const main = () => app!.container.querySelector("main")!;
  const complete = () => [...main().querySelectorAll("button")].find(node => node.textContent === "Complete")!;
  const row = (fresh: boolean) => ({ id: "row", clientKey: "row", title: fresh ? "Fresh private row" : "Stale private row", description: null, status: "active", progress: 10, targetAt: null, createdAt: oldVersion, updatedAt: fresh ? newVersion : oldVersion });
  async function mount() {
    bodies = []; reads = 0; failRead = undefined; delay = false; resolveRead = undefined;
    app = await mountAuthenticatedApp({ url: `https://app.test/${kind}`, role: "contributor", permissionMask: "0x100000", configureBrowser(browser) { vi.stubGlobal("HTMLElement", browser.HTMLElement); }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (init?.method === "POST") { bodies.push(JSON.parse(String(init.body))); return apiError(409, kind === "goals" ? "GOAL_VERSION_CONFLICT" : "PROJECT_VERSION_CONFLICT", false); }
      if (url.pathname.endsWith("/summary")) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
      reads++;
      if (reads > 1 && failRead) return apiError(failRead, "UNAVAILABLE", true);
      const response = () => Response.json({ items: [row(reads > 1)], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      if (reads > 1 && delay) return new Promise<Response>(resolve => { resolveRead = () => resolve(response()); });
      return response();
    } });
    await waitForApp(() => !!complete());
  }
  async function click(node: HTMLButtonElement) { await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function submitStatus() {
    const count = bodies.length;
    await click(complete()); expect(bodies).toHaveLength(count);
    const confirm = main().querySelector<HTMLButtonElement>("[data-confirm-action]"); expect(confirm).not.toBeNull();
    await click(confirm!);
  }
  afterEach(async () => { await app?.unmount(); app = undefined; });
  it("sends the displayed version and reloads conflict data without automatically replaying the write", async () => {
    await mount(); await submitStatus();
    await waitForApp(() => main().textContent!.includes("Fresh private row"));
    expect(bodies).toEqual([{ status: "completed", expectedUpdatedAt: oldVersion }]);
    expect(main().textContent).not.toContain("Stale private row");
    expect(main().textContent).toContain("Review the latest data before trying again.");
    await submitStatus();
    expect(bodies[1]).toEqual({ status: "completed", expectedUpdatedAt: newVersion });
  });
  it.each([401, 403, 503])("clears stale rows if conflict readback fails (%s), and retries GET only", async status => {
    await mount(); failRead = status; await submitStatus();
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().querySelectorAll("h2")).toHaveLength(0); expect(bodies).toHaveLength(1);
    failRead = undefined;
    const retry = [...main().querySelectorAll("button")].find(node => node.textContent === `Try ${kind} again`)!;
    await click(retry); await waitForApp(() => main().textContent!.includes("Fresh private row"));
    expect(bodies).toHaveLength(1);
  });
  it("locks duplicate writes while conflict reconciliation is pending", async () => {
    await mount(); delay = true; await submitStatus();
    await waitForApp(() => !!resolveRead);
    expect(complete().disabled).toBe(true); await click(complete()); expect(bodies).toHaveLength(1);
    await act(async () => resolveRead!());
    await waitForApp(() => main().textContent!.includes("Fresh private row"));
    expect(complete().disabled).toBe(false);
  });
  it("ignores a conflict readback after leaving the route", async () => {
    await mount(); delay = true; await submitStatus();
    await waitForApp(() => !!resolveRead);
    await act(async () => { window.history.pushState({}, "", "/settings"); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); });
    await act(async () => resolveRead!());
    expect(main().textContent).not.toContain("Fresh private row");
    expect(main().textContent).not.toContain("Review the latest data before trying again.");
    expect(bodies).toHaveLength(1);
  });
  if (kind === "goals") it("sends the displayed version for a progress edit and reconciles its conflict", async () => {
    await mount();
    const node = main().querySelector('input[type="range"]')!;
    const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { (node as unknown as Record<string, { onChange: (event: unknown) => void }>)[key].onChange({ currentTarget: { value: "75" } }); });
    await waitForApp(() => main().textContent!.includes("Fresh private row"));
    expect(bodies).toEqual([{ progress: 75, expectedUpdatedAt: oldVersion }]);
  });

});
