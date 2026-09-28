// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadWorkbenchReview } from "../../frontend/lib/workbench-review-data";
import { loadNumberedProjects } from "../../frontend/lib/projects-data";
import { extendedPayload } from "../helpers/workbench-extended-route-fixtures";
const receipt = () => ({...extendedPayload("review"), from: "2026-09-13T00:00:00.000Z", to: "2026-09-14T00:00:00.000Z"}) as any;
const load = (value: unknown) => loadWorkbenchReview("daily", async () => Response.json(value));
describe("review fail-closed snapshot contract", () => {
  it("keeps a valid bounded receipt", async () => { expect((await load(receipt())).completed[0]?.id).toBe("review-first"); });
  it.each([
    ["2026-W38", "2026-09-07T00:00:00.000Z", "2026-09-14T00:00:00.000Z"],
    ["2026-W37", "2026-09-08T00:00:00.000Z", "2026-09-15T00:00:00.000Z"],
  ])("rejects a weekly key or boundary mismatch %s %s", async (periodKey,from,to) => {
    await expect(loadWorkbenchReview("weekly",async () => Response.json({...receipt(),period:"weekly",periodKey,from,to}))).rejects.toThrow("REVIEW_RESPONSE_INVALID");
  });
  it.each([
    ["missing row id", (r: any) => { delete r.completed[0].id; }],
    ["unsafe target id", (r: any) => { r.completed[0].id = "../other"; }],
    ["nested malformed task", (r: any) => { r.completed[0].progress = 101; }],
    ["wrong task category", (r: any) => { r.completed[0].status = "todo"; }],
    ["duplicate rows", (r: any) => { r.completed.push(r.completed[0]); }],
    ["unbounded rows", (r: any) => { r.completed = Array.from({length:21}, (_,i) => ({...r.completed[0],id:`task-${i}`})); }],
    ["invalid summary", (r: any) => { r.taskSummary.done = -1; }],
    ["fractional elapsed", (r: any) => { r.focusElapsedMs = 0.5; }],
    ["invalid inbox", (r: any) => { r.inbox = [{id:"x"}]; }],
    ["invalid project", (r: any) => { r.projects = [{id:"x"}]; }],
    ["invalid dates", (r: any) => { r.from = "invalid"; }],
    ["reversed dates", (r: any) => { r.to = r.from; }],
    ["wrong daily key", (r: any) => { r.periodKey = "2026-09-12"; }],
  ])("rejects %s without retaining a partial snapshot", async (_, mutate) => {
    const r = receipt(); (mutate as (value: any) => void)(r);
    await expect(load(r)).rejects.toThrow("REVIEW_RESPONSE_INVALID");
  });
});

describe("review project view-all filter contract", () => {
  it("rejects an invalid status before making a request", async () => {
    let called = false;
    await expect(loadNumberedProjects({page:1,pageSize:20,status:"invalid"},async () => {called=true;return Response.json({});})).rejects.toThrow("PROJECT_STATUS_INVALID");
    expect(called).toBe(false);
  });
  it("rejects a mismatched category instead of displaying unfiltered projects", async () => {
    const payload = extendedPayload("projects") as any; payload.items[0].status = "archived";
    await expect(loadNumberedProjects({page:1,pageSize:20,status:"active"},async () => Response.json(payload))).rejects.toThrow();
  });
});
