import { describe, expect, it } from "vitest";
import { nextSubtaskPosition, createTask, createTasksRequestController, deleteTask, loadTaskDetail, setTaskStatus, setTaskProgress, updateTask, addTaskLink, removeTaskLink, loadTaskSummary, loadTasks } from "../../frontend/lib/tasks-data";
import { dueInfo, taskPriorityKey, taskStatusKey } from "../../frontend/pages/tasks/tasks-model";

function fetchJson(payload: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("tasks data layer", () => {
  it("loads a normalized page and summary", async () => {
    const page = await loadTasks({}, { page: 1, pageSize: 20 }, fetchJson({ items: [{ id: "task-1", title: "Alpha", notes: "", status: "doing", progress: 40, priority: "high", dueAt: "2026-08-26T00:00:00.000Z" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
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
      return new Response(JSON.stringify({ task: { notes: "", dueAt: null, completedAt: null, id: JSON.parse(capturedBody).id, title: "Alpha", status: "todo", progress: 0, priority: "medium", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" }, created: true }), { status: 201 });
    }) as unknown as typeof fetch;
    const result = await createTask({ title: "Alpha" }, requester);
    expect(result.task.title).toBe("Alpha");
    const body = JSON.parse(capturedBody) as { id: unknown };
    expect(typeof body.id).toBe("string");
    expect(body.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
  });

  it("reuses an explicit creation intent id across manual retries", async () => {
    const bodies: string[] = [];
    const requester = (async (_: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return Response.json({ task: { ...JSON.parse(String(init?.body)), notes: "", dueAt: null, completedAt: null, status: "todo", progress: 0, priority: "medium", createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z" }, created: false });
    }) as typeof fetch;
    await createTask({ id: "intent-one", title: "Alpha" }, requester);
    await createTask({ id: "intent-one", title: "Alpha" }, requester);
    expect(JSON.parse(bodies[0]!).id).toBe("intent-one");
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("rejects a creation receipt for a different intent", async () => {
    await expect(createTask({ id: "intent-one", title: "Alpha" }, fetchJson({ task: { id: "other", title: "Alpha" }, created: true }))).rejects.toThrow();
  });

  it("rejects details and link receipts belonging to a different target", async () => {
    await expect(loadTaskDetail("owned", fetchJson({ task: { id: "other", title: "Secret" }, tags: [], links: [] }))).rejects.toThrow();
    await expect(loadTaskDetail("owned", fetchJson({ task: { id: "owned", title: "Alpha" }, tags: [], links: [{ id: "l", taskId: "other", knowledgeItemId: "k" }] }))).rejects.toThrow();
    await expect(addTaskLink("owned", "k", fetchJson({ link: { id: "l", taskId: "owned", knowledgeItemId: "wrong" } }))).rejects.toThrow();
  });

  it("rejects malformed details instead of inventing editable defaults", async () => {
    await expect(loadTaskDetail("owned", fetchJson({ task: { id: "owned", title: "Alpha" }, tags: [], links: [] }))).rejects.toThrow();
  });

  it("validates the target of every task mutation receipt", async () => {
    const wrong = fetchJson({ id: "other", title: "Alpha" });
    await expect(setTaskStatus("owned", "done", wrong)).rejects.toThrow();
    await expect(setTaskProgress("owned", 10, wrong)).rejects.toThrow();
    await expect(updateTask("owned", { title: "Alpha", notes: "", priority: "medium", dueAt: null }, wrong)).rejects.toThrow();
  });

  it.each([undefined, "2026-10-10T00:00:00.000Z"])("preserves link DELETE payload and identity for version %s", async (version) => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const requester = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await removeTaskLink("task/a", "link/b", requester, version);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/tasks/task%2Fa/links/link%2Fb");
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(calls[0]!.init?.body).toBe(version === undefined ? undefined : JSON.stringify({ expectedUpdatedAt: version }));
    expect(new Headers(calls[0]!.init?.headers).get("content-type")).toBe(version === undefined ? null : "application/json");
  });

  it("does not turn a stale link deletion into success", async () => {
    await expect(removeTaskLink("owned", "link", fetchJson({}, 409), "old-version")).rejects.toMatchObject({ status: 409 });
  });

  it("treats an already removed association as a successful removal", async () => {
    await expect(removeTaskLink("owned", "link-gone", fetchJson({}, 404))).resolves.toBeUndefined();
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

describe("subtask position selection", () => {
  it.each([
    { positions: [], expected: 0 },
    { positions: [0, 1], expected: 2 },
    { positions: [1], expected: 2 },
    { positions: [8, 2], expected: 9 },
    { positions: [9999], expected: 10000 },
    { positions: [10000], expected: 0 },
    { positions: [10000, 0, 2], expected: 1 },
  ])("uses a vacant bounded key without renumbering $positions", ({ positions, expected }) => {
    const subtasks = positions.map((position) => Object.freeze({ position }));
    expect(nextSubtaskPosition(Object.freeze(subtasks))).toBe(expected);
    expect(subtasks.map((item) => item.position)).toEqual(positions);
  });

  it("returns no position only when every API-supported key is occupied", () => {
    const subtasks = Array.from({ length: 10001 }, (_, position) => ({ position }));
    expect(nextSubtaskPosition(subtasks)).toBeNull();
    subtasks.splice(9999, 1);
    expect(nextSubtaskPosition(subtasks)).toBe(9999);
  });
});
