// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
const from="2026-09-28T00:00:00.000Z", to="2026-09-29T00:00:00.000Z";
describe("calendar creation and cancellation through App", () => {
  let app: MountedApp | undefined, event: any, posts: any[], deletes: any[], failPost=false, failDelete=false, failRead=false, failList=false, denyPost=0, denyRead=0, denyList=0;
  const main=()=>app!.container.querySelector("main")!;
  const button=(text:string)=>[...main().querySelectorAll<HTMLButtonElement>("button")].find(n=>n.textContent===text)!;
  const click=async(node:HTMLElement)=>act(async()=>node.click());
  async function input(label:string,value:string) { await act(async()=>{const node=main().querySelector(`input[aria-label="${label}"]`)!; const props=Object.keys(node).find(k=>k.startsWith("__reactProps$"))!; (node as any)[props].onChange({currentTarget:{value}});}); }
  async function mount(recovery?: Record<string,string>) {
    app=await mountAuthenticatedApp({ url:`https://app.test/calendar?from=${from}&to=${to}`,role:"contributor",permissionMask:"0x100000",configureBrowser:browser=>{for(const [key,value] of Object.entries(recovery??{})) browser.sessionStorage.setItem(key,value);},fetch:async(input,init)=>{
      const url=new URL(String(input),"https://app.test"), method=init?.method??"GET";

      if(url.pathname==="/api/navigation")return Response.json({tree:currentNavigationFixture("contributor","0x100000")});
      if(url.pathname==="/api/notifications/summary")return Response.json({unread:0});
      if(url.pathname==="/api/telemetry/pageview")return Response.json({});
      if(url.pathname==="/api/calendar/events" && method==="POST") {
        const body=JSON.parse(String(init!.body)); posts.push(body);
        if(denyPost)return apiError(denyPost,"DENIED","Denied");
        if(!event)event={...body,description:"",kind:"event",allDay:false,status:"scheduled",taskId:null,projectId:null,updatedAt:from};
        if(failPost)throw new TypeError("Lost response");
        return Response.json({event,created:posts.length===1});
      }
      if(url.pathname.startsWith("/api/calendar/events/")) {
        if(method==="DELETE") {deletes.push(JSON.parse(String(init!.body)));event={...event,status:"canceled",updatedAt:to};if(failDelete)throw new TypeError("Lost response");return Response.json(event);}
        if(denyRead)return apiError(denyRead,"DENIED","Denied");
        if(failRead)return apiError(500,"READ_FAILED","Read failed");
        return Response.json(event);
      }
      if(url.pathname==="/api/calendar/events") {
        if(denyList)return apiError(denyList,"DENIED","Denied");
        if(failList)return apiError(500,"READ_FAILED","Read failed");
        return Response.json({items:event?[event]:[],pagination:{page:1,pageSize:20,total:event?1:0,totalPages:event?1:0}});
      }
      throw new Error(`Unexpected ${method} ${url}`);
    }});
    await waitForApp(()=>!!button("Add event") || !!main().querySelector("[data-create-retry], [data-create-read-retry], [data-create-storage-retry], [data-planning-write-recover]"));
    await waitForApp(()=>!main().querySelector('[aria-busy="true"]'));
  }
  async function draft(){await input("Event title","A stable event");await input("Starts","2026-09-28T10:00");await input("Ends","2026-09-28T11:00");}
  afterEach(async()=>{await app?.unmount();app=undefined;vi.unstubAllGlobals();event=undefined;posts=[];deletes=[];failPost=failDelete=failRead=failList=false;denyPost=denyRead=denyList=0;});
  it("rejects reversed times locally without clearing the draft or POSTing",async()=>{posts=[];await mount();await draft();await input("Ends","2026-09-28T09:00");await click(button("Add event"));expect(posts).toHaveLength(0);expect((main().querySelector('input[aria-label="Event title"]') as HTMLInputElement).value).toBe("A stable event");});
  it("retries the same immutable intent after a lost response and double click",async()=>{
    posts=[];failPost=true;await mount();await draft();await act(async()=>{button("Add event").click();button("Add event").click();});
    await waitForApp(()=>!!main().querySelector("[data-create-retry]"));expect(posts).toHaveLength(1);
    failPost=false;await click(main().querySelector("[data-create-retry]")!);await waitForApp(()=>posts.length===2 && !!button("Add event"));
    expect(posts[1]).toEqual(posts[0]);expect((main().querySelector('input[aria-label="Event title"]') as HTMLInputElement).value).toBe("");
  });
  it("keeps acknowledged creation GET-only after read failure",async()=>{
    posts=[];failRead=true;await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector("[data-create-read-retry]"));
    expect(posts).toHaveLength(1);failRead=false;await click(main().querySelector("[data-create-read-retry]")!);await waitForApp(()=>!!button("Add event") || !!main().querySelector("[data-create-retry], [data-create-read-retry], [data-create-storage-retry], [data-planning-write-recover]"));expect(posts).toHaveLength(1);
  });
  it("requires confirmation and recovers a lost cancel response without replaying DELETE",async()=>{
    posts=[];deletes=[];await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    await click(main().querySelector('[aria-label="Cancel event"]')!);expect(deletes).toHaveLength(0);expect(main().querySelector('[role="alertdialog"]')).not.toBeNull();
    await click(button("Keep event"));expect(deletes).toHaveLength(0);
    await click(main().querySelector('[aria-label="Cancel event"]')!);failDelete=true;const confirm=button("Confirm cancellation");await act(async()=>{confirm.click();confirm.click();});await waitForApp(()=>!!main().querySelector("[data-planning-write-recover]"));
    expect(deletes).toEqual([{expectedUpdatedAt:from}]);failDelete=false;await click(main().querySelector("[data-planning-write-recover]")!);
    await waitForApp(()=>!main().querySelector("[data-planning-write-recover]"));expect(deletes).toHaveLength(1);expect(main().querySelector('[aria-label="Cancel event"]')).toBeNull();
  });
  const cancelJournal="memory-garden:planning-write:v1:contributor-route-auditor:CALENDAR";
  async function navigate(path:string) { await act(async()=>{expect(writeWorkspaceHistory("push",path)).toBe("committed");}); }
  it("keeps cancellation write-free and journal-free on dismiss and route exit",async()=>{
    posts=[];deletes=[];await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    const trigger=main().querySelector<HTMLElement>('[aria-label="Cancel event"]')!;trigger.focus();await click(trigger);
    expect(document.activeElement?.textContent).toBe("Keep event");expect(window.sessionStorage.getItem(cancelJournal)).toBeNull();
    await click(button("Keep event"));expect(document.activeElement).toBe(trigger);expect(deletes).toHaveLength(0);
    await click(trigger);const old=button("Confirm cancellation");await navigate("/unknown");await click(old);
    expect(deletes).toHaveLength(0);expect(window.sessionStorage.getItem(cancelJournal)).toBeNull();
    await navigate(`/calendar?from=${from}&to=${to}`);await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    expect(main().querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("revokes a confirmation across external range navigation without creating a write journal",async()=>{
    posts=[];deletes=[];await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    await click(main().querySelector('[aria-label="Cancel event"]')!);const old=button("Confirm cancellation");
    await navigate(`/calendar?from=${from}&to=2026-09-30T00:00:00.000Z`);await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    await click(old);expect(main().querySelector('[role="alertdialog"]')).toBeNull();expect(deletes).toHaveLength(0);expect(window.sessionStorage.getItem(cancelJournal)).toBeNull();
    await navigate(`/calendar?from=${from}&to=${to}`);await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));expect(main().querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("blocks a same-tick new event behind cancellation without persisting another create intent",async()=>{
    posts=[];deletes=[];await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    await draft();const trigger=main().querySelector<HTMLElement>('[aria-label="Cancel event"]')!;const add=button("Add event");expect(add.disabled).toBe(false);
    await act(async()=>{trigger.click();add.click();});expect(posts).toHaveLength(1);expect(deletes).toHaveLength(0);
    expect(window.sessionStorage.getItem("memory-garden:calendar-create:v1:contributor-route-auditor")).toBeNull();expect(window.sessionStorage.getItem(cancelJournal)).toBeNull();
    await click(button("Keep event"));expect((main().querySelector('input[aria-label="Event title"]') as HTMLInputElement).value).toBe("A stable event");expect(button("Add event").disabled).toBe(false);
  });
  async function remount() {
    const storage=window.sessionStorage, saved:Record<string,string>={};
    for(let i=0;i<storage.length;i++){const key=storage.key(i)!;saved[key]=storage.getItem(key)!;}
    await app!.unmount();app=undefined;await mount(saved);
  }
  it("restores the exact pending intent after remount without an automatic POST",async()=>{
    posts=[];failPost=true;await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector("[data-create-retry]"));
    await remount();expect(posts).toHaveLength(1);expect((main().querySelector('input[aria-label="Event title"]') as HTMLInputElement).disabled).toBe(true);
    failPost=false;await click(main().querySelector("[data-create-retry]")!);await waitForApp(()=>!!button("Add event"));expect(posts[1]).toEqual(posts[0]);
  });
  it("restores acknowledgment across remount and retries only GET after a list failure",async()=>{
    posts=[];await mount();await draft();failList=true;await click(button("Add event"));await waitForApp(()=>!!main().querySelector("[data-create-read-retry]"));
    failList=false;await remount();expect(posts).toHaveLength(1);expect(main().querySelector("[data-create-retry]")).toBeNull();await click(main().querySelector("[data-create-read-retry]")!);await waitForApp(()=>!!button("Add event"));expect(posts).toHaveLength(1);
  });
  it("blocks POST when the recovery journal is malformed",async()=>{
    posts=[];await mount({"memory-garden:calendar-create:v1:contributor-route-auditor":"broken"});
    expect(main().querySelector("[data-create-storage-retry]")).not.toBeNull();expect(posts).toHaveLength(0);expect((main().querySelector('input[aria-label="Event title"]') as HTMLInputElement).disabled).toBe(true);
  });
  it.each([401,403])("clears private draft and rows after creation denial %i",async status=>{
    posts=[];await mount();await draft();denyPost=status;await click(button("Add event"));await waitForApp(()=>main().textContent!.includes("Unable to load"));
    expect(main().querySelector('input[aria-label="Event title"]')).toBeNull();expect(main().textContent).not.toContain("A stable event");
  });
  it("restores cancel recovery after remount and does not issue another DELETE",async()=>{
    posts=[];deletes=[];await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    await click(main().querySelector('[aria-label="Cancel event"]')!);failDelete=true;await click(button("Confirm cancellation"));await waitForApp(()=>!!main().querySelector("[data-planning-write-recover]"));
    await remount();expect(deletes).toHaveLength(1);await click(main().querySelector("[data-planning-write-recover]")!);await waitForApp(()=>!main().querySelector("[data-planning-write-recover]"));expect(deletes).toHaveLength(1);
  });
  it("keeps cancel recovery locked if the item read is forbidden",async()=>{
    posts=[];deletes=[];await mount();await draft();await click(button("Add event"));await waitForApp(()=>!!main().querySelector('[aria-label="Cancel event"]'));
    await click(main().querySelector('[aria-label="Cancel event"]')!);failDelete=true;await click(button("Confirm cancellation"));await waitForApp(()=>!!main().querySelector("[data-planning-write-recover]"));
    denyRead=404;await click(main().querySelector("[data-planning-write-recover]")!);expect(main().querySelector("[data-planning-write-recover]")).not.toBeNull();expect(deletes).toHaveLength(1);
  });

});
