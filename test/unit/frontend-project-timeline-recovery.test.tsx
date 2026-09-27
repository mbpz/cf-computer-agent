// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const stamp = "2026-09-27T00:00:00.000Z";
const project = (id: string) => ({ id, clientKey: id, title: `Project ${id}`, description: null, status: "active", progress: 0, targetAt: null, createdAt: stamp, updatedAt: stamp });
const item = (projectId: string, id = "first") => ({ id, projectId, clientKey: id, kind: "meeting", title: `${projectId} ${id}`, body: "private notes", status: "open", startsAt: null, dueAt: null, createdAt: stamp, updatedAt: stamp });
describe("parameterized project timeline through real App", () => {
  let app: MountedApp | undefined;
  let requests: { url: URL; init?: RequestInit }[];
  let override: ((url: URL, init?: RequestInit) => Promise<Response> | Response | undefined) | undefined;
  const main = () => app!.container.querySelector("main")!;
  const button = (text: string) => [...main().querySelectorAll("button")].find(node => node.textContent === text)!;
  const title = () => main().querySelector('input[aria-label="Timeline title"]') as HTMLInputElement;
  const writes = () => requests.filter(r => r.init?.method === "POST");
  async function mount() {
    requests = []; override = undefined;
    app = await mountAuthenticatedApp({ url: "https://app.test/projects/a/timeline", role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      requests.push({ url, init });
      const custom = override?.(url, init); if (custom) return custom;
      const id = url.pathname.split("/")[3];
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return url.pathname.endsWith("/status") ? Response.json({ ...item(id), status: body.status }) : Response.json({ item: { ...item(id), ...body }, created: true });
      }
      if (url.pathname.endsWith("/timeline")) return Response.json({ items: [item(id, url.searchParams.has("cursor") ? "second" : "first")], ...(url.searchParams.has("cursor") ? {} : { nextCursor: "next" }) });
      return Response.json(project(id));
    } });
    await waitForApp(() => !!title());
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function fill(text: string) {
    const node = title(); const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => (node as unknown as Record<string, { onChange: (event: unknown) => void }>)[key].onChange({ currentTarget: { value: text } }));
  }
  async function navigate(id: string) { await act(async () => { window.history.pushState({}, "", `/projects/${id}/timeline`); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); }); }
  afterEach(async () => { await app?.unmount(); app = undefined; });
  it("isolates project navigation, clears the draft and ignores late old-project reads", async () => {
    await mount(); await fill("Private A draft");
    let resolve!: (response: Response) => void;
    override = (url) => url.pathname === "/api/projects/a/timeline" ? new Promise<Response>(done => { resolve = done; }) : undefined;
    await click(button("Load more"));
    const pending = requests.findLast(r => r.url.pathname === "/api/projects/a/timeline")!;
    await navigate("b"); await waitForApp(() => main().textContent!.includes("b first"));
    expect(title().value).toBe(""); expect(pending.init?.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({ items: [item("a", "late")] })));
    expect(main().textContent).not.toContain("a late"); expect(main().textContent).not.toContain("Project a");
  });
  it.each([401, 403, 404])("clears private rows on denied continuation %s and retries only reads", async status => {
    await mount(); override = url => url.pathname.endsWith("/timeline") ? apiError(status, "DENIED", false) : undefined;
    await click(button("Load more")); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().textContent).not.toContain("a first"); expect(title()).toBeNull();
    override = undefined; await click(button("Try timeline again")); await waitForApp(() => !!title()); expect(writes()).toHaveLength(0);
  });
  it("retries an ordinary failed continuation with the same cursor and appends once", async () => {
    await mount(); override = url => url.searchParams.has("cursor") ? apiError(503, "UNAVAILABLE", true) : undefined;
    await click(button("Load more")); expect(main().textContent).toContain("a first");
    override = undefined; await click(button("Load more")); await waitForApp(() => main().textContent!.includes("a second"));
    expect(main().querySelectorAll("h2")).toHaveLength(2);
    expect(requests.filter(r => r.url.searchParams.has("cursor")).map(r => r.url.searchParams.get("cursor"))).toEqual(["next", "next"]);
  });
  it.each(["foreign-row", "duplicate", "cursor-loop", "foreign-project"])("rejects malformed project-bound readback: %s", async mode => {
    await mount(); override = url => {
      if (mode === "foreign-project" && url.pathname === "/api/projects/a") return Response.json(project("b"));
      if (!url.pathname.endsWith("/timeline")) return;
      if (mode === "foreign-row") return Response.json({ items: [item("b", "secret")] });
      if (mode === "duplicate") return Response.json({ items: [item("a", "second"), item("a", "second")] });
      return Response.json({ items: [item("a", "second")], nextCursor: "next" });
    };
    await click(button("Load more"));
    expect(main().textContent).toContain("Unable to update the project timeline");
    expect(main().textContent).not.toContain("b secret"); expect(main().textContent).not.toContain("a second");
    expect(main().textContent).not.toContain("Project b");
  });
  it("retains one immutable creation intent after an unknown write and only explicitly retries it", async () => {
    await mount(); await fill("Keep this draft");
    override = (_url, init) => init?.method === "POST" ? Promise.reject(new TypeError("offline")) : undefined;
    await click(button("Add to timeline")); await waitForApp(() => !!button("Retry original creation"));
    expect(title().value).toBe("Keep this draft"); expect(title().disabled).toBe(true);
    expect(button("Mark done").disabled).toBe(true); expect(button("Load more").disabled).toBe(true);
    const original = JSON.parse(String(writes()[0].init?.body));
    expect(original.id).toEqual(expect.any(String)); expect(original.clientKey).toEqual(expect.any(String));
    override = undefined; await click(button("Retry original creation")); await waitForApp(() => title().value === "");
    expect(writes()).toHaveLength(2); expect(JSON.parse(String(writes()[1].init?.body))).toEqual(original);
  });
  it("retains a confirmed creation on failed readback, and retry never POSTs again", async () => {
    await mount(); await fill("Confirmed draft"); let wrote = false;
    override = (url, init) => { if (init?.method === "POST") { wrote = true; return; } if (wrote && url.pathname.endsWith("/timeline")) return apiError(503, "UNAVAILABLE", true); };
    await click(button("Add to timeline")); await waitForApp(() => !!button("Retry list read"));
    expect(title().value).toBe("Confirmed draft"); override = undefined;
    await click(button("Retry list read")); await waitForApp(() => title().value === ""); expect(writes()).toHaveLength(1);
  });
  it("merges same-tick status clicks and blocks creation until the write and read finish", async () => {
    await mount(); await fill("Wait"); let resolve!: (response: Response) => void;
    override = (_url, init) => init?.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : undefined;
    const done = button("Mark done"), create = button("Add to timeline");
    await act(async () => { done.click(); done.click(); create.click(); });
    expect(writes()).toHaveLength(1); expect(title().value).toBe("Wait"); expect(title().disabled).toBe(true);
    await act(async () => resolve(Response.json({ ...item("a"), status: "done" })));
    await waitForApp(() => !title().disabled);
  });
  it("ignores a completed write after switching projects and never reloads the old project", async () => {
    await mount(); let resolve!: (response: Response) => void;
    override = (_url, init) => init?.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : undefined;
    await click(button("Mark done")); await navigate("b"); await waitForApp(() => main().textContent!.includes("b first"));
    const count = requests.length;
    await act(async () => resolve(Response.json({ ...item("a"), status: "done" })));
    expect(requests).toHaveLength(count); expect(main().textContent).toContain("Project b");
  });
  it.each(["projectId", "id", "clientKey"])("rejects a mismatched creation receipt %s as unknown rather than clearing the draft", async field => {
    await mount(); await fill("Do not lose");
    override = (_url, init) => init?.method === "POST" ? Response.json({ item: { ...item("a"), ...JSON.parse(String(init.body)), [field]: "wrong" }, created: true }) : undefined;
    await click(button("Add to timeline")); await waitForApp(() => !!button("Retry original creation"));
    expect(title().value).toBe("Do not lose"); expect(writes()).toHaveLength(1);
  });
  it.each([401, 403, 404])("clears private content on rejected creation %s", async status => {
    await mount(); await fill("Private draft");
    override = (_url, init) => init?.method === "POST" ? apiError(status, "DENIED", false) : undefined;
    await click(button("Add to timeline"));
    expect(title()).toBeNull(); expect(main().textContent).not.toContain("a first");
    expect(button("Try timeline again")).toBeTruthy(); expect(writes()).toHaveLength(1);
  });
  it.each([401, 403, 404])("clears private content on denied status mutation %s", async status => {
    await mount(); override = (_url, init) => init?.method === "POST" ? apiError(status, "DENIED", false) : undefined;
    await click(button("Mark done")); expect(title()).toBeNull(); expect(main().textContent).not.toContain("a first");
  });
  it("allows editing after a known rejection but creates a new intent only on a new submission", async () => {
    await mount(); await fill("Rejected draft");
    override = (_url, init) => init?.method === "POST" ? apiError(400, "INVALID", false) : undefined;
    await click(button("Add to timeline")); expect(title().disabled).toBe(false); expect(title().value).toBe("Rejected draft");
    const original = JSON.parse(String(writes()[0].init?.body));
    await fill("Corrected draft"); override = undefined; await click(button("Add to timeline"));
    await waitForApp(() => title().value === "");
    const next = JSON.parse(String(writes()[1].init?.body));
    expect(next.id).not.toBe(original.id); expect(next.clientKey).not.toBe(original.clientKey); expect(next.title).toBe("Corrected draft");
  });
  it("does not discard an unknown original intent when a retry returns a known rejection", async () => {
    await mount(); await fill("Unknown draft");
    override = (_url, init) => init?.method === "POST" ? Promise.reject(new TypeError("offline")) : undefined;
    await click(button("Add to timeline"));
    override = (_url, init) => init?.method === "POST" ? apiError(400, "INVALID", false) : undefined;
    await click(button("Retry original creation"));
    expect(title().value).toBe("Unknown draft"); expect(title().disabled).toBe(true);
    expect(button("Retry original creation")).toBeTruthy(); expect(writes()[1].init?.body).toBe(writes()[0].init?.body);
  });
  it("deduplicates same-frame creation and blocks status writes while awaiting its receipt", async () => {
    await mount(); await fill("One intent"); let resolve!: (response: Response) => void;
    override = (_url, init) => init?.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : undefined;
    const create = button("Add to timeline"), status = button("Mark done");
    await act(async () => { create.click(); create.click(); status.click(); });
    expect(writes()).toHaveLength(1); expect(title().disabled).toBe(true);
    expect([...main().querySelectorAll("fieldset input, fieldset textarea, fieldset select")].every(node => (node as HTMLInputElement).disabled)).toBe(true);
    const body = JSON.parse(String(writes()[0].init?.body));
    expect(body.startsAt).toBeNull(); expect(body.dueAt).toBeNull();
    await act(async () => resolve(Response.json({ item: { ...item("a"), ...body }, created: true })));
    await waitForApp(() => title().value === ""); expect(writes()).toHaveLength(1);
  });
  it("coalesces same-frame continuation and deduplicates overlapping page rows", async () => {
    await mount(); let resolve!: (response: Response) => void;
    override = url => url.searchParams.has("cursor") ? new Promise<Response>(done => { resolve = done; }) : undefined;
    const more = button("Load more"); await act(async () => { more.click(); more.click(); });
    expect(requests.filter(r => r.url.searchParams.has("cursor"))).toHaveLength(1);
    await act(async () => resolve(Response.json({ items: [item("a"), item("a", "second")] })));
    await waitForApp(() => main().textContent!.includes("a second")); expect(main().querySelectorAll("h2")).toHaveLength(2);
  });
  it("rejects a cursor cycle across multiple continuation pages", async () => {
    await mount(); override = url => url.searchParams.has("cursor") ? Response.json({ items: [item("a", "second")], nextCursor: "third" }) : undefined;
    await click(button("Load more"));
    override = url => url.searchParams.has("cursor") ? Response.json({ items: [item("a", "secret-third")], nextCursor: "next" }) : undefined;
    await click(button("Load more"));
    expect(main().textContent).not.toContain("secret-third"); expect(main().textContent).toContain("Unable to update the project timeline");
  });

  it.each([401, 403, 404])("clears private content if confirmed-create readback denies access %s", async status => {
    await mount(); await fill("Confirmed private draft"); let wrote = false;
    override = (url, init) => { if (init?.method === "POST") { wrote = true; return; } if (wrote && url.pathname.endsWith("/timeline")) return apiError(status, "DENIED", false); };
    await click(button("Add to timeline")); await waitForApp(() => !!button("Try timeline again"));
    expect(title()).toBeNull(); expect(main().textContent).not.toContain("a first"); expect(writes()).toHaveLength(1);
  });
  it("ignores a late creation receipt after changing projects", async () => {
    await mount(); await fill("Only for A"); let resolve!: (response: Response) => void;
    override = (_url, init) => init?.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : undefined;
    await click(button("Add to timeline")); const body = JSON.parse(String(writes()[0].init?.body));
    await navigate("b"); await waitForApp(() => main().textContent!.includes("b first")); const count = requests.length;
    await act(async () => resolve(Response.json({ item: { ...item("a"), ...body }, created: true })));
    expect(requests).toHaveLength(count); expect(title().value).toBe(""); expect(main().textContent).toContain("Project b");
  });
  it("rejects invalid time order without POST and submits normalized times after correction", async () => {
    await mount(); await fill("Date validation"); const inputs = main().querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
    const change = async (node: HTMLInputElement, value: string) => {
      const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
      await act(async () => (node as unknown as Record<string, { onChange: (event: unknown) => void }>)[key].onChange({ currentTarget: { value } }));
    };
    await change(inputs[0], "2026-09-28T12:00"); await change(inputs[1], "2026-09-27T12:00");
    await click(button("Add to timeline")); expect(writes()).toHaveLength(0); expect(title().value).toBe("Date validation");
    await change(inputs[1], "2026-09-29T12:00"); await click(button("Add to timeline"));
    const body = JSON.parse(String(writes()[0].init?.body));
    expect(body.startsAt).toBe(new Date("2026-09-28T12:00").toISOString()); expect(body.dueAt).toBe(new Date("2026-09-29T12:00").toISOString());
  });
  it("navigates back to owned projects and reopens their parameterized timeline", async () => {
    await mount(); override = url => {
      if (url.pathname === "/api/projects") return Response.json({ items: [project("a")], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      if (url.pathname.endsWith("/summary")) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
    };
    await click(button("Back to projects")); await waitForApp(() => !!button("Timeline"));
    expect(window.location.pathname).toBe("/projects"); await click(button("Timeline"));
    await waitForApp(() => !!title()); expect(window.location.pathname).toBe("/projects/a/timeline"); expect(main().textContent).toContain("a first");
  });

});
