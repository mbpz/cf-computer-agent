// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { stubListViewport } from "../helpers/list-viewport";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const from = "2026-09-28T00:00:00.000Z", to = "2026-09-29T00:00:00.000Z";
const range = `from=${from}&to=${to}`;
describe("calendar scrolling range through App", () => {
  let app: MountedApp | undefined, requests: URL[], fail: number | undefined, malformed = false, total = 43;
  let delay = false, resolveRead: (() => void) | undefined, signal: AbortSignal | null | undefined;
  const main = () => app!.container.querySelector("main")!;
  const rows = () => [...main().querySelectorAll("tbody tr")].filter(tr => tr.textContent?.includes("Private event"));
  const response = (url: URL) => {
    const page = Number(url.searchParams.get("page") ?? 1), pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    return Response.json({ items: Array.from({ length: Math.max(0,Math.min(pageSize, total-(page-1)*pageSize)) }, (_, i) => ({ id: `event-${(page-1)*pageSize+i}`, updatedAt: "2026-09-28T00:00:00.000Z", clientKey: `key-${i}`, kind: "event", title: `Private event ${(page-1)*pageSize+i}`, description: "", startsAt: url.searchParams.get("from"), endsAt: url.searchParams.get("to"), timezone: "UTC", allDay: false, status: url.searchParams.get("status") ?? "scheduled", taskId: null, projectId: null })), pagination: { page: malformed ? 99 : page, pageSize, total, totalPages: Math.ceil(total/pageSize) } });
  };
  async function mount(search = `?${range}`, count=43, initialFail?: number) {
    requests=[]; fail=initialFail; malformed=false; total=count; delay=false; resolveRead=undefined; signal=undefined;
    app=await mountAuthenticatedApp({ url: `https://app.test/calendar${search}`, role: "contributor", permissionMask: "0x100000", configureBrowser: browser => stubListViewport(browser, "mobile"), fetch: async (input, init) => {
      const url=new URL(String(input), "https://app.test");
      if(url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if(url.pathname === "/api/telemetry/pageview") return new Response(null,{status:204});
      if(url.pathname === "/api/notifications/summary") return Response.json({ unread: 0 });
      requests.push(url);
      if (fail) return apiError(fail, "UNAVAILABLE", true);
      if(delay && url.searchParams.get("page")==="2") {
        signal=init?.signal;
        const { promise, resolve } = Promise.withResolvers<Response>();
        resolveRead=()=>resolve(response(url));
        return promise;
      }
      return response(url);
    }});
    await waitForApp(()=>main()?.textContent?.includes("Private event") === true || main().textContent!.includes("Unable to load"));
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async()=>{node.click(); await new Promise(resolve=>setTimeout(resolve,0));}); }
  /** The list appends by scrolling its table container to the bottom. */
  async function scrollToEnd() {
    const scroller = main().querySelector("div.overflow-auto") as HTMLElement;
    expect(scroller).toBeTruthy();
    await act(async()=>{ scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new app!.browser.Event("scroll", { bubbles: true })); await new Promise(resolve=>setTimeout(resolve,0)); });
  }
  async function input(label: string, value: string) { await act(async()=> {const node=document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; const key=Object.keys(node).find(key=>key.startsWith("__reactProps$"))!; (node as unknown as Record<string, {onChange: (event: {currentTarget: {value: string}}) => void}>)[key]!.onChange(({ currentTarget: {value}, target: {value} }) as never);}); }
  const applyRange = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(n=>n.textContent==="Apply range")!;
  afterEach(async()=>{await app?.unmount(); app=undefined;});

  it("ignores a numbered deep link, keeps the absolute range and loads the first window", async () => {
    await mount(`?${range}&page=2`);
    expect(requests[0]?.searchParams.get("page")).toBe("1");
    expect(requests[0]?.searchParams.get("pageSize")).toBe("20");
    expect(requests[0]?.searchParams.get("from")).toBe(from);
    expect(main().textContent).toContain("Private event 0");
    expect(main().textContent).not.toContain("Private event 20");
    expect(new URLSearchParams(window.location.search).get("page")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("from")).toBe(from);
  });

  it("appends the next page on end-of-list without duplicating the first page", async () => {
    await mount();
    await scrollToEnd();
    await waitForApp(()=>main().textContent!.includes("Private event 20"));
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1","2"]);
    expect(main().textContent).toContain("Private event 0");
    expect(rows()).toHaveLength(40);
  });

  it("appends every remaining page and stops after the last one", async () => {
    await mount();
    await scrollToEnd(); await waitForApp(()=>main().textContent!.includes("Private event 20"));
    await scrollToEnd(); await waitForApp(()=>main().textContent!.includes("Private event 42"));
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1","2","3"]);
    const before = requests.length;
    await scrollToEnd();
    expect(requests).toHaveLength(before);
    expect(rows()).toHaveLength(43);
  });

  it("keeps the loaded window when an append fails and retries", async () => {
    await mount(); fail=500; await scrollToEnd();
    await waitForApp(()=>main().textContent!.includes("Unable to update the calendar."));
    expect(main().textContent).toContain("Private event 0");
    expect(rows()).toHaveLength(20);
    fail=undefined; await scrollToEnd();
    await waitForApp(()=>main().textContent!.includes("Private event 20"));
    expect(requests.at(-1)!.searchParams.get("page")).toBe("2");
  });

  it("clears old private rows on a failed initial load and retries the range", async () => {
    await mount(`?${range}`, 43, 500);
    await waitForApp(()=>main().textContent!.includes("Unable to load"));
    expect(main().textContent).not.toContain("Private event");
    fail=undefined;
    await click([...main().querySelectorAll<HTMLButtonElement>("button")].find(n=>n.textContent==="Try calendar again")!);
    await waitForApp(()=>main().textContent!.includes("Private event 0"));
    expect(requests.at(-1)!.searchParams.get("from")).toBe(from);
  });

  it("rejects malformed metadata on an append and keeps the loaded window", async () => {
    await mount(); malformed=true; await scrollToEnd();
    await waitForApp(()=>main().textContent!.includes("Unable to update the calendar."));
    expect(main().textContent).toContain("Private event 0");
  });

  it("aborts a superseded append when the range changes and ignores the late result", async () => {
    await mount(); delay=true; await scrollToEnd(); await waitForApp(()=>!!resolveRead);
    await act(async()=>{expect(writeWorkspaceHistory("push", "/calendar?from=2026-09-29T10:00:00.000Z&to=2026-09-30T10:00:00.000Z")).toBe("committed");});
    await waitForApp(()=>requests.at(-1)!.searchParams.get("from")==="2026-09-29T10:00:00.000Z");
    expect(signal?.aborted).toBe(true);
    await act(async()=>resolveRead!());
    expect(main().textContent).not.toContain("Private event 20");
  });

  it("normalizes invalid query and strips the cursor without promising a numbered page", async () => {
    await mount("?page=0&pageSize=21&from=bad&to=bad&cursor=old");
    const first=requests[0]!;
    expect(first.searchParams.get("page")).toBe("1");
    expect(first.searchParams.get("pageSize")).toBe("20");
    expect(new URLSearchParams(window.location.search).has("cursor")).toBe(false);
    expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
  });

  it("applies local range edits and restarts the window only on Apply", async () => {
    await mount(`?${range}&page=2`); const before=requests.length;
    await click(document.querySelector<HTMLButtonElement>("[data-calendar-range-trigger]")!);
    await input("Range start","2026-09-29T10:00"); await input("Range end (exclusive)","2026-09-30T10:00"); expect(requests.length).toBe(before);
    await click(applyRange());
    await waitForApp(()=>requests.at(-1)!.searchParams.get("from")===new Date("2026-09-29T10:00").toISOString());
    expect(requests.at(-1)!.searchParams.get("page")).toBe("1");
    expect(main().textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("rejects reversed or oversized range without a network read", async () => {
    await mount(); const before=requests.length;
    await click(document.querySelector<HTMLButtonElement>("[data-calendar-range-trigger]")!);
    await input("Range start","2026-09-30T10:00"); await input("Range end (exclusive)","2026-09-29T10:00");
    expect(applyRange().disabled).toBe(true); expect(requests.length).toBe(before);
  });

  it("aborts a pending append on route unmount and ignores the late result", async () => {
    await mount(); delay=true; await scrollToEnd(); await waitForApp(()=>!!resolveRead);
    await app!.unmount(); app=undefined;
    expect(signal?.aborted).toBe(true);
    await act(async()=>resolveRead!());
  });

  it("keeps the range filter across history navigation and restarts the window", async () => {
    await mount(`?${range}`);
    await act(async()=>{expect(writeWorkspaceHistory("push", "/calendar?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z")).toBe("committed");});
    await waitForApp(()=>requests.at(-1)!.searchParams.get("from")==="2026-10-01T00:00:00.000Z");
    expect(requests.at(-1)!.searchParams.get("page")).toBe("1");
    expect(main().textContent).toContain("Private event 0");
  });
});
