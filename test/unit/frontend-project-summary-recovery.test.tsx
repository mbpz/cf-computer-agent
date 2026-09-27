// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
import { loadProjectSummary } from "../../frontend/lib/projects-data";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const validSummary = { goalCount: 1, taskCount: 3, completedTaskCount: 2, goals: [{ id: "goal-a", title: "Linked goal" }] };
const project = (id: string) => ({ id, clientKey: id, title: `Project ${id}`, description: null, status: "active", progress: 37, targetAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" });

describe("project summary count validation", () => {
  it.each([
    { goalCount: -1 }, { taskCount: -1 }, { completedTaskCount: -1 },
    { taskCount: 1 }, { goalCount: 0 }, { taskCount: Number.MAX_SAFE_INTEGER + 1 },
    { goals: [{ id: "same", title: "One" }, { id: "same", title: "Two" }], goalCount: 2 },
  ])("rejects contradictory summary %j", async (patch) => {
    await expect(loadProjectSummary("a", async () => Response.json({ ...validSummary, ...patch }))).rejects.toThrow("PROJECT_SUMMARY_INVALID");
  });
  it("accepts a bounded goal preview smaller than its total", async () => {
    await expect(loadProjectSummary("a", async () => Response.json({ ...validSummary, goalCount: 12 }))).resolves.toEqual({ ...validSummary, goalCount: 12 });
  });
});

describe("project summary per-row recovery", () => {
  let journey: MountedApp | undefined;
  afterEach(async () => { await journey?.unmount(); journey = undefined; });
  const main = () => journey!.container.querySelector("main")!;
  const card = (id: string) => main().querySelector(`[data-project-id="${id}"]`)!;
  const retry = (id: string) => card(id).querySelector('[data-summary-retry]') as HTMLButtonElement;
  const requests: string[] = [];
  async function mount(respond: (url: URL, init?: RequestInit) => Promise<Response> | Response) {
    requests.length = 0;
    journey = await mountAuthenticatedApp({ url: "https://app.test/projects", role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      requests.push(url.pathname + url.search);
      return respond(url, init);
    } });
  }
  it("keeps healthy rows and retries only the failed summary without inventing zeros", async () => {
    let failed = true;
    await mount((url) => url.pathname === "/api/projects" ? Response.json({ items: [project("a"), project("b")], pagination: { page: 1, pageSize: 20, total: [project("a"), project("b")].length, totalPages: 1 } })
      : url.pathname === "/api/projects/a/summary" && failed ? apiError(503, "UNAVAILABLE", true) : Response.json(validSummary));
    await waitForApp(() => main().textContent?.includes("Project b") === true);
    expect(card("a").textContent).toContain("Unable to load project counts.");
    expect(card("a").textContent).not.toContain("0/0");
    expect(card("b").textContent).toContain("2/3");
    expect(requests).toHaveLength(3);
    failed = false;
    await act(async () => retry("a").click());
    await waitForApp(() => card("a").textContent?.includes("2/3") === true);
    expect(requests).toEqual(["/api/projects?page=1&pageSize=20", "/api/projects/a/summary", "/api/projects/b/summary", "/api/projects/a/summary"]);
  });
  it("deduplicates row retries while preserving other project actions", async () => {
    let resolve!: (response: Response) => void;
    let reads = 0;
    await mount((url) => {
      if (url.pathname === "/api/projects") return Response.json({ items: [project("a"), project("b")], pagination: { page: 1, pageSize: 20, total: [project("a"), project("b")].length, totalPages: 1 } });
      if (url.pathname !== "/api/projects/a/summary") return Response.json(validSummary);
      return ++reads === 1 ? apiError(500, "UNAVAILABLE", true) : new Promise<Response>((done) => { resolve = done; });
    });
    await waitForApp(() => card("a") !== null);
    await act(async () => { retry("a").click(); retry("a").click(); });
    expect(reads).toBe(2);
    expect(retry("a").disabled).toBe(true);
    expect([...card("b").querySelectorAll("button")].some((button) => button.textContent === "Timeline" && !button.disabled)).toBe(true);
    await act(async () => resolve(Response.json(validSummary)));
    await waitForApp(() => card("a").textContent?.includes("2/3") === true);
  });
  it.each([401, 403])("clears every project if row retry loses permission (%s)", async (status) => {
    let reads = 0;
    await mount((url) => url.pathname === "/api/projects" ? Response.json({ items: [project("a"), project("b")], pagination: { page: 1, pageSize: 20, total: [project("a"), project("b")].length, totalPages: 1 } })
      : url.pathname === "/api/projects/a/summary" ? apiError(++reads === 1 ? 500 : status, "DENIED", false) : Response.json(validSummary));
    await waitForApp(() => card("a") !== null);
    await act(async () => retry("a").click());
    await waitForApp(() => main().querySelector('[data-page-state="error"]') !== null);
    expect(main().textContent).not.toContain("Project a");
    expect(main().textContent).not.toContain("Project b");
    expect(main().textContent).not.toContain("Linked goal");
  });
  it("renders unavailable counts for a valid project ID matching an inherited property", async () => {
    await mount((url) => url.pathname === "/api/projects" ? Response.json({ items: [project("constructor")], pagination: { page: 1, pageSize: 20, total: [project("constructor")].length, totalPages: 1 } }) : apiError(500, "UNAVAILABLE", true));
    await waitForApp(() => card("constructor") !== null);
    expect(card("constructor").textContent).toContain("Unable to load project counts.");
  });

  it("treats malformed row counts as a local failure rather than failing healthy projects", async () => {
    await mount((url) => url.pathname === "/api/projects" ? Response.json({ items: [project("a"), project("b")], pagination: { page: 1, pageSize: 20, total: [project("a"), project("b")].length, totalPages: 1 } })
      : Response.json(url.pathname === "/api/projects/a/summary" ? { ...validSummary, taskCount: 1 } : validSummary));
    await waitForApp(() => card("b") !== null);
    expect(card("a").textContent).toContain("Unable to load project counts.");
    expect(card("b").textContent).toContain("2/3");
  });

  it("aborts and ignores an old summary retry after a successful status write refreshes the page", async () => {
    let resolveOld!: (response: Response) => void;
    let oldSignal: AbortSignal | undefined;
    let reads = 0;
    let mutated = false;
    await mount((url, init) => {
      if (init?.method === "POST") { mutated = true; return Response.json({ ...project("b"), status: "completed", updatedAt: "2026-09-01T00:00:00.001Z" }); }
      if (url.pathname === "/api/projects") return Response.json({ items: [project("a"), project("b")], pagination: { page: 1, pageSize: 20, total: [project("a"), project("b")].length, totalPages: 1 } });
      if (url.pathname !== "/api/projects/a/summary") return Response.json(validSummary);
      if (++reads === 1) return apiError(500, "UNAVAILABLE", true);
      if (!mutated) { oldSignal = init?.signal ?? undefined; return new Promise<Response>((done) => { resolveOld = done; }); }
      return Response.json({ ...validSummary, taskCount: 9 });
    });
    await waitForApp(() => card("a") !== null);
    await act(async () => retry("a").click());
    await act(async () => ([...card("b").querySelectorAll("button")].find((button) => button.textContent === "Complete") as HTMLButtonElement).click());
    await waitForApp(() => card("a").textContent?.includes("2/9") === true);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => resolveOld(Response.json(validSummary)));
    expect(card("a").textContent).toContain("2/9");
  });

  it("cancels all pending summaries on denial and never accepts a late private response", async () => {
    let resolveLate!: (response: Response) => void;
    let resolveDenied!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    await mount((url, init) => {
      if (url.pathname === "/api/projects") return Response.json({ items: [project("a"), project("b")], pagination: { page: 1, pageSize: 20, total: [project("a"), project("b")].length, totalPages: 1 } });
      if (url.pathname === "/api/projects/a/summary") return new Promise<Response>((done) => { resolveDenied = done; });
      signal = init?.signal ?? undefined;
      return new Promise<Response>((done) => { resolveLate = done; });
    });
    await waitForApp(() => !!resolveDenied && !!resolveLate);
    await act(async () => resolveDenied(apiError(403, "DENIED", false)));
    await waitForApp(() => main().querySelector('[data-page-state="error"]') !== null);
    expect(signal?.aborted).toBe(true);
    await act(async () => resolveLate(Response.json(validSummary)));
    expect(main().textContent).not.toContain("Project b");
    expect(main().textContent).not.toContain("Linked goal");
  });

  it("replaces a numbered page and retries only its failed summary", async () => {
    let failed = true;
    await mount((url) => {
      if (url.pathname === "/api/projects") {
        const page = Number(url.searchParams.get("page"));
        const items = page === 1 ? Array.from({ length: 20 }, (_, i) => project(`first-${i}`)) : [project("a"), project("b")];
        return Response.json({ items, pagination: { page, pageSize: 20, total: 22, totalPages: 2 } });
      }
      return url.pathname === "/api/projects/b/summary" && failed ? apiError(500, "UNAVAILABLE", true) : Response.json(validSummary);
    });
    await waitForApp(() => card("first-0") !== null);
    await act(async () => (main().querySelector('button[aria-label="Page 2"]') as HTMLButtonElement).click());
    await waitForApp(() => card("b") !== null);
    expect(card("first-0")).toBeNull();
    expect(card("a").textContent).toContain("2/3");
    expect(card("b").textContent).toContain("Unable to load project counts.");
    const beforeRetry = requests.length;
    failed = false;
    await act(async () => retry("b").click());
    await waitForApp(() => card("b").textContent?.includes("2/3") === true);
    expect(requests.slice(beforeRetry)).toEqual(["/api/projects/b/summary"]);
    expect(requests.filter(path => path.startsWith("/api/projects?"))).toEqual(["/api/projects?page=1&pageSize=20", "/api/projects?page=2&pageSize=20"]);
  });
});
