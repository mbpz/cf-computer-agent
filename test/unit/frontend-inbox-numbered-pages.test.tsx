// @vitest-environment node
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import type { WorkspaceLeaveDecision } from "../../frontend/lib/workspace-navigation-gate";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forceRemountAppAt, mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
import { stubListViewport } from "../helpers/list-viewport";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const kind = "inbox";
describe("inbox scrolling list through App", () => {
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
    app = await mountAuthenticatedApp({ url: `https://app.test/${kind}${search}`, role: "contributor", permissionMask: "0x100000", configureBrowser(browser) { vi.stubGlobal("HTMLElement", browser.HTMLElement); stubListViewport(browser, "mobile"); }, fetch: async (input, init) => {
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
  async function navigate(search: string) { await act(async () => { expect(writeWorkspaceHistory("push", `/${kind}${search}`)).toBe("committed"); }); }
  const statusFilter = () => main().querySelector('select[aria-label="Inbox status"]') as HTMLSelectElement;
  async function changeStatus(value: string) { await act(async () => { const node = statusFilter(); node.value = value; node.dispatchEvent(new app!.browser.Event("change", { bubbles: true })); }); }
  /** The inbox list appends by scrolling its table container to the bottom. */
  async function scrollToEnd() {
    const scroller = main().querySelector("div.overflow-auto") as HTMLElement;
    expect(scroller).toBeTruthy();
    await act(async () => { scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new app!.browser.Event("scroll", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  afterEach(async () => { await app?.unmount(); app = undefined; });

  it.each(["cancel", "accept"] as const)("%s defers an inbox filter navigation until admission", async outcome => {
    await mount(); let decision!: WorkspaceLeaveDecision;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: "confirm", version: "draft", prompt(next) { decision = next; }, dismiss() {} }));
    try {
      const count = requests.length;
      await changeStatus("archived");
      expect(window.location.search).toBe(""); expect(requests).toHaveLength(count);
      expect(main().textContent).toContain("Private row 0");
      // Deferral used to discard current rows even when history was not yet admitted.
      expect(main().textContent).not.toContain("Loading");
      await act(async () => decision[outcome]());
      if (outcome === "accept") {
        await waitForApp(() => requests.at(-1)?.searchParams.get("status") === "archived" && main().textContent!.includes("Private row 0"));
        expect(requests).toHaveLength(count + 1);
      } else {
        expect(requests).toHaveLength(count);
        expect(main().textContent).toContain("Private row 0");
      }
    } finally { unregister(); }
  });

  it("ignores a numbered deep link and loads the first window", async () => {
    await mount("?page=2");
    expect(requests[0]?.searchParams.get("page")).toBe("1");
    expect(requests[0]?.searchParams.get("pageSize")).toBe("20");
    expect(window.location.search).toBe("");
    expect(main().textContent).toContain("Private row 0");
    expect(main().textContent).not.toContain("Private row 20");
  });

  it("appends the next page on end-of-list without duplicating the first page", async () => {
    await mount();
    await scrollToEnd();
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(main().textContent).toContain("Private row 0");
    expect(main().querySelectorAll("time")).toHaveLength(40);
  });

  it("appends every remaining page on scroll and stops after the last one", async () => {
    await mount();
    await scrollToEnd(); await waitForApp(() => main().textContent!.includes("Private row 20"));
    await scrollToEnd(); await waitForApp(() => main().textContent!.includes("Private row 42"));
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1", "2", "3"]);
    const before = requests.length;
    await scrollToEnd();
    expect(requests).toHaveLength(before);
    expect(main().querySelectorAll("time")).toHaveLength(43);
  });

  it("canonicalizes invalid and duplicate URL page parameters", async () => {
    await mount("?page=2&page=3&pageSize=21");
    expect(requests[0]?.searchParams.get("page")).toBe("1"); expect(window.location.search).toBe("");
  });

  it.each([401, 403, 503])("clears old rows on a failed filter reload (%s) and retries the first page", async status => {
    await mount(); fail = status;
    await changeStatus("archived"); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().querySelectorAll("time")).toHaveLength(0);
    fail = undefined; const retry = [...main().querySelectorAll("button")].find(node => node.textContent === "Try again")!;
    await click(retry); await waitForApp(() => main().textContent!.includes("Private row 0"));
    expect(requests.at(-1)?.searchParams.get("status")).toBe("archived");
  });

  it("keeps the first window visible while an append is in flight and never duplicates rows", async () => {
    await mount(); delayPageTwo = true;
    await scrollToEnd(); await waitForApp(() => !!resolvePageTwo);
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(main().textContent).toContain("Private row 0");
    expect(main().querySelectorAll("time")).toHaveLength(20);
    await act(async () => resolvePageTwo!());
    await waitForApp(() => main().querySelectorAll("time").length === 40);
    expect(main().textContent).toContain("Private row 39");
  });

  it("locks writes synchronously when an append starts", async () => {
    await mount();
    const complete = [...main().querySelectorAll("button")].find(node => node.textContent === "Archive")!;
    await act(async () => { const scroller = main().querySelector("div.overflow-auto") as HTMLElement; scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new app!.browser.Event("scroll", { bubbles: true })); complete.click(); });
    await waitForApp(() => main().textContent!.includes("Private row 20"));
    expect(methods.every(method => method === "GET")).toBe(true);
  });

  it("rejects an append whose server page does not match the requested page", async () => {
    await mount(); malformed = true;
    await scrollToEnd(); await waitForApp(() => main().textContent!.includes("Unable to load"));
    expect(main().querySelectorAll("time")).toHaveLength(0);
  });

  it("restores status filters and restarts the window when changing status", async () => {
    await mount("?page=2&status=archived");
    expect(requests[0]?.searchParams.get("page")).toBe("1");
    expect(requests[0]?.searchParams.get("status")).toBe("archived");
    expect(statusFilter().value).toBe("archived");
    await changeStatus("promoted");
    await waitForApp(() => requests.at(-1)?.searchParams.get("status") === "promoted" && main().textContent!.includes("Private row 0"));
    expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("status")).toBe("promoted");
    await navigate("?status=archived");
    await waitForApp(() => statusFilter().value === "archived" && main().textContent!.includes("Private row 0"));
  });

  it.each(["?status=bogus", "?status=inbox&status=archived"])("canonicalizes invalid status: %s", async search => {
    await mount(search);
    expect(requests[0]?.searchParams.has("status")).toBe(false);
    expect(window.location.search).toBe("");
  });

  it("aborts reads on route leave and ignores late results", async () => {
    await mount(); delayPageTwo = true;
    await scrollToEnd(); await waitForApp(() => !!resolvePageTwo);
    await act(async () => { expect(writeWorkspaceHistory("push", "/unknown")).toBe("committed"); });
    expect(delayedSignal?.aborted).toBe(true);
    await act(async () => resolvePageTwo!());
    expect(main().textContent).not.toContain("Private row");
  });

  it("ignores a stated page size while keeping the status filter", async () => {
    await mount("?pageSize=50&status=archived");
    expect(requests[0]?.searchParams.get("page")).toBe("1");
    expect(requests[0]?.searchParams.get("pageSize")).toBe("20");
    expect(requests[0]?.searchParams.get("status")).toBe("archived");
    expect(window.location.search).toBe("?status=archived");
    expect(main().querySelectorAll("time")).toHaveLength(20);
  });

  it("canonicalizes query-window overflow and removes legacy cursor parameters", async () => {
    await mount("?page=501&limit=10&cursor=obsolete");
    expect(requests[0]?.searchParams.get("page")).toBe("1"); expect(window.location.search).toBe("");
    expect(requests[0]?.searchParams.has("cursor")).toBe(false);
  });

  it("a status change restarts the window, dropping rows appended before it", async () => {
    await mount();
    await scrollToEnd(); await waitForApp(() => main().querySelectorAll("time").length === 40);
    await changeStatus("promoted");
    await waitForApp(() => requests.at(-1)?.searchParams.get("status") === "promoted" && main().textContent!.includes("Private row 0"));
    expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
    expect(statusFilter().value).toBe("promoted");
    expect(main().querySelectorAll("time")).toHaveLength(20);
    expect(main().textContent).not.toContain("Private row 20");
  });

  it("refreshes the exact filter after archive, never appending", async () => {
    await mount("?status=inbox");
    await click([...main().querySelectorAll("button")].find(node => node.textContent === "Archive")!);
    expect(methods.filter(method => method === "PATCH")).toHaveLength(0);
    await click(main().querySelector<HTMLButtonElement>("[data-confirm-action]")!);
    await waitForApp(() => methods.length === 4 && main().textContent!.includes("Private row 19"));
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

  it("blocks navigation while writing and ignores late writes after forced teardown", async () => {
    await mount(); delayWrite = true;
    const archive = [...main().querySelectorAll("button")].find(node => node.textContent === "Archive")!;
    await act(async () => { archive.click(); archive.click(); });
    expect(methods.filter(method => method === "PATCH")).toHaveLength(0);
    const confirm = main().querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await act(async () => { confirm.click(); confirm.click(); });
    await waitForApp(() => !!resolveWrite);
    await act(async () => expect(writeWorkspaceHistory("push", "/inbox?page=3")).toBe("blocked"));
    // A stated page in the URL is ignored: the reload starts over at the first window.
    const beforeRemount = requests.length;
    await forceRemountAppAt(app!, "/inbox?page=3"); await waitForApp(() => main().textContent!.includes("Private row 0"));
    const reloaded = requests.slice(beforeRemount).filter(url => url.searchParams.has("page"));
    expect(reloaded.at(-1)?.searchParams.get("page")).toBe("1");
    const before = requests.length;
    await act(async () => resolveWrite!());
    expect(requests).toHaveLength(before);
    expect(methods.filter(method => method === "PATCH")).toHaveLength(1);
  });
});
