// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const from = "2026-09-28T00:00:00.000Z", to = "2026-09-29T00:00:00.000Z";
const range = `from=${from}&to=${to}`;
describe("calendar numbered range through App", () => {
  let app: MountedApp | undefined, requests: URL[], fail: number | undefined, malformed = false, total = 43;
  let delay = false, resolveRead: (() => void) | undefined, signal: AbortSignal | null | undefined;
  const main = () => app!.container.querySelector("main")!;
  const button = (label: string) => main().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
  const response = (url: URL) => {
    const page = Number(url.searchParams.get("page") ?? 1), pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    return Response.json({ items: Array.from({ length: Math.max(0,Math.min(pageSize, total-(page-1)*pageSize)) }, (_, i) => ({ id: `event-${(page-1)*pageSize+i}`, clientKey: `key-${i}`, kind: "event", title: `Private event ${(page-1)*pageSize+i}`, description: "", startsAt: url.searchParams.get("from"), endsAt: url.searchParams.get("to"), timezone: "UTC", allDay: false, status: url.searchParams.get("status") ?? "scheduled", taskId: null, projectId: null })), pagination: { page: malformed ? 99 : page, pageSize, total, totalPages: Math.ceil(total/pageSize) } });
  };
  async function mount(search = `?${range}`, count=43) {
    requests=[]; fail=undefined; malformed=false; total=count; delay=false; resolveRead=undefined; signal=undefined;
    app=await mountAuthenticatedApp({ url: `https://app.test/calendar${search}`, role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url=new URL(String(input), "https://app.test");
      if(url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if(url.pathname === "/api/telemetry/pageview") return new Response(null,{status:204});
      requests.push(url);
      if(delay && url.searchParams.get("page")==="2") { signal=init?.signal; return new Promise<Response>(resolve => { resolveRead=()=>resolve(response(url)); }); }
      return fail ? apiError(fail,"UNAVAILABLE",true) : response(url);
    }});
    await waitForApp(()=>main()?.textContent?.includes("Private event")===true);
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async()=>{node.click(); await new Promise(resolve=>setTimeout(resolve,0));}); }
  async function navigate(search: string) { await act(async()=>{window.history.pushState({},"",`/calendar${search}`); window.dispatchEvent(new app!.browser.PopStateEvent("popstate"));}); }
  async function input(label: string, value: string) { await act(async()=> {const node=main().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; const key=Object.keys(node).find(key=>key.startsWith("__reactProps$"))!; (node as unknown as Record<string, {onChange: (event: {currentTarget: {value: string}}) => void}>)[key]!.onChange({currentTarget:{value}});}); }
  afterEach(async()=>{await app?.unmount(); app=undefined;});
  it("restores range and page deep link, replaces rows, persists absolute range",async()=>{
    await mount(`?${range}&page=2`); expect(requests[0]?.searchParams.get("page")).toBe("2"); expect(requests[0]?.searchParams.get("from")).toBe(from);
    expect(main().textContent).toContain("Private event 20"); expect(main().textContent).not.toContain("Private event 0");
    await click(button("Page 3")); await waitForApp(()=>main().textContent!.includes("Private event 40"));
    expect(main().textContent).not.toContain("Private event 20"); expect(new URLSearchParams(window.location.search).get("page")).toBe("3"); expect(new URLSearchParams(window.location.search).get("to")).toBe(to);
  });
  it.each([50,100])("resets page when selecting size %i",async size=>{
    await mount(`?${range}&page=2`); await act(async()=>{const select=main().querySelector<HTMLSelectElement>('select[aria-label="Rows per page"]')!; select.value=String(size); select.dispatchEvent(new app!.browser.Event("change",{bubbles:true}));});
    await waitForApp(()=>requests.some(url=>url.searchParams.get("pageSize")===String(size)) && main().textContent!.includes("Private event 0"));
    expect(requests.at(-1)!.searchParams.get("page")).toBe("1"); expect(requests.at(-1)!.searchParams.get("from")).toBe(from);
  });
  it("normalizes invalid query and keeps range stable through retry",async()=>{
    await mount("?page=0&pageSize=21&from=bad&to=bad&cursor=old"); const first=requests[0]!;
    expect(first.searchParams.get("page")).toBe("1"); expect(first.searchParams.get("pageSize")).toBe("20"); expect(new URLSearchParams(window.location.search).has("cursor")).toBe(false);
    fail=500; await navigate(`${window.location.search}&status=canceled`); await waitForApp(()=>main().textContent!.includes("Unable to load"));
    fail=undefined; await click([...main().querySelectorAll<HTMLButtonElement>("button")].find(n=>n.textContent==="Try calendar again")!); await waitForApp(()=>main().textContent!.includes("Private event"));
    expect(requests.at(-1)!.searchParams.get("from")).toBe(first.searchParams.get("from"));
  });
  it.each([401,403,500])("clears old private rows on read failure %i and retries requested page",async status=>{
    await mount(); fail=status; await navigate(`?${range}&page=2`); await waitForApp(()=>main().textContent!.includes("Unable to load")); expect(main().textContent).not.toContain("Private event");
    fail=undefined; await click([...main().querySelectorAll<HTMLButtonElement>("button")].find(n=>n.textContent==="Try calendar again")!); await waitForApp(()=>main().textContent!.includes("Private event 20"));
  });
  it("ignores and aborts an old page even if requester resolves after history navigation",async()=>{
    await mount(); delay=true; await click(button("Page 2")); await waitForApp(()=>!!resolveRead); await navigate(`?${range}&page=3`); await waitForApp(()=>main().textContent!.includes("Private event 40"));
    expect(signal?.aborted).toBe(true); await act(async()=>resolveRead!()); expect(main().textContent).not.toContain("Private event 20");
  });
  it("rejects malformed metadata rather than displaying rows",async()=>{
    await mount(); malformed=true; await navigate(`?${range}&page=2`); await waitForApp(()=>main().textContent!.includes("Unable to load")); expect(main().textContent).not.toContain("Private event");
  });
  it("keeps an empty beyond-last page navigable",async()=>{
    await mount(); total=1; await navigate(`?${range}&page=3`); await waitForApp(()=>main().textContent!.includes("No events")); expect(new URLSearchParams(window.location.search).get("page")).toBe("3"); expect(main().querySelector("[data-pagination-mobile]")?.textContent).toContain("3 / 1");
    await click(button("Page 1")); await waitForApp(()=>main().textContent!.includes("Private event 0"));
  });
  it("limits navigation to query window without truncating the total",async()=>{
    await mount(`?${range}&page=500`,10021); expect(main().textContent).toContain("10021"); expect(button("Page 502").disabled).toBe(true);
  });
  it("applies local range edits and resets pagination only on Apply",async()=>{
    await mount(`?${range}&page=2`); const before=requests.length;
    await input("Range start","2026-09-29T10:00"); await input("Range end (exclusive)","2026-09-30T10:00"); expect(requests.length).toBe(before);
    await click([...main().querySelectorAll<HTMLButtonElement>("button")].find(n=>n.textContent==="Apply range")!);
    await waitForApp(()=>requests.at(-1)!.searchParams.get("from")===new Date("2026-09-29T10:00").toISOString());
    expect(requests.at(-1)!.searchParams.get("page")).toBe("1"); expect(main().textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
  it("rejects reversed or oversized range without a network read",async()=>{
    await mount(); const before=requests.length; await input("Range start","2026-09-30T10:00"); await input("Range end (exclusive)","2026-09-29T10:00");
    const apply=[...main().querySelectorAll<HTMLButtonElement>("button")].find(n=>n.textContent==="Apply range")!; expect(apply.disabled).toBe(true); expect(requests.length).toBe(before);
  });
  it("aborts pending calendar reads on route unmount", async () => {
    await mount(); delay=true; await click(button("Page 2")); await waitForApp(()=>!!resolveRead);
    await app!.unmount(); app=undefined;
    expect(signal?.aborted).toBe(true);
    await act(async()=>resolveRead!());
  });
  it("restores range and page on history navigation without stale range rows", async () => {
    await mount(`?${range}&page=2`);
    await navigate("?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z&page=1");
    await waitForApp(()=>main().textContent!.includes("Private event 0"));
    expect(requests.at(-1)!.searchParams.get("from")).toBe("2026-10-01T00:00:00.000Z");
    await navigate(`?${range}&page=2`);
    await waitForApp(()=>main().textContent!.includes("Private event 20"));
    expect(requests.at(-1)!.searchParams.get("from")).toBe(from);
    expect(requests.at(-1)!.searchParams.get("page")).toBe("2");
  });
});
