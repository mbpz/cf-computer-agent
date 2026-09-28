// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadToday } from "../../frontend/lib/today-data";
const now = "2026-09-28T10:00:00.000Z";
function valid(): any {
  const common = {id: "row-1", clientKey: "key-1", createdAt: now, updatedAt: now};
  return {date: "2026-09-28", tasks: {items: [{id: "task-1", title: "Task", notes: "", status: "todo", progress: 0, priority: "medium", dueAt: now, completedAt: null, createdAt: now, updatedAt: now}], pagination: {page: 1, pageSize: 20, total: 1, totalPages: 1}}, taskSummary: {todo: 1, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 1, overdue: 0}, inbox: [{...common, kind: "text", content: "Capture", sourceUrl: null, status: "inbox", promotedTaskId: null, promotedSubmissionId: null}], projects: [{...common, title: "Project", description: null, status: "active", progress: 0, targetAt: null}], calendar: [{...common, kind: "event", title: "Event", description: "", startsAt: now, endsAt: "2026-09-28T11:00:00.000Z", timezone: "UTC", allDay: false, status: "scheduled", taskId: null, projectId: null}]};
}
const read = (value: unknown) => loadToday(async () => Response.json(value));
describe("Today strict snapshot contract", () => {
  it("preserves valid complete data and legitimate empty zero snapshots", async () => {
    const data = valid(); delete data.calendar[0].createdAt; expect(await read(data)).toEqual(data);
    data.tasks.items = []; data.tasks.pagination = {page: 1, pageSize: 20, total: 0, totalPages: 0};
    for (const key of Object.keys(data.taskSummary)) data.taskSummary[key] = 0;
    data.inbox = []; data.projects = []; data.calendar = [];
    expect(await read(data)).toEqual(data);
  });
  it.each([
    ["invalid date", (v: any) => {v.date = "2026-02-30";}],
    ["non date key", (v: any) => {v.date = now;}],
    ["null tasks", (v: any) => {v.tasks = null;}],
    ["missing pagination", (v: any) => {delete v.tasks.pagination;}],
    ["wrong page", (v: any) => {v.tasks.pagination.page = 2;}],
    ["wrong page size", (v: any) => {v.tasks.pagination.pageSize = 50;}],
    ["wrong total", (v: any) => {v.tasks.pagination.total = 2;}],
    ["duplicate task", (v: any) => {v.tasks.items.push(v.tasks.items[0]);v.tasks.pagination.total = 2;}],
    ["task empty id", (v: any) => {v.tasks.items[0].id = "";}],
    ["task wrong title", (v: any) => {v.tasks.items[0].title = {};}],
    ["task bad notes", (v: any) => {v.tasks.items[0].notes = null;}],
    ["task invalid status", (v: any) => {v.tasks.items[0].status = "oops";}],
    ["task array status", (v: any) => {v.tasks.items[0].status = ["todo"];}],
    ["task array priority", (v: any) => {v.tasks.items[0].priority = ["medium"];}],
    ["task invalid priority", (v: any) => {v.tasks.items[0].priority = "oops";}],
    ["task invalid progress", (v: any) => {v.tasks.items[0].progress = 101;}],
    ["task wrong day", (v: any) => {v.tasks.items[0].dueAt = "2026-09-29T00:00:00.000Z";}],
    ["task invalid version", (v: any) => {v.tasks.items[0].updatedAt = "today";}],
    ["summary missing field", (v: any) => {delete v.taskSummary.blocked;}],
    ["summary string", (v: any) => {v.taskSummary.todo = "1";}],
    ["summary negative", (v: any) => {v.taskSummary.done = -1;}],
    ["summary fractional", (v: any) => {v.taskSummary.overdue = 0.1;}],
    ["summary overflow", (v: any) => {v.taskSummary.todo = Number.MAX_SAFE_INTEGER;v.taskSummary.doing = 1;}],
    ["calendar object", (v: any) => {v.calendar = {};}],
    ["calendar missing field", (v: any) => {delete v.calendar[0].updatedAt;}],
    ["calendar invalid range", (v: any) => {v.calendar[0].endsAt = v.calendar[0].startsAt;}],
    ["calendar invalid timezone", (v: any) => {v.calendar[0].timezone = "Invalid/Moon";}],
    ["calendar outside day", (v: any) => {v.calendar[0].startsAt = "2026-09-29T00:00:00.000Z";v.calendar[0].endsAt = "2026-09-29T01:00:00.000Z";}],
    ["calendar overflow", (v: any) => {v.calendar = Array.from({length: 21}, (_, i) => ({...v.calendar[0], id: `e-${i}`}));}],
    ["calendar duplicate", (v: any) => {v.calendar.push(v.calendar[0]);}],
    ["inbox null", (v: any) => {v.inbox = null;}],
    ["inbox wrong kind", (v: any) => {v.inbox[0].kind = "wrong";}],
    ["inbox wrong status", (v: any) => {v.inbox[0].status = "archived";}],
    ["inbox wrong content", (v: any) => {v.inbox[0].content = [];}],
    ["inbox bad source", (v: any) => {v.inbox[0].sourceUrl = 1;}],
    ["inbox invalid date", (v: any) => {v.inbox[0].createdAt = null;}],
    ["inbox overflow", (v: any) => {v.inbox = Array.from({length: 11}, (_, i) => ({...v.inbox[0], id: `i-${i}`}));}],
    ["project null", (v: any) => {v.projects = null;}],
    ["project wrong status", (v: any) => {v.projects[0].status = "paused";}],
    ["project wrong progress", (v: any) => {v.projects[0].progress = -1;}],
    ["project invalid target", (v: any) => {v.projects[0].targetAt = "later";}],
    ["project wrong description", (v: any) => {v.projects[0].description = [];}],
    ["project duplicate", (v: any) => {v.projects.push(v.projects[0]);}],
  ])("rejects %s without substituting zero or dropping bad rows", async (_name, mutate) => {
    const data = valid(); (mutate as (value: any) => void)(data); await expect(read(data)).rejects.toThrow();
  });
  it.each([401,403,500])("preserves HTTP %i rather than returning empty metrics", async status => {
    await expect(loadToday(async () => new Response("", {status}))).rejects.toMatchObject({status});
  });
  it("forwards abort to the read-only request", async () => {
    const request = vi.fn(async () => Response.json(valid())); const controller = new AbortController();
    await loadToday(request, controller.signal); expect(request).toHaveBeenCalledWith("/api/today", expect.objectContaining({signal: controller.signal, credentials: "same-origin"}));
  });
});
