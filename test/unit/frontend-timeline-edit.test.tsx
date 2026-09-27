// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const oldVersion = "2026-09-27T00:00:00.000Z", newVersion = "2026-09-27T00:00:00.001Z";
const row = (fresh = false) => ({ id: "row", projectId: "project", clientKey: "row", kind: "action_item", title: fresh ? "Fresh action" : "Stale action", body: "private notes", status: "open", startsAt: null, dueAt: null, createdAt: oldVersion, updatedAt: fresh ? newVersion : oldVersion });
describe("timeline content editing through real App", () => {
  let app: MountedApp | undefined;
  let saved = row(); let writes: Record<string, unknown>[]; let reads: number;
  let patch: (body: Record<string, unknown>) => Response | Promise<Response>;
  let readFailure: number | undefined;
  const main = () => app!.container.querySelector("main")!;
  const button = (text: string) => [...main().querySelectorAll("button")].find(node => node.textContent === text)!;
  const field = (label: string) => main().querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); }); }
  async function fill(label: string, value: string) { const n = field(label); expect(n).toBeTruthy(); if (n.tagName === "SELECT") { await act(async () => { n.value = value; n.dispatchEvent(new app!.browser.Event("change", { bubbles: true })); }); return; } const key = Object.keys(n).find(k => k.startsWith("__reactProps$"))!; await act(async () => (n as any)[key].onChange({ currentTarget: { value } })); }
  async function mount() {
    saved = row(); writes = []; reads = 0; readFailure = undefined;
    patch = body => { saved = { ...saved, ...body, title: String(body.title).trim(), updatedAt: newVersion }; return Response.json(saved); };
    app = await mountAuthenticatedApp({ url: "https://app.test/projects/project/timeline", role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (init?.method === "PATCH" || init?.method === "POST") { const body = JSON.parse(String(init.body)); writes.push(body); return patch(body); }
      if (url.pathname.endsWith("/timeline")) { reads++; if (readFailure) return apiError(readFailure, "READ_FAILED", true); return Response.json({ items: [saved], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }); }
      if (url.pathname.endsWith("/timeline/row")) return Response.json(saved);
      return Response.json({ id: "project", clientKey: "project", title: "Private project", status: "active", progress: 0, createdAt: oldVersion, updatedAt: oldVersion });
    } });
    await waitForApp(() => !!button("Mark done"));
  }
  afterEach(async () => { await app?.unmount(); app = undefined; });
  it("prefills fields, edits all content, reads it back, and cancels without writing", async () => {
    await mount(); await click(button("Edit timeline item"));
    expect(document.activeElement).toBe(field("Edit title")); expect(field("Edit title").value).toBe("Stale action"); expect(field("Edit body").value).toBe("private notes");
    await fill("Edit title", " New decision "); await fill("Edit body", "new details"); await fill("Edit kind", "decision");
    await click(button("Save timeline item")); await waitForApp(() => main().textContent!.includes("New decision") && !button("Save timeline item"));
    expect(writes).toEqual([{ kind: "decision", title: "New decision", body: "new details", startsAt: null, dueAt: null, expectedUpdatedAt: oldVersion }]);
    expect(reads).toBe(2); await click(button("Edit timeline item")); expect(field("Edit body").value).toBe("new details");
    await fill("Edit title", "Discarded"); await click(button("Cancel editing")); expect(writes).toHaveLength(1); expect(main().textContent).not.toContain("Discarded"); expect(document.activeElement).toBe(button("Edit timeline item"));
  });
  it("validates empty titles and inverted local dates before writing", async () => {
    await mount(); await click(button("Edit timeline item")); await fill("Edit title", " "); expect(button("Save timeline item").disabled).toBe(true);
    await fill("Edit title", "Valid"); await fill("Edit start time", "2026-10-02T12:00"); await fill("Edit due time", "2026-10-01T12:00");
    expect(button("Save timeline item").disabled).toBe(true); expect(writes).toHaveLength(0);
    await fill("Edit due time", "2026-10-02T13:00"); await click(button("Save timeline item"));
    expect(writes[0]).toMatchObject({ startsAt: new Date("2026-10-02T12:00").toISOString(), dueAt: new Date("2026-10-02T13:00").toISOString() });
  });
  it("does not replay conflicts or silently rebase the draft onto a new version", async () => {
    await mount(); patch = () => { saved = row(true); return apiError(409, "PROJECT_TIMELINE_VERSION_CONFLICT", false); };
    await click(button("Edit timeline item")); await fill("Edit title", "My draft"); await click(button("Save timeline item"));
    await waitForApp(() => main().textContent!.includes("Fresh action"));
    expect(field("Edit title").value).toBe("My draft"); expect(button("Save timeline item").disabled).toBe(true); expect(writes).toHaveLength(1);
    await click(button("Cancel editing")); await click(button("Edit timeline item")); expect(field("Edit title").value).toBe("Fresh action");
  });
  it.each(["network", "invalid-receipt"])("keeps %s writes uncertain and never auto retries", async cause => {
    await mount(); patch = () => cause === "network" ? Promise.reject(new TypeError("offline")) : Response.json({ ...saved, projectId: "foreign" });
    await click(button("Edit timeline item")); await fill("Edit title", "My draft"); await click(button("Save timeline item"));
    await waitForApp(() => reads === 2); expect(writes).toHaveLength(1); expect(main().textContent).toContain("The edit could not be confirmed.");
    expect(field("Edit title").value).toBe("My draft");
  });
  it.each([401, 403, 404, 503])("clears private fields when readback fails %s and retries GET only", async status => {
    await mount(); patch = () => { readFailure = status; return apiError(409, "PROJECT_TIMELINE_VERSION_CONFLICT", false); };
    await click(button("Edit timeline item")); await fill("Edit body", "private draft"); await click(button("Save timeline item")); await waitForApp(() => !!button("Try timeline again"));
    expect(field("Edit body")).toBeNull(); expect(main().textContent).not.toContain("Stale action");
    readFailure = undefined; await click(button("Try timeline again")); await waitForApp(() => !!button("Edit timeline item")); expect(writes).toHaveLength(1);
  });
  it("blocks same-tick edit/status submissions and ignores late receipt after navigation", async () => {
    await mount(); let resolve!: (r: Response) => void; patch = () => new Promise(done => { resolve = done; });
    await click(button("Edit timeline item")); const save = button("Save timeline item"), status = button("Mark done");
    await act(async () => { save.click(); save.click(); status.click(); }); expect(writes).toHaveLength(1); expect(save.disabled).toBe(true);
    expect(field("Timeline title").disabled).toBe(true);
    await act(async () => { window.history.pushState({}, "", "/settings"); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); });
    await act(async () => resolve(Response.json({ ...saved, updatedAt: newVersion }))); expect(main().textContent).not.toContain("Stale action"); expect(reads).toBe(1);
  });
  it("keeps the recovery marker across leaving and returning, stores no draft, and recovers with GET only", async () => {
    await mount(); let resolve!: (r: Response) => void; patch = () => new Promise(done => { resolve = done; });
    await click(button("Edit timeline item")); await fill("Edit body", "SECRET EDIT DRAFT"); await click(button("Save timeline item"));
    const key = "memory-garden:planning-write:v1:contributor-route-auditor:TIMELINE:project";
    const raw = app!.browser.sessionStorage.getItem(key)!; expect(raw).toBeTruthy(); expect(raw).not.toContain("SECRET EDIT DRAFT");
    expect(JSON.parse(raw).record).toMatchObject({ id: "row", expectedUpdatedAt: oldVersion });
    const navigate = async (path: string) => { await act(async () => { window.history.pushState({}, "", path); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); }); };
    await navigate("/settings"); await navigate("/projects/project/timeline"); await waitForApp(() => !!button("Edit timeline item"));
    expect(button("Edit timeline item").disabled).toBe(true);
    await act(async () => resolve(Response.json({ ...saved, updatedAt: newVersion })));
    expect(app!.browser.sessionStorage.getItem(key)).toBe(raw); expect(writes).toHaveLength(1);
    await click(main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!);
    await waitForApp(() => !button("Edit timeline item").disabled); expect(writes).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(key)).toBeNull();
  });
  it("does not accept readback older than the confirmed edit receipt", async () => {
    await mount(); patch = body => Response.json({ ...saved, ...body, updatedAt: newVersion });
    await click(button("Edit timeline item")); await fill("Edit title", "Updated"); await click(button("Save timeline item"));
    await waitForApp(() => reads === 2); expect(main().textContent).toContain("Unable to load"); expect(button("Save timeline item")).toBeUndefined(); expect(writes).toHaveLength(1);
  });
  it("keeps validation rejection editable without a readback or false success", async () => {
    await mount(); patch = () => apiError(400, "PROJECT_TIMELINE_INVALID", false);
    await click(button("Edit timeline item")); await fill("Edit title", "My draft"); await click(button("Save timeline item"));
    await waitForApp(() => !button("Save timeline item").disabled); expect(reads).toBe(1); expect(field("Edit title").value).toBe("My draft");
  });
});
