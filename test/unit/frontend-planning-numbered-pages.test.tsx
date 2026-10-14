// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
for (const kind of ["goals", "projects"] as const) describe(`${kind} scrolling list through App`, () => {
  let app: MountedApp | undefined;
  let requests: URL[]; let fail: number | undefined; let malformed = false; let total = 43;
  let methods: string[]; let delayPageTwo = false; let resolvePageTwo: (() => void) | undefined; let delayedSignal: AbortSignal | null | undefined;
  const main = () => app!.container.querySelector("main")!;
  // Loading appends skeleton rows; count only the rows that carry a loaded entity.
  const rows = () => [...main().querySelectorAll("tbody tr")].filter(tr => tr.textContent?.includes("Private row"));
  const entity = (id: number) => ({ id: `row-${id}`, clientKey: `key-${id}`, title: `Private row ${id}`, description: null, status: "active", progress: 0, targetAt: null, createdAt: "2026-09-26", updatedAt: "2026-09-26" });
  const pageResponse = (url: URL) => {
    const page = Number(url.searchParams.get("page") ?? 1); const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    return Response.json({ items: Array.from({ length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) }, (_, i) => entity((page - 1) * pageSize + i)), pagination: { page: malformed ? 1 : page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  };
  async function mount(search = "", count = 43, initialFail?: number) {
    total = count;
    requests = []; methods = []; delayPageTwo = false; resolvePageTwo = undefined; delayedSignal = undefined; fail = initialFail; malformed = false;
    app = await mountAuthenticatedApp({ url: `https://app.test/${kind}${search}`, role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (url.pathname.endsWith("/summary")) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
      requests.push(url); methods.push(init?.method ?? "GET");
      if (fail) return apiError(fail, "UNAVAILABLE", true);
      if (delayPageTwo && url.searchParams.get("page") === "2") {
        delayedSignal = init?.signal;
        const { promise, resolve } = Promise.withResolvers<Response>();
        resolvePageTwo = () => resolve(pageResponse(url));
        return promise;
      }
      return pageResponse(url);
    } });
    await waitForApp(() => !!main()?.querySelector("h1") || main().textContent!.includes("Unable to load"));
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  /** The list appends by scrolling its table container to the bottom. */
  async function scrollToEnd() {
    const scroller = main().querySelector("div.overflow-auto") as HTMLElement;
    expect(scroller).toBeTruthy();
    await act(async () => { scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new app!.browser.Event("scroll", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  afterEach(async () => { await app?.unmount(); app = undefined; });

  if (kind === "projects") it("keeps the loaded window and the active filter when an append fails, then appends on retry", async () => {
    await mount("?status=active");
    expect(requests[0]?.searchParams.get("status")).toBe("active");
    expect(requests[0]?.searchParams.get("page")).toBe("1");
    fail = 503;
    await scrollToEnd();
    await waitForApp(() => main().textContent!.includes("Unable to update the project."));
    expect(main().textContent).toContain("Private row 0");
    expect(rows()).toHaveLength(20);
    fail = undefined;
    await scrollToEnd();
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(requests.at(-1)?.searchParams.get("page")).toBe("2");
    expect(requests.at(-1)?.searchParams.get("status")).toBe("active");
    expect(rows()).toHaveLength(40);
  });

  it("ignores a numbered deep link and loads the first window", async () => {
    await mount("?page=2");
    expect(requests[0]?.searchParams.get("page")).toBe("1");
    expect(requests[0]?.searchParams.get("pageSize")).toBe("20");
    expect(main().textContent).toContain("Private row 0");
    expect(main().textContent).not.toContain("Private row 20");
  });

  it("appends the next page on end-of-list without duplicating the first page", async () => {
    await mount();
    await scrollToEnd();
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(main().textContent).toContain("Private row 0");
    expect(rows()).toHaveLength(40);
  });

  it("appends every remaining page and stops after the last one", async () => {
    await mount();
    await scrollToEnd(); await waitForApp(() => main().textContent!.includes("Private row 20"));
    await scrollToEnd(); await waitForApp(() => main().textContent!.includes("Private row 42"));
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1", "2", "3"]);
    const before = requests.length;
    await scrollToEnd();
    expect(requests).toHaveLength(before);
    expect(rows()).toHaveLength(43);
  });

  it("clears old rows on a failed initial load and retries the first page", async () => {
    await mount("", 43, 503);
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(rows()).toHaveLength(0);
    fail = undefined;
    await click([...main().querySelectorAll("button")].find(node => node.textContent === `Try ${kind} again`)!);
    await waitForApp(() => main().textContent!.includes("Private row 0"));
    expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  });

  it("keeps the first window visible while an append is in flight and never duplicates rows", async () => {
    await mount(); delayPageTwo = true;
    await scrollToEnd(); await waitForApp(() => !!resolvePageTwo);
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(main().textContent).toContain("Private row 0");
    expect(rows()).toHaveLength(20);
    await act(async () => resolvePageTwo!());
    await waitForApp(() => rows().length === 40);
    expect(main().textContent).toContain("Private row 39");
  });

  it("locks writes synchronously when an append starts", async () => {
    await mount();
    const complete = [...main().querySelectorAll("button")].find(node => node.textContent === "Complete")!;
    await act(async () => {
      const scroller = main().querySelector("div.overflow-auto") as HTMLElement; scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new app!.browser.Event("scroll", { bubbles: true }));
      complete.click();
    });
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(methods.every(method => method === "GET")).toBe(true);
  });

  it("rejects an append whose server page does not match the requested page", async () => {
    await mount(); malformed = true;
    await scrollToEnd();
    await waitForApp(() => main().textContent!.includes(`Unable to update the ${kind === "goals" ? "goal" : "project"}.`));
    expect(rows()).toHaveLength(20);
    expect(main().textContent).toContain("Private row 0");
  });

  it("aborts an in-flight append on route leave and ignores late results", async () => {
    await mount(); delayPageTwo = true;
    await scrollToEnd(); await waitForApp(() => !!resolvePageTwo);
    await act(async () => { expect(writeWorkspaceHistory("push", "/unknown")).toBe("committed"); });
    expect(delayedSignal?.aborted).toBe(true);
    await act(async () => resolvePageTwo!());
    expect(main().textContent).not.toContain("Private row 20");
  });
});
