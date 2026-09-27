// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

for (const kind of ["goals", "projects"] as const) describe(`${kind} stable creation through real App`, () => {
  let app: MountedApp | undefined;
  let bodies: Record<string, unknown>[];
  let reads: number;
  let respond: (body: Record<string, unknown>) => Response | Promise<Response>;
  let readFailure = false;
  let readStatus = 503;
  const singular = kind === "goals" ? "goal" : "project";
  const entity = (body: Record<string, unknown>) => ({ ...body, status: "active", progress: 0, targetAt: null, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" });
  const receipt = (body: Record<string, unknown>) => Response.json({ [singular]: entity(body), created: true });
  const main = () => app!.container.querySelector("main")!;
  const title = () => main().querySelector("input") as HTMLInputElement;
  const button = (selector: string) => main().querySelector(selector) as HTMLButtonElement;
  const create = () => [...main().querySelectorAll("button")].find((node) => node.textContent === (kind === "goals" ? "Add goal" : "Add project"))!;
  async function change(value: string) {
    await act(async () => {
      const node = title(); node.value = value;
      const key = Object.keys(node).find((key) => key.startsWith("__reactProps$"))!;
      (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement }) => void }>)[key]!.onChange({ currentTarget: node });
    });
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise((done) => setTimeout(done, 0)); }); }
  async function mount() {
    bodies = []; reads = 0; readFailure = false; readStatus = 503; respond = receipt;
    app = await mountAuthenticatedApp({ url: `https://app.test/${kind}`, role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); bodies.push(body); return respond(body); }
      if (url.pathname.endsWith("/summary")) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
      reads++;
      if (readFailure) return apiError(readStatus, "UNAVAILABLE", true);
      return Response.json({ items: [entity({ id: "existing", clientKey: "existing", title: "Existing private row", description: null })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    } });
    await waitForApp(() => !!title() && !title().disabled);
  }
  afterEach(async () => { await app?.unmount(); app = undefined; });


  async function leaveAndReturn() {
    await act(async () => { app!.browser.history.pushState(null, "", "/not-a-route"); app!.browser.dispatchEvent(new app!.browser.PopStateEvent("popstate")); });
    await act(async () => { app!.browser.history.pushState(null, "", `/${kind}`); app!.browser.dispatchEvent(new app!.browser.PopStateEvent("popstate")); });
    await waitForApp(() => !!title());
  }
  it("restores an uncertain creation on route return without automatically writing", async () => {
    await mount(); respond = () => apiError(503, "UNAVAILABLE", true);
    await change("Durable original"); await click(create()); const original = bodies[0];
    await leaveAndReturn();
    expect(title().value).toBe("Durable original"); expect(title().disabled).toBe(true);
    expect(button("[data-create-retry]")).toBeTruthy(); expect(bodies).toHaveLength(1);
    respond = receipt; await click(button("[data-create-retry]"));
    await waitForApp(() => title().value === ""); expect(bodies).toEqual([original, original]);
  });
  it("restores acknowledged creation as read-only after failed readback", async () => {
    await mount(); readFailure = true;
    await change("Already created"); await click(create());
    expect(button("[data-create-read-retry]")).toBeTruthy();
    readFailure = false; await leaveAndReturn();
    expect(button("[data-create-read-retry]")).toBeTruthy(); expect(button("[data-create-retry]")).toBeNull();
    await click(button("[data-create-read-retry]"));
    await waitForApp(() => title().value === ""); expect(bodies).toHaveLength(1);
  });
  it("blocks writes when durable storage rejects the intent", async () => {
    await mount(); vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await change("Cannot persist"); await click(create());
    expect(bodies).toHaveLength(0); expect(title().disabled).toBe(true); expect(button("[data-create-storage-retry]")).toBeTruthy();
  });

  it("keeps a pending intent through route exit and ignores its late acknowledgement", async () => {
    await mount(); let release!: (response: Response) => void;
    respond = () => new Promise(resolve => { release = resolve; });
    await change("Pending across route exit"); await click(create()); const original = bodies[0]!;
    await leaveAndReturn(); expect(button("[data-create-retry]")).toBeTruthy();
    await act(async () => release(receipt(original)));
    expect(button("[data-create-retry]")).toBeTruthy(); expect(bodies).toHaveLength(1);
    respond = receipt; await click(button("[data-create-retry]"));
    await waitForApp(() => title().value === ""); expect(bodies).toEqual([original, original]);
  });
  it("can recover temporary storage failure without sending a request until explicit submission", async () => {
    await mount(); const save = vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await change("Preserve fields"); await click(create()); expect(bodies).toHaveLength(0);
    save.mockRestore(); await click(button("[data-create-storage-retry]"));
    expect(title().value).toBe("Preserve fields"); expect(title().disabled).toBe(false); expect(bodies).toHaveLength(0);
    await click(create()); await waitForApp(() => title().value === ""); expect(bodies).toHaveLength(1);
  });
  it("blocks after acknowledgement persistence failure and keeps the same original key for recovery", async () => {
    await mount(); const storage = app!.browser.sessionStorage;
    const set = storage.setItem.bind(storage);
    const save = vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key.includes("planning-create") && JSON.parse(value).acknowledged) throw new Error("ack write unavailable");
      set(key, value);
    });
    await change("Ack cannot persist"); await click(create()); const original = bodies[0];
    expect(button("[data-create-storage-retry]")).toBeTruthy(); expect(reads).toBe(1);
    save.mockRestore(); await click(button("[data-create-storage-retry]"));
    expect(button("[data-create-retry]")).toBeTruthy(); expect(bodies).toHaveLength(1);
    await click(button("[data-create-retry]")); await waitForApp(() => title().value === ""); expect(bodies).toEqual([original, original]);
  });

  it("keeps fields and retries exactly the original payload after an unknown result", async () => {
    await mount(); respond = () => apiError(503, "UNAVAILABLE", true);
    await change("Original title"); await click(create());
    expect(title().value).toBe("Original title"); expect(title().disabled).toBe(true);
    expect(bodies).toHaveLength(1); expect(reads).toBe(1);
    expect(button("[data-create-retry]")).toBeTruthy();
    respond = receipt; await click(button("[data-create-retry]"));
    await waitForApp(() => title().value === "" && !title().disabled);
    expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); expect(reads).toBe(2);
    await change("Next title"); await click(create());
    expect(bodies[2]!.clientKey).not.toBe(bodies[0]!.clientKey);
  });
  it("deduplicates same-tick submit and locks the original draft while pending", async () => {
    await mount(); let resolve!: (response: Response) => void;
    respond = () => new Promise((done) => { resolve = done; });
    await change("Double click"); const submit = create();
    await act(async () => { submit.click(); submit.click(); });
    expect(bodies).toHaveLength(1); expect(title().disabled).toBe(true); expect(title().value).toBe("Double click");
    await act(async () => resolve(receipt(bodies[0]!)));
    await waitForApp(() => title().value === "");
  });
  it("only reads after a confirmed write when list readback fails", async () => {
    await mount(); readFailure = true; await change("Saved"); await click(create());
    await waitForApp(() => reads === 2);
    expect(button("[data-create-read-retry]")).toBeTruthy(); expect(title().disabled).toBe(true);
    readFailure = false; await click(button("[data-create-read-retry]"));
    await waitForApp(() => !title().disabled);
    expect(reads).toBe(3); expect(bodies).toHaveLength(1); expect(title().value).toBe("");
  });
  it.each([400, 409, 429])("preserves an editable draft after a first known rejection %s", async (status) => {
    await mount(); respond = () => apiError(status, "REJECTED", false);
    await change("Correct me"); await click(create());
    expect(title().value).toBe("Correct me"); expect(title().disabled).toBe(false);
    expect(button("[data-create-retry]")).toBeNull();
    respond = receipt; await change("Corrected"); await click(create());
    expect(bodies[1]!.clientKey).not.toBe(bodies[0]!.clientKey);
  });
  it("keeps the unresolved original intent after a retry gets a known rejection", async () => {
    await mount(); respond = () => apiError(503, "UNAVAILABLE", true);
    await change("Keep original"); await click(create());
    respond = () => apiError(409, "CONFLICT", false); await click(button("[data-create-retry]"));
    expect(title().disabled).toBe(true); expect(bodies[1]).toEqual(bodies[0]);
    expect(button("[data-create-retry]")).toBeTruthy();
  });
  it.each([401, 403])("clears protected rows and draft after creation denial %s", async (status) => {
    await mount(); respond = () => apiError(status, "DENIED", false);
    await change("Private draft"); await click(create());
    expect(main().textContent).not.toContain("Existing private row"); expect(title()).toBeNull();
    expect(main().textContent).not.toContain("Private draft");
    expect(app!.browser.sessionStorage.getItem(`memory-garden:planning-create:v1:contributor-route-auditor:${kind.toUpperCase()}`)).toBeNull();
  });
  it.each(["wrong-id", "wrong-key", "missing-created", "empty-response"])('does not acknowledge malformed receipt %s', async (mode) => {
    await mount(); respond = (body) => mode === "empty-response" ? new Response(null, { status: 204 }) : Response.json({ [singular]: entity({ ...body, ...(mode === "wrong-id" ? { id: "other" } : mode === "wrong-key" ? { clientKey: "other" } : {}) }), ...(mode === "missing-created" ? {} : { created: true }) });
    await change("Unconfirmed"); await click(create());
    expect(button("[data-create-retry]")).toBeTruthy(); expect(title().value).toBe("Unconfirmed"); expect(title().disabled).toBe(true); expect(reads).toBe(1);
  });
  it.each([408, 404])("does not reset an uncertain or retryable rejection %s", async (status) => {
    await mount(); respond = () => apiError(status, "UNCONFIRMED", true);
    await change("Keep intent"); await click(create());
    expect(button("[data-create-retry]")).toBeTruthy(); expect(title().disabled).toBe(true);
  });
  it("keeps the same intent on a network error and deduplicates retries", async () => {
    await mount(); respond = () => { throw new TypeError("network disconnected"); };
    await change("Network retry"); await click(create());
    let resolve!: (value: Response) => void; respond = () => new Promise((done) => { resolve = done; });
    const retry = button("[data-create-retry]");
    await act(async () => { retry.click(); retry.click(); });
    expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
    await act(async () => resolve(receipt(bodies[1]!)));
    await waitForApp(() => title().value === "");
  });
  it("warns on browser unload while a write is unresolved", async () => {
    await mount(); respond = () => apiError(503, "UNAVAILABLE", true);
    await change("Unresolved"); await click(create());
    const event = new app!.browser.Event("beforeunload", { cancelable: true });
    app!.browser.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    respond = receipt; await click(button("[data-create-retry]"));
    const complete = new app!.browser.Event("beforeunload", { cancelable: true });
    app!.browser.dispatchEvent(complete); expect(complete.defaultPrevented).toBe(false);
  });
  it("never starts readback for a late creation receipt after route exit", async () => {
    await mount(); let resolve!: (value: Response) => void;
    respond = () => new Promise((done) => { resolve = done; });
    await change("Leave pending"); await click(create());
    await act(async () => { app!.browser.history.pushState(null, "", "/goals-other"); app!.browser.dispatchEvent(new app!.browser.PopStateEvent("popstate")); });
    const readsBefore = reads;
    await act(async () => { resolve(receipt(bodies[0]!)); await new Promise((done) => setTimeout(done, 0)); });
    expect(reads).toBe(readsBefore); expect(bodies).toHaveLength(1);
    expect(main().textContent).not.toContain("Leave pending");
  });
  it.each([401, 403])("clears rows and draft when successful write readback is denied %s", async (status) => {
    await mount(); readFailure = true; readStatus = status;
    await change("Saved before denial"); await click(create());
    await waitForApp(() => title() === null);
    expect(main().textContent).not.toContain("Existing private row");
    expect(button("[data-create-read-retry]")).toBeNull(); expect(bodies).toHaveLength(1);
    expect(app!.browser.sessionStorage.getItem(`memory-garden:planning-create:v1:contributor-route-auditor:${kind.toUpperCase()}`)).toBeNull();
  });
  it("matches the server's Unicode title limit without blocking long valid descriptions", async () => {
    await mount(); await change("🌱".repeat(201)); await click(create()); expect(bodies).toHaveLength(0);
    await change("🌱".repeat(200));
    const node = main().querySelector("textarea")!; const key = Object.keys(node).find((key) => key.startsWith("__reactProps$"))!;
    await act(async () => {
      node.value = "a".repeat(10_001);
      (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLTextAreaElement }) => void }>)[key]!.onChange({ currentTarget: node });
    });
    await click(create()); expect(bodies).toHaveLength(1); expect([...String(bodies[0]!.title)]).toHaveLength(200);
  });

  it("does not race creation against a same-tick status write or strand the page busy", async () => {
    await mount(); await change("Wait for status");
    let resolve!: (value: Response) => void;
    respond = () => new Promise((done) => { resolve = done; });
    const complete = [...main().querySelectorAll("button")].find((node) => node.textContent === "Complete")!;
    const submit = create();
    await act(async () => { complete.click(); submit.click(); });
    expect(bodies).toHaveLength(1); expect(bodies[0]).toEqual({ status: "completed", expectedUpdatedAt: "2026-09-26T00:00:00.000Z" });
    await act(async () => resolve(Response.json({ ...entity({ id: "existing", clientKey: "existing", title: "Existing private row" }), status: "completed", updatedAt: "2026-09-26T00:00:00.001Z" })));
    await waitForApp(() => !title().disabled);
    expect(title().value).toBe("Wait for status");
  });

});
