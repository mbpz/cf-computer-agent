// @vitest-environment node
import { writeWorkspaceHistory, registerWorkspaceLeaveGuard } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, forceRemountAppAt, type MountedApp } from "../helpers/authenticated-app-harness";
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
  function captured(node: HTMLElement, name = "onClick") { const key = Object.keys(node).find(k => k.startsWith("__reactProps$"))!; return (node as any)[key][name]; }
  const confirm = () => main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
  const keep = () => main().querySelector<HTMLButtonElement>("[data-cancel-action]")!;
  const unload = () => { const event = new app!.browser.Event("beforeunload", { cancelable: true }); app!.browser.dispatchEvent(event); return event.defaultPrevented; };
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
  it("allows clean cancel and reverted input navigation without prompting", async () => {
    await mount(); await click(button("Edit timeline item")); expect(unload()).toBe(false);
    await click(button("Cancel editing")); expect(confirm()).toBeNull(); expect(field("Edit title")).toBeNull();
    await click(button("Edit timeline item")); await fill("Edit body", "changed"); await fill("Edit body", "private notes");
    expect(unload()).toBe(false);
    await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("committed")); expect(writes).toHaveLength(0);
  });
  it("uses Escape to request discard and modal Escape to keep the draft", async () => {
    await mount(); await click(button("Edit timeline item")); await fill("Edit body", "private draft");
    await act(async () => { field("Edit body").dispatchEvent(new app!.browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(confirm()).toBeTruthy(); expect(document.activeElement).toBe(keep());
    await act(async () => { keep().dispatchEvent(new app!.browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(confirm()).toBeNull(); expect(field("Edit body").value).toBe("private draft"); expect(writes).toHaveLength(0);
  });
  it("locks captured changes, save and navigation during a local discard decision", async () => {
    await mount(); await click(button("Edit timeline item")); await fill("Edit body", "private draft");
    const save = captured(button("Save timeline item")), change = captured(field("Edit body"), "onChange");
    await click(button("Cancel editing"));
    await act(async () => { save(); change({ currentTarget: { value: "too late" } }); expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    expect(writes).toHaveLength(0); await click(keep()); expect(field("Edit body").value).toBe("private draft");
  });
  it("invalidates captured discard and save after forced teardown", async () => {
    await mount(); await click(button("Edit timeline item")); await fill("Edit body", "private draft");
    const save = captured(button("Save timeline item")); await click(button("Cancel editing")); const approve = captured(confirm());
    await forceRemountAppAt(app!, "/settings");
    await act(async () => { approve(); save(); }); expect(window.location.pathname).toBe("/settings"); expect(writes).toHaveLength(0); expect(unload()).toBe(false);
  });
  it.each([
    ["Edit title", "Private new title"], ["Edit body", "Private new body"], ["Edit kind", "decision"],
    ["Edit start time", "2026-10-03T09:00"], ["Edit due time", "2026-10-04T10:00"],
  ])("protects dirty %s on cancel and retains it when keeping editing", async (label, value) => {
    await mount(); await click(button("Edit timeline item")); await fill(label, value);
    expect(unload()).toBe(true); await click(button("Cancel editing"));
    expect(main().querySelector('[role="alertdialog"]')).toBeTruthy(); expect(document.activeElement).toBe(keep());
    await click(keep()); expect(field(label).value).toBe(value); expect(writes).toHaveLength(0);
    await click(button("Cancel editing")); const approve = captured(confirm());
    await act(async () => { approve(); approve(); });
    expect(field("Edit title")).toBeNull(); expect(unload()).toBe(false); expect(writes).toHaveLength(0);
    expect(document.activeElement).toBe(button("Edit timeline item"));
  });
  it("defers dirty navigation, cancels without losing input, then discards only on admitted commit", async () => {
    await mount(); await click(button("Edit timeline item")); await fill("Edit body", "private draft");
    await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"));
    expect(window.location.pathname).toBe("/projects/project/timeline"); await click(keep());
    expect(field("Edit body").value).toBe("private draft"); expect(writes).toHaveLength(0);
    await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"));
    await click(confirm()); expect(window.location.pathname).toBe("/settings"); expect(field("Edit body")).toBeNull();
  });
  it("does not erase a draft when another guard rejects final admission", async () => {
    await mount(); await click(button("Edit timeline item")); await fill("Edit body", "private draft");
    let block = false; const unregister = registerWorkspaceLeaveGuard(() => ({ kind: block ? "block" : "allow" }));
    try {
      await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"));
      block = true; await click(confirm());
      expect(window.location.pathname).toBe("/projects/project/timeline"); expect(field("Edit body").value).toBe("private draft");
    } finally { unregister(); }
  });
  it("protects a same-event edit followed by navigation and rejects captured save during its prompt", async () => {
    await mount(); await click(button("Edit timeline item")); const save = captured(button("Save timeline item"));
    const change = captured(field("Edit title"), "onChange");
    await act(async () => { change({ currentTarget: { value: "fresh private title" } }); expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"); save(); });
    expect(writes).toHaveLength(0); await click(keep()); expect(field("Edit title").value).toBe("fresh private title");
  });
  it("saves freshest same-event input once and locks captured cancel/edit/navigation before rerender", async () => {
    await mount(); await click(button("Edit timeline item")); let resolve!: (r: Response) => void; patch = () => new Promise(done => { resolve = done; });
    const save = captured(button("Save timeline item")), cancel = captured(button("Cancel editing"));
    const change = captured(field("Edit title"), "onChange");
    await act(async () => { change({ currentTarget: { value: "fresh private title" } }); save(); save(); cancel(); change({ currentTarget: { value: "too late" } }); expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    expect(writes).toHaveLength(1); expect(writes[0].title).toBe("fresh private title"); expect(field("Edit title").value).toBe("fresh private title"); expect(unload()).toBe(true);
    saved = { ...saved, title: "fresh private title", updatedAt: newVersion };
    await act(async () => resolve(Response.json(saved))); await waitForApp(() => !button("Save timeline item")); expect(unload()).toBe(false);
  });
  it("revalidates same-event invalid input instead of submitting the older valid render", async () => {
    await mount(); await click(button("Edit timeline item")); const save = captured(button("Save timeline item"));
    const change = captured(field("Edit title"), "onChange");
    await act(async () => { change({ currentTarget: { value: " " } }); save(); });
    expect(writes).toHaveLength(0); expect(button("Save timeline item").disabled).toBe(true);
  });
  it("keeps the route locked after failed readback removes the editor, until explicit read recovery", async () => {
    await mount(); patch = body => { saved = { ...saved, ...body, updatedAt: newVersion }; readFailure = 503; return Response.json(saved); };
    await click(button("Edit timeline item")); await fill("Edit body", "private draft"); await click(button("Save timeline item"));
    await waitForApp(() => !!button("Try timeline again")); expect(field("Edit body")).toBeNull();
    await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked")); expect(unload()).toBe(true);
    readFailure = undefined; await click(main().querySelector<HTMLButtonElement>("[data-planning-write-recover]")!);
    await waitForApp(() => !!button("Edit timeline item") && !button("Edit timeline item").disabled);
    expect(writes).toHaveLength(1); expect(unload()).toBe(false);
    await act(async () => expect(writeWorkspaceHistory("push", "/settings")).toBe("committed"));
  });
  it("invalidates an old close confirmation after cancel and reopening", async () => {
    await mount(); await click(button("Edit timeline item")); await fill("Edit body", "one"); await click(button("Cancel editing"));
    const obsolete = captured(confirm()); await click(keep()); await fill("Edit body", "two");
    await click(button("Cancel editing")); await act(async () => obsolete()); expect(field("Edit body").value).toBe("two");
    expect(confirm()).toBeTruthy(); await click(keep()); expect(writes).toHaveLength(0);
  });
  it("prefills fields, edits all content, reads it back, and cancels without writing", async () => {
    await mount(); await click(button("Edit timeline item"));
    expect(document.activeElement).toBe(field("Edit title")); expect(field("Edit title").value).toBe("Stale action"); expect(field("Edit body").value).toBe("private notes");
    await fill("Edit title", " New decision "); await fill("Edit body", "new details"); await fill("Edit kind", "decision");
    await click(button("Save timeline item")); await waitForApp(() => main().textContent!.includes("New decision") && !button("Save timeline item"));
    expect(writes).toEqual([{ kind: "decision", title: "New decision", body: "new details", startsAt: null, dueAt: null, expectedUpdatedAt: oldVersion }]);
    expect(reads).toBe(2); await click(button("Edit timeline item")); expect(field("Edit body").value).toBe("new details");
    await fill("Edit title", "Discarded"); await click(button("Cancel editing")); await click(confirm()); expect(writes).toHaveLength(1); expect(main().textContent).not.toContain("Discarded"); expect(document.activeElement).toBe(button("Edit timeline item"));
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
    await click(button("Cancel editing")); await click(confirm()); await click(button("Edit timeline item")); expect(field("Edit title").value).toBe("Fresh action");
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
  it("blocks same-tick edit/status submissions and ignores late receipt after forced teardown", async () => {
    await mount(); let resolve!: (r: Response) => void; patch = () => new Promise(done => { resolve = done; });
    await click(button("Edit timeline item")); const save = button("Save timeline item"), status = button("Mark done");
    await act(async () => { save.click(); save.click(); status.click(); }); expect(writes).toHaveLength(1); expect(save.disabled).toBe(true);
    expect(field("Timeline title").disabled).toBe(true);
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    await forceRemountAppAt(app!, "/settings");
    await act(async () => resolve(Response.json({ ...saved, updatedAt: newVersion }))); expect(main().textContent).not.toContain("Stale action"); expect(reads).toBe(1);
  });
  it("keeps the recovery marker across forced remount, stores no draft, and recovers with GET only", async () => {
    await mount(); let resolve!: (r: Response) => void; patch = () => new Promise(done => { resolve = done; });
    await click(button("Edit timeline item")); await fill("Edit body", "SECRET EDIT DRAFT"); await click(button("Save timeline item"));
    const key = "memory-garden:planning-write:v1:contributor-route-auditor:TIMELINE:project";
    const raw = app!.browser.sessionStorage.getItem(key)!; expect(raw).toBeTruthy(); expect(raw).not.toContain("SECRET EDIT DRAFT");
    expect(JSON.parse(raw).record).toMatchObject({ id: "row", expectedUpdatedAt: oldVersion });
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    const navigate = async (path: string) => forceRemountAppAt(app!, path);
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
