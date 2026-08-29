import { describe, expect, it } from "vitest";
import { createTask, createTasksRequestController, deleteTask, loadTaskSummary, loadTasks } from "../../frontend/lib/tasks-data";
import { dueInfo, taskPriorityKey, taskStatusKey } from "../../frontend/pages/tasks/tasks-model";

function fetchJson(payload: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("tasks data layer", () => {
  it("loads a normalized page and summary", async () => {
    const page = await loadTasks({}, { page: 1, pageSize: 20 }, fetchJson({ items: [{ id: "task-1", title: "Alpha", status: "doing", progress: 40, priority: "high", dueAt: "2026-08-26T00:00:00.000Z" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    expect(page.items[0]).toMatchObject({ id: "task-1", status: "doing", priority: "high", progress: 40 });
    expect(page.pagination.total).toBe(1);
    const summary = await loadTaskSummary(fetchJson({ todo: 1, doing: 2, blocked: 0, done: 3, canceled: 0, dueToday: 1, overdue: 0 }));
    expect(summary.doing).toBe(2);
  });

  it("serializes all filters with numbered pagination and an abort signal", async () => {
    const requester = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/tasks?page=2&pageSize=50&status=doing&priority=high&tag=urgent&due=today&q=alpha");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ items: [], pagination: { page: 2, pageSize: 50, total: 1, totalPages: 1 } });
    }) as unknown as typeof fetch;
    const result = await loadTasks({ status: "doing", priority: "high", tag: "urgent", due: "today", q: "alpha" }, { page: 2, pageSize: 50 }, requester, new AbortController().signal);
    expect(result.pagination.page).toBe(2);
  });

  it("aborts the previous task page request and invalidates its generation", async () => {
    const requester = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as unknown as typeof fetch;
    const controller = createTasksRequestController(requester);
    const first = controller.request({ filters: {}, page: 1, pageSize: 20 });
    const second = controller.request({ filters: {}, page: 2, pageSize: 20 });
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.dispose();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("creates with a client-generated idempotency key", async () => {
    let capturedBody = "";
    const requester = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ task: { id: "task-1", title: "Alpha", status: "todo", progress: 0, priority: "medium", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" }, created: true }), { status: 201 });
    }) as unknown as typeof fetch;
    const result = await createTask({ title: "Alpha" }, requester);
    expect(result.task.title).toBe("Alpha");
    const body = JSON.parse(capturedBody) as { id: unknown };
    expect(typeof body.id).toBe("string");
    expect(body.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
  });

  it("treats a 404 on delete as success", async () => {
    const gone = (async () => new Response(null, { status: 404, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    await expect(deleteTask("task-gone", gone)).resolves.toBeUndefined();
    const error = (async () => new Response(JSON.stringify({ error: { code: "TASK_NOT_FOUND", message: "x", retryable: false } }), { status: 500 })) as unknown as typeof fetch;
    await expect(deleteTask("task-broken", error)).rejects.toMatchObject({ status: 500 });
  });
});

describe("tasks model", () => {
  it("maps status and priority to i18n keys", () => {
    expect(taskStatusKey("todo")).toBe("TASKS_STATUS_TODO");
    expect(taskStatusKey("canceled")).toBe("TASKS_STATUS_CANCELED");
    expect(taskPriorityKey("high")).toBe("TASKS_PRIORITY_HIGH");
  });

  it("classifies due dates relative to today", () => {
    const today = new Date("2026-08-27T12:00:00.000Z");
    expect(dueInfo("2026-08-26T00:00:00.000Z", "todo", today).kind).toBe("overdue");
    expect(dueInfo("2026-08-27T23:00:00.000Z", "doing", today).kind).toBe("today");
    expect(dueInfo("2026-08-27T23:00:00.000Z", "done", today).kind).toBe("none");
    expect(dueInfo(null, "todo", today).kind).toBe("none");
    expect(dueInfo("2026-09-01T00:00:00.000Z", "todo", today).kind).toBe("later");
  });
});
