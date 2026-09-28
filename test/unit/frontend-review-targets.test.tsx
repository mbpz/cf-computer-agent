// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
import { extendedPayload } from "../helpers/workbench-extended-route-fixtures";
vi.mock("dompurify", () => ({default: {sanitize: (html: string) => html}}));
const base = extendedPayload("review") as any;
const task = {...base.completed[0], id:"task-1", title:"Snapshot task"};
const inbox = (extendedPayload("inbox") as any).items[0];
const project = (extendedPayload("projects") as any).items[0];
const snapshot = {...base, completed:Array.from({length:15}, (_,i) => ({...task,id:`task-${i+1}`})), inbox:[inbox], projects:[project]};
describe("review traceable member-private targets through App", () => {
  let app: MountedApp | undefined;
  let deny = 0, wrongId = false;
  let detail: (() => Promise<Response>) | undefined;
  let calls: {path:string; method:string; signal?:AbortSignal|null}[] = [];
  const main = () => app!.container.querySelector("main")!;
  const click = async (node: HTMLElement) => act(async () => node.click());
  const target = (kind: string) => main().querySelector<HTMLButtonElement>(`[data-review-target="${kind}"]`)!;
  const button = (text: string) => [...main().querySelectorAll<HTMLButtonElement>("button")].find(n => n.textContent === text)!;
  async function mount() {
    app = await mountAuthenticatedApp({url:"https://app.test/review", role:"contributor", permissionMask:"0x100000", fetch:async (input,init) => {
      const url = new URL(String(input), "https://app.test");
      calls.push({path:url.pathname+url.search, method:init?.method??"GET", signal:init?.signal});
      if (url.pathname === "/api/navigation") return Response.json({tree:currentNavigationFixture("contributor","0x100000")});
      if (url.pathname === "/api/telemetry/pageview") return new Response(null,{status:204});
      if (url.pathname === "/api/workbench/review") return Response.json(snapshot);
      if (url.pathname === "/api/tasks") return Response.json({items:[task],pagination:{page:1,pageSize:20,total:1,totalPages:1}});
      if (url.pathname === "/api/tasks/summary") return Response.json(base.taskSummary);
      if (url.pathname === "/api/inbox") return Response.json(extendedPayload("inbox"));
      if (url.pathname === "/api/projects") return Response.json(extendedPayload("projects"));
      if (["/api/tasks/task-1", `/api/inbox/${inbox.id}`, `/api/projects/${project.id}`].includes(url.pathname)) {
        if (detail) return detail();
        if (deny) return apiError(deny,"UNAVAILABLE",true);
        const row = url.pathname.includes("/tasks/") ? task : url.pathname.includes("/inbox/") ? inbox : project;
        const value = {...row,id:wrongId?"other":row.id,title:"Authorized title",content:"Authorized content"};
        return Response.json(row === task ? {task:value,tags:[],links:[]} : value);
      }
      throw new Error(`Unexpected ${url.pathname}`);
    }});
    await waitForApp(() => !!main().textContent?.includes("Snapshot task"));
  }
  afterEach(async () => {await app?.unmount(); app=undefined; calls=[]; deny=0; wrongId=false; detail=undefined;});
  it("labels sample counts, bounds lists and exposes every view-all filter", async () => {
    await mount();
    expect(main().textContent).toContain("Snapshot counts are not totals");
    expect(main().querySelectorAll('[data-review-target="task"]')).toHaveLength(10);
    for (const [kind,href] of Object.entries({completed:"/tasks?status=done&page=1&pageSize=20",overdue:"/tasks?due=overdue&page=1&pageSize=20",blocked:"/tasks?status=blocked&page=1&pageSize=20",inbox:"/inbox?status=inbox&page=1&pageSize=20",projects:"/projects?status=active&page=1&pageSize=20"})) {
      expect(main().querySelector(`a[data-review-all="${kind}"]`)?.getAttribute("href")).toBe(href);
    }
  });
  it.each(["completed","overdue","blocked","inbox","projects"])("opens %s through its real paginated route", async kind => {
    await mount(); await click(main().querySelector<HTMLAnchorElement>(`[data-review-all="${kind}"]`)!);
    const path = ["inbox","projects"].includes(kind) ? kind : "tasks";
    await waitForApp(() => calls.some(c => c.path.startsWith(`/api/${path}?`)));
    expect(app!.browser.location.pathname).toBe(`/${path}`);
    const url = new URL(calls.find(c => c.path.startsWith(`/api/${path}?`))!.path,"https://app.test");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get(kind === "overdue" ? "due" : "status")).toBe(({completed:"done",overdue:"overdue",blocked:"blocked",inbox:"inbox",projects:"active"} as any)[kind]);
  });
  it.each(["task","inbox","project"])("re-authorizes %s and renders only a matching live receipt", async kind => {
    await mount(); await click(target(kind)); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes("Authorized"));
    expect(main().querySelector('[role="dialog"]')!.textContent).not.toContain("Snapshot");
    expect(calls.filter(c => !c.path.includes("telemetry")).every(c => c.method === "GET")).toBe(true);
  });
  it.each(["task","inbox","project"])("does not use cached %s content for missing targets and supports exact retry", async kind => {
    await mount(); deny=404; await click(target(kind)); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes("Unable to load"));
    expect(main().querySelector('[role="dialog"]')!.textContent).not.toContain("Snapshot");
    deny=0; await click(button("Retry detail")); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes("Authorized"));
  });
  it.each(["task","inbox","project"])("rejects mismatched %s target identity", async kind => {
    await mount(); wrongId=true; await click(target(kind)); await waitForApp(() => !!main().querySelector('[role="dialog"]')?.textContent?.includes("Unable to load"));
    expect(main().querySelector('[role="dialog"]')!.textContent).not.toContain("Authorized");
  });
  it.each([401,403])("clears snapshot and detail on permission denial %i", async status => {
    await mount(); deny=status; await click(target("task")); await waitForApp(() => !!main().textContent?.includes("Unable to load"));
    expect(main().querySelector('[role="dialog"]')).toBeNull(); expect(main().textContent).not.toContain("Snapshot task");
  });
  it("aborts a closed detail and ignores its late private response", async () => {
    let resolve!: (r:Response) => void; detail=() => new Promise(done => {resolve=done;});
    await mount(); await click(target("task")); await waitForApp(() => !!resolve);
    const read = calls.find(c => c.path === "/api/tasks/task-1")!;
    await click(button("Close detail")); expect(read.signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({task:{...task,title:"Late private content"},tags:[],links:[]})));
    await waitForApp(() => true);
    expect(main().querySelector('[role="dialog"]')).toBeNull(); expect(main().textContent).not.toContain("Late private content");
  });
});
