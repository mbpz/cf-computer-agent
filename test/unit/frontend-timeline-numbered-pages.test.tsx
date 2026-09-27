// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
describe("timeline numbered pages through App", () => {
  const kind = "projects/a/timeline";
  let app: MountedApp | undefined;
  let requests: URL[]; let fail: number | undefined; let malformed = false; let total = 43;
  let methods: string[]; let delayPageTwo = false; let resolvePageTwo: (() => void) | undefined; let delayedSignal: AbortSignal | null | undefined;
  const main = () => app!.container.querySelector("main")!;
  const button = (label: string) => main().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
  const entity = (id: number) => ({ id: `row-${id}`, clientKey: `key-${id}`, title: `Private row ${id}`, projectId: "a", kind: "meeting", body: "private", status: "open", startsAt: null, dueAt: null, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" });
  const pageResponse = (url: URL) => {
    const page = Number(url.searchParams.get("page") ?? 1); const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    return Response.json({ items: Array.from({ length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) }, (_, i) => entity((page - 1) * pageSize + i)), pagination: { page: malformed ? 1 : page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  };
  async function mount(search = "", count = 43) {
    total = count;
    requests = []; methods = []; delayPageTwo = false; resolvePageTwo = undefined; delayedSignal = undefined; fail = undefined; malformed = false;
    app = await mountAuthenticatedApp({ url: `https://app.test/${kind}${search}`, role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (url.pathname.endsWith("/summary")) return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
      if (url.pathname === "/api/projects/a") return Response.json({ id: "a", clientKey: "a", title: "Project A", description: null, status: "active", progress: 0, targetAt: null, createdAt: "2026-09-26", updatedAt: "2026-09-26" });
      requests.push(url); methods.push(init?.method ?? "GET");
      if (delayPageTwo && url.searchParams.get("page") === "2") {
        delayedSignal = init?.signal;
        return new Promise<Response>(resolve => { resolvePageTwo = () => resolve(pageResponse(url)); });
      }
      return fail ? apiError(fail, "UNAVAILABLE", true) : pageResponse(url);
    } });
    await waitForApp(() => !!main()?.querySelector("h2"));
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function navigate(search: string) { await act(async () => { window.history.pushState({}, "", `/${kind}${search}`); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); }); }
  afterEach(async () => { await app?.unmount(); app = undefined; });
  it("restores a numbered deep link and replaces rather than appends rows", async () => {
    await mount("?page=2");
    expect(requests[0]?.searchParams.get("page")).toBe("2");
    expect(main().textContent).toContain("Private row 20"); expect(main().textContent).not.toContain("Private row 0");
    expect(button("Page 2").getAttribute("aria-current")).toBe("page");
    await click(button("Page 3")); await waitForApp(() => main().textContent!.includes("Private row 42"));
    expect(new URL(window.location.href).searchParams.get("page")).toBe("3");
    expect(main().textContent).not.toContain("Private row 20");
    await navigate("?page=2"); await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(button("Page 2").getAttribute("aria-current")).toBe("page");
  });
  it("resets to page one when changing the page size and restores it from the URL", async () => {
    await mount("?page=2");
    await act(async () => { const node = main().querySelector('select[aria-label="Rows per page"]')!; node.value = "50"; node.dispatchEvent(new app!.browser.Event("change", { bubbles: true })); });
    await waitForApp(() => requests.at(-1)?.searchParams.get("pageSize") === "50" && main().textContent!.includes("Private row 0"));
    expect(window.location.search).toBe("?pageSize=50"); expect(main().querySelectorAll("h2")).toHaveLength(43);
  });
  it("canonicalizes invalid and duplicate URL page parameters", async () => {
    await mount("?page=2&page=3&pageSize=21");
    expect(requests[0]?.searchParams.get("page")).toBe("1"); expect(window.location.search).toBe("");
  });
  it.each([401, 403, 503])("clears old-page rows on failed navigation (%s) and retries the requested page", async status => {
    await mount(); fail = status;
    await navigate("?page=2"); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().querySelectorAll("h2")).toHaveLength(0);
    fail = undefined; const retry = [...main().querySelectorAll("button")].find(node => node.textContent === "Try timeline again")!;
    await click(retry); await waitForApp(() => main().textContent!.includes("Private row 20"));
  });
  it("keeps the true total but disables pages outside the 10000-row query window", async () => {
    await mount("?page=500", 10021);
    expect(button("Page 502").disabled).toBe(true);
    const next = [...main().querySelectorAll<HTMLButtonElement>('button[aria-label="Next page"]')];
    expect(next).toHaveLength(2); expect(next.every(node => node.disabled)).toBe(true);
    expect(main().textContent).toContain("10021");
    await click(button("Page 499")); await waitForApp(() => main().textContent!.includes("Private row 9960"));
  });
  it("recovers from an empty beyond-last page without showing the previous rows", async () => {
    await mount(); await navigate("?page=4");
    await waitForApp(() => main().textContent!.includes("0–0"));
    expect(main().querySelectorAll("h2")).toHaveLength(0);
    await click(button("Page 3")); await waitForApp(() => main().textContent!.includes("Private row 42"));
  });
  it("aborts a superseded page and ignores a transport that still resolves late", async () => {
    await mount(); delayPageTwo = true;
    await navigate("?page=2"); await waitForApp(() => !!resolvePageTwo);
    await navigate("?page=3"); await waitForApp(() => main().textContent!.includes("Private row 42"));
    expect(delayedSignal?.aborted).toBe(true);
    await act(async () => resolvePageTwo!());
    expect(main().textContent).not.toContain("Private row 20");
    expect(button("Page 3").getAttribute("aria-current")).toBe("page");
  });
  it("locks writes synchronously when a page change starts", async () => {
    await mount();
    const complete = [...main().querySelectorAll("button")].find(node => node.textContent === "Mark done")!;
    await act(async () => { button("Page 2").click(); complete.click(); });
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(methods.every(method => method === "GET")).toBe(true);
  });
  it("rejects a server page that does not match the requested page", async () => {
    await mount(); malformed = true; await navigate("?page=2");
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().querySelectorAll("h2")).toHaveLength(0);
  });
});
