// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const kind = "inbox";
describe("inbox numbered pages through App", () => {
  let app: MountedApp | undefined;
  let delayWrite = false; let resolveWrite: (() => void) | undefined; let failReadAfterWrite = false;
  let requests: URL[]; let fail: number | undefined; let malformed = false; let total = 43;
  let methods: string[]; let delayPageTwo = false; let resolvePageTwo: (() => void) | undefined; let delayedSignal: AbortSignal | null | undefined;
  const main = () => app!.container.querySelector("main")!;
  const button = (label: string) => main().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
  const entity = (id: number) => ({ id: `row-${id}`, clientKey: `key-${id}`, content: `Private row ${id}`, kind: "text", status: "inbox", sourceUrl: null, promotedTaskId: null, promotedSubmissionId: null, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" });
  const pageResponse = (url: URL) => {
    const page = Number(url.searchParams.get("page") ?? 1); const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    return Response.json({ items: Array.from({ length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) }, (_, i) => ({ ...entity((page - 1) * pageSize + i), status: url.searchParams.get("status") ?? "inbox" })), pagination: { page: malformed ? 1 : page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  };
  async function mount(search = "", count = 43) {
    total = count; delayWrite = false; resolveWrite = undefined; failReadAfterWrite = false;
    requests = []; methods = []; delayPageTwo = false; resolvePageTwo = undefined; delayedSignal = undefined; fail = undefined; malformed = false;
    app = await mountAuthenticatedApp({ url: `https://app.test/${kind}${search}`, role: "contributor", permissionMask: "0x100000", configureBrowser(browser) { vi.stubGlobal("HTMLElement", browser.HTMLElement); }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (url.pathname === "/api/notifications/summary") return Response.json({ unread: 0 });
      expect(url.pathname).toMatch(/^\/api\/inbox(?:\/|$)/);
      requests.push(url); methods.push(init?.method ?? "GET");
      if (init?.method === "PATCH") {
        const id = Number(url.pathname.split("row-")[1]);
        if (delayWrite) return new Promise<Response>(resolve => { resolveWrite = () => resolve(Response.json({ ...entity(id), status: "archived", updatedAt: "2026-09-26T00:00:00.001Z" })); });
        if (failReadAfterWrite) fail = 403;
        return Response.json({ ...entity(id), status: "archived", updatedAt: "2026-09-26T00:00:00.001Z" });
      }
      if (url.pathname.startsWith("/api/inbox/row-")) return fail ? apiError(fail, "UNAVAILABLE", true) : Response.json({ ...entity(Number(url.pathname.split("row-")[1])), status: "archived", updatedAt: "2026-09-26T00:00:00.001Z" });
      if (delayPageTwo && url.searchParams.get("page") === "2") {
        delayedSignal = init?.signal;
        return new Promise<Response>(resolve => { resolvePageTwo = () => resolve(pageResponse(url)); });
      }
      return fail ? apiError(fail, "UNAVAILABLE", true) : pageResponse(url);
    } });
    await waitForApp(() => main()?.textContent?.includes("Private row") === true);
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
    expect(window.location.search).toBe("?pageSize=50"); expect(main().querySelectorAll("time")).toHaveLength(43);
  });
  it("canonicalizes invalid and duplicate URL page parameters", async () => {
    await mount("?page=2&page=3&pageSize=21");
    expect(requests[0]?.searchParams.get("page")).toBe("1"); expect(window.location.search).toBe("");
  });
  it.each([401, 403, 503])("clears old-page rows on failed navigation (%s) and retries the requested page", async status => {
    await mount(); fail = status;
    await navigate("?page=2"); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().querySelectorAll("time")).toHaveLength(0);
    fail = undefined; const retry = [...main().querySelectorAll("button")].find(node => node.textContent === "Try again")!;
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
    expect(main().querySelectorAll("time")).toHaveLength(0);
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
    const complete = [...main().querySelectorAll("button")].find(node => node.textContent === "Archive")!;
    await act(async () => { button("Page 2").click(); complete.click(); });
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(methods.every(method => method === "GET")).toBe(true);
  });
  it("rejects a server page that does not match the requested page", async () => {
    await mount(); malformed = true; await navigate("?page=2");
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().querySelectorAll("time")).toHaveLength(0);
  });
  it("restores status filters and resets the page when changing status", async () => {
    await mount("?page=2&status=archived");
    expect(requests[0]?.searchParams.get("status")).toBe("archived");
    const filter = () => main().querySelector('select[aria-label="Inbox status"]') as HTMLSelectElement;
    expect(filter().value).toBe("archived");
    await act(async () => { filter().value = "promoted"; filter().dispatchEvent(new app!.browser.Event("change", { bubbles: true })); });
    await waitForApp(() => requests.at(-1)?.searchParams.get("status") === "promoted" && main().textContent!.includes("Private row 0"));
    expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
    await navigate("?page=2&status=archived");
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(filter().value).toBe("archived");
  });
  it.each(["?status=bogus", "?status=inbox&status=archived"])("canonicalizes invalid status: %s", async search => {
    await mount(search);
    expect(requests[0]?.searchParams.has("status")).toBe(false);
    expect(window.location.search).toBe("");
  });
  it("aborts reads on route leave and ignores late results", async () => {
    await mount(); delayPageTwo = true;
    await navigate("?page=2"); await waitForApp(() => !!resolvePageTwo);
    await act(async () => { window.history.pushState({}, "", "/unknown"); window.dispatchEvent(new app!.browser.PopStateEvent("popstate")); });
    expect(delayedSignal?.aborted).toBe(true);
    await act(async () => resolvePageTwo!());
    expect(main().textContent).not.toContain("Private row");
  });
  it.each([50, 100])("restores pageSize=%s with a status filter", async size => {
    await mount(`?pageSize=${size}&status=archived`);
    expect(requests[0]?.searchParams.get("pageSize")).toBe(String(size));
    expect(main().querySelectorAll("time")).toHaveLength(43);
    expect((main().querySelector('select[aria-label="Rows per page"]') as HTMLSelectElement).value).toBe(String(size));
  });
  it("canonicalizes query-window overflow and removes legacy cursor parameters", async () => {
    await mount("?page=501&limit=10&cursor=obsolete");
    expect(requests[0]?.searchParams.get("page")).toBe("1"); expect(window.location.search).toBe("");
    expect(requests[0]?.searchParams.has("cursor")).toBe(false);
  });
  it("a status change aborts old filtered reads even at the same page", async () => {
    await mount(); delayPageTwo = true;
    await navigate("?page=2&status=archived"); await waitForApp(() => !!resolvePageTwo);
    delayPageTwo = false;
    await navigate("?page=2&status=promoted"); await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(delayedSignal?.aborted).toBe(true);
    await act(async () => resolvePageTwo!());
    expect((main().querySelector('select[aria-label="Inbox status"]') as HTMLSelectElement).value).toBe("promoted");
    expect([...main().querySelectorAll("button")].some(node => node.textContent === "Restore")).toBe(false);
  });
  it("refreshes the exact numbered filter after archive, never appending", async () => {
    await mount("?page=2&status=inbox");
    await click([...main().querySelectorAll("button")].find(node => node.textContent === "Archive")!);
    expect(methods.filter(method => method === "PATCH")).toHaveLength(0);
    await click(main().querySelector<HTMLButtonElement>("[data-confirm-action]")!);
    await waitForApp(() => methods.length === 4 && main().textContent!.includes("Private row 20"));
    expect(methods).toEqual(["GET", "PATCH", "GET", "GET"]);
    expect(requests[3]!.search).toBe(requests[0]!.search);
    expect(main().querySelectorAll("time")).toHaveLength(20);
  });
  it("denied readback removes private rows after a successful write", async () => {
    await mount(); failReadAfterWrite = true;
    await click([...main().querySelectorAll("button")].find(node => node.textContent === "Archive")!);
    expect(methods.filter(method => method === "PATCH")).toHaveLength(0);
    await click(main().querySelector<HTMLButtonElement>("[data-confirm-action]")!);
    await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().textContent).not.toContain("Private row");
  });
  it("late writes do not refresh an obsolete page and duplicate clicks issue one write", async () => {
    await mount(); delayWrite = true;
    const archive = [...main().querySelectorAll("button")].find(node => node.textContent === "Archive")!;
    await act(async () => { archive.click(); archive.click(); });
    expect(methods.filter(method => method === "PATCH")).toHaveLength(0);
    const confirm = main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await act(async () => { confirm.click(); confirm.click(); });
    await waitForApp(() => !!resolveWrite);
    await navigate("?page=3"); await waitForApp(() => main().textContent!.includes("Private row 42"));
    const before = requests.length;
    await act(async () => resolveWrite!());
    expect(requests).toHaveLength(before);
    expect(methods.filter(method => method === "PATCH")).toHaveLength(1);
    expect(main().textContent).not.toContain("Private row 0");
  });
});
