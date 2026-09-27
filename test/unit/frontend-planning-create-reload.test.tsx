// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
for (const module of ["goals", "projects"] as const) describe(`${module} creation across fresh App/browser realms`, () => {
  let app: MountedApp | undefined;
  const key = `memory-garden:planning-create:v1:alice:${module.toUpperCase()}`;
  const original = { id: "original-id", clientKey: "original-key", title: "Original private title", description: "Original private description" };
  const envelope = (acknowledged = false) => JSON.stringify({ version: 1, memberId: "alice", module: module.toUpperCase(), intent: original, acknowledged });
  let writes: unknown[] = [], listDenied = false;
  const main = () => app!.container.querySelector("main")!;
  const title = () => main().querySelector("input") as HTMLInputElement;
  const button = (selector: string) => main().querySelector(selector) as HTMLButtonElement;
  const entity = (body: object) => ({ ...body, status: "active", progress: 0, targetAt: null, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" });
  async function mount(raw: string | null, memberId = "alice") {
    app = await mountApp({ url: `https://app.test/${module}`, configureBrowser(browser) { if (raw !== null) browser.sessionStorage.setItem(key, raw); }, fetch: async (input, init) => {
      const path = new URL(String(input), "https://app.test").pathname;
      if (path === "/api/session") return Response.json({ member: { id: memberId, email: `${memberId}@app.test`, role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); writes.push(body);
        return Response.json({ [module === "goals" ? "goal" : "project"]: entity(body), created: false });
      }
      if (listDenied) return apiError(403, "DENIED", false);
      if (path.endsWith("/summary")) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
      return Response.json({ items: [entity({ id: "existing", clientKey: "existing", title: "Existing", description: null })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    } });
    await waitForApp(() => !!title());
  }
  afterEach(async () => { await app?.unmount(); app = undefined; writes = []; listDenied = false; });
  it("restores the exact unknown intent across two fresh browser realms, never auto-posting", async () => {
    await mount(envelope()); expect(title().value).toBe(original.title); expect(title().disabled).toBe(true); expect(writes).toEqual([]);
    const raw = app!.browser.sessionStorage.getItem(key); await app!.unmount(); app = undefined;
    await mount(raw); expect(writes).toEqual([]); expect(button("[data-create-retry]")).toBeTruthy();
    await act(async () => button("[data-create-retry]").click());
    await waitForApp(() => title().value === ""); expect(writes).toEqual([original]); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it("restores an acknowledged intent only as readback and clears it without any POST", async () => {
    await mount(envelope(true)); expect(button("[data-create-retry]")).toBeNull();
    await act(async () => button("[data-create-read-retry]").click());
    await waitForApp(() => title().value === ""); expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it("does not render, replay or clear another member's stored intent", async () => {
    await mount(envelope(), "bob"); expect(title().value).toBe(""); expect(main().textContent).not.toContain(original.title); expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBe(envelope());
  });
  it("blocks corrupted storage without rendering payloads, writing or silently discarding", async () => {
    const raw = JSON.stringify({ private: "Never render this corrupt payload" }); await mount(raw);
    expect(title().disabled).toBe(true); expect(main().textContent).not.toContain("Never render");
    await act(async () => button("[data-create-storage-retry]").click()); expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBe(raw);
  });
  it("does not create again when acknowledgement cleanup fails", async () => {
    await mount(envelope(true)); const remove = vi.spyOn(app!.browser.sessionStorage, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    await act(async () => button("[data-create-read-retry]").click()); await waitForApp(() => !!button("[data-create-storage-retry]"));
    expect(writes).toEqual([]); expect(app!.browser.sessionStorage.getItem(key)).toBe(envelope(true));
    remove.mockRestore(); await act(async () => button("[data-create-storage-retry]").click());
    expect(button("[data-create-retry]")).toBeNull(); await act(async () => button("[data-create-read-retry]").click()); await waitForApp(() => title().value === ""); expect(writes).toEqual([]);
  });
});
