// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forceRemountAppAt, mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import type { TaskDetail, TaskSubtask, TaskDependency } from "../../frontend/lib/tasks-data";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const version = "2026-10-10T00:00:00.000Z", next = "2026-10-10T00:00:00.001Z";
const taskKey = "memory-garden:task-write:v1:alice";
const route = "/inbox?page=2&status=promoted";
type Operation = { op: string; method: string; path: string; field?: string; value?: string; button: string; body: Record<string, unknown> };
// Each expectation is independent of runTaskWrite/checkTaskWrite implementation.
const operations: Operation[] = [
  { op: "update", method: "PATCH", path: "", field: "Task title", value: "Revised title", button: "Save task", body: { title: "Revised title", notes: "Owned notes", priority: "medium", dueAt: null, expectedUpdatedAt: version } },
  { op: "status", method: "POST", path: "/status", field: "Task status", value: "doing", button: "Save status", body: { status: "doing", expectedStatus: "todo" } },
  { op: "progress", method: "POST", path: "/progress", field: "Task progress", value: "37", button: "Save progress", body: { progress: 37, expectedUpdatedAt: version } },
  { op: "tags", method: "PUT", path: "/tags", field: "Task tags (comma-separated)", value: "new, second", button: "Save tags", body: { tags: ["new", "second"], expectedUpdatedAt: version } },
  { op: "link", method: "POST", path: "/links", field: "Knowledge item ID", value: "knowledge-2", button: "Link knowledge", body: { knowledgeItemId: "knowledge-2", expectedUpdatedAt: version } },
  { op: "unlink", method: "DELETE", path: "/links/link-1", button: "Remove link", body: { expectedUpdatedAt: version } },
  { op: "subtask-create", method: "POST", path: "/subtasks", field: "Subtask title", value: "New child", button: "Add subtask", body: { id: expect.any(String), title: "New child", status: "todo", position: 8 } },
  { op: "subtask-update", method: "PATCH", path: "/subtasks/child-1", button: "Mark subtask done", body: { title: "Existing child", status: "done", position: 7, expectedUpdatedAt: version } },
  { op: "subtask-delete", method: "DELETE", path: "/subtasks/child-1", button: "Remove subtask", body: { expectedUpdatedAt: version } },
  { op: "dependency-add", method: "POST", path: "/dependencies", field: "Depends on task", value: "task-3", button: "Add dependency", body: { dependsOnTaskId: "task-3", expectedUpdatedAt: version } },
  { op: "dependency-remove", method: "DELETE", path: "/dependencies/task-2", button: "Remove dependency", body: { expectedUpdatedAt: version } },
];

describe.each(operations)("Inbox target editor $op journey", operation => {
  let app: MountedApp | undefined;
  let writes: { method: string; path: string; body: Record<string, unknown> }[];
  let reads: string[];
  let detail: TaskDetail, subtasks: TaskSubtask[], dependencies: TaskDependency[];
  let readStatus: number, writeStatus: number;
  const unknown = () => app!.browser.document.querySelector("[data-task-write-unknown]");
  const button = (label: string) => [...app!.browser.document.querySelectorAll("button")].find(node => node.textContent === label) as unknown as HTMLButtonElement;
  const click = async (node: HTMLButtonElement) => {
    expect(node).toBeTruthy(); expect(node.disabled).toBe(false);
    await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
  };
  async function mount() {
    writes = []; reads = []; readStatus = 200; writeStatus = 503;
    detail = { task: { id: "task-1", title: "Target task", notes: "Owned notes", status: "todo", progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: version, updatedAt: version }, tags: ["old"], links: [{ id: "link-1", taskId: "task-1", knowledgeItemId: "knowledge-1", knowledgeTitle: "Owned knowledge", createdAt: version }] };
    subtasks = [{ id: "child-1", taskId: "task-1", title: "Existing child", status: "todo", position: 7, updatedAt: version }];
    dependencies = [{ taskId: "task-1", dependsOnTaskId: "task-2" }];
    app = await mountApp({ url: `https://app.test${route}`, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test"), path = url.pathname, method = init?.method ?? "GET";
      if (path === "/api/session") return Response.json({ member: { id: "alice", email: "alice@app.test", role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (path === "/api/notifications/summary") return Response.json({ unread: 0 });
      if (path === "/api/inbox") return Response.json({ items: [{ id: "row", clientKey: "key", kind: "text", content: "Private row", sourceUrl: null, status: "promoted", promotedTaskId: "task-1", promotedSubmissionId: null, createdAt: version, updatedAt: version }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
      expect(path).toMatch(/^\/api\/tasks\/task-1(?:\/|$)/);
      if (method !== "GET") {
        const pending = JSON.parse(app!.browser.sessionStorage.getItem(taskKey)!);
        expect(pending.memberId).toBe("alice"); expect(pending.intent.op).toBe(operation.op);
        expect(pending.intent.taskId).toBe("task-1"); // persisted before transport
        writes.push({ method, path, body: JSON.parse(String(init?.body)) });
        if (writeStatus === 0) { applyResult(); throw new TypeError("Response lost after commit"); }
        if (writeStatus === 200) {
          applyResult();
          if (method === "DELETE") return new Response(null, { status: 204 });
          switch (operation.op) {
            case "tags": return Response.json({ tags: detail.tags });
            case "link": return Response.json({ link: detail.links.at(-1) });
            case "subtask-create": return Response.json({ subtask: subtasks.at(-1) });
            case "subtask-update": return Response.json(subtasks[0]);
            case "dependency-add": return Response.json({ dependency: dependencies.at(-1) });
            default: return Response.json(detail.task);
          }
        }
        return apiError(writeStatus, writeStatus === 409 ? "TASK_VERSION_CONFLICT" : "UNAVAILABLE", writeStatus >= 500);
      }
      reads.push(path);
      if (readStatus !== 200) return apiError(readStatus, "UNAVAILABLE", readStatus >= 500);
      if (path.endsWith("/subtasks")) return Response.json(subtasks);
      if (path.endsWith("/dependencies")) return Response.json(dependencies);
      expect(path).toBe("/api/tasks/task-1"); return Response.json(detail);
    } });
    await waitForApp(() => !!button("Open task")); await click(button("Open task"));
    await waitForApp(() => !!button(operation.button));
  }
  async function enter() {
    if (operation.field) {
      const input = app!.browser.document.querySelector(`input[aria-label="${operation.field}"], select[aria-label="${operation.field}"]`) as unknown as HTMLInputElement;
      expect(input).toBeTruthy();
      const props = Object.keys(input).find(key => key.startsWith("__reactProps$"))!;
      await act(async () => {
        input.value = operation.value!;
        if (input.tagName === "SELECT") input.dispatchEvent(new app!.browser.Event("change", { bubbles: true }) as unknown as Event);
        else (input as any)[props].onChange({ currentTarget: input });
      });
    }
  }
  async function submitTwice() {
    const submit = button(operation.button); expect(submit).toBeTruthy(); expect(submit.disabled).toBe(false);
    await act(async () => { submit.click(); submit.click(); });
  }
  async function start() {
    await enter(); await submitTwice(); await waitForApp(() => !!unknown());
    expect(writes).toEqual([{ method: operation.method, path: `/api/tasks/task-1${operation.path}`, body: operation.body }]);
    return app!.browser.sessionStorage.getItem(taskKey)!;
  }
  function applyResult() {
    const body = writes[0].body;
    detail.task.updatedAt = next;
    switch (operation.op) {
      case "update": detail.task.title = "Revised title"; break;
      case "status": detail.task.status = "doing"; break;
      case "progress": detail.task.progress = 37; break;
      case "tags": detail.tags = ["second", "new"]; break;
      case "link": detail.links.push({ id: "link-2", taskId: "task-1", knowledgeItemId: "knowledge-2", knowledgeTitle: "Another knowledge", createdAt: next }); break;
      case "unlink": detail.links = []; break;
      case "subtask-create": subtasks.push({ id: String(body.id), taskId: "task-1", title: "New child", status: "todo", position: 8, updatedAt: next }); break;
      case "subtask-update": subtasks[0].status = "done"; subtasks[0].updatedAt = next; break;
      case "subtask-delete": subtasks = []; break;
      case "dependency-add": dependencies.push({ taskId: "task-1", dependsOnTaskId: "task-3" }); break;
      case "dependency-remove": dependencies = []; break;
      default: throw new Error("Missing matrix outcome");
    }
  }
  afterEach(async () => { await app?.unmount(); app = undefined; });

  it("persists the actual UI operation, restores it, rejects duplicate clicks and checks the exact current result without replay", async () => {
    await mount(); const marker = await start();
    expect(writeWorkspaceHistory("push", "/unknown")).toBe("blocked");
    await forceRemountAppAt(app!, route); await waitForApp(() => !!unknown());
    expect(writes).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(marker);
    writeStatus = 409;
    const retry = button("Retry same operation");
    await act(async () => { retry.click(); retry.click(); });
    await waitForApp(() => writes.length === 2 && !button("Retry same operation").disabled);
    expect(writes[1]).toEqual(writes[0]); expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(marker);
    expect(unknown()).not.toBeNull();
    applyResult(); reads = [];
    await click(button("Check the result")); await waitForApp(() => !unknown());
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBeNull(); expect(writes).toHaveLength(2);
    const endpoint = operation.op.startsWith("subtask-") ? "/subtasks" : operation.op.startsWith("dependency-") ? "/dependencies" : "";
    expect(reads[0]).toBe(`/api/tasks/task-1${endpoint}`);
    expect(app!.browser.document.body.textContent).toContain("The change was saved.");
  });

  it.each([401, 403])("clears private content on a %s exact-result read, retains original intent and makes no new mutation", async code => {
    await mount(); const marker = await start(); readStatus = code;
    await click(button("Check the result")); await waitForApp(() => !unknown());
    expect(app!.browser.document.body.textContent).not.toContain("Private row");
    expect(app!.browser.document.querySelector('[aria-label="Task title"]')).toBeNull();
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(marker); expect(writes).toHaveLength(1);
    expect(writeWorkspaceHistory("push", "/unknown")).toBe("committed");
  });

  it.each([401, 403])("clears private content on a %s same-intent retry without erasing the uncertain original", async code => {
    await mount(); const marker = await start(); writeStatus = code;
    await click(button("Retry same operation")); await waitForApp(() => !unknown());
    expect(app!.browser.document.body.textContent).not.toContain("Private row");
    expect(app!.browser.document.querySelector('[aria-label="Task title"]')).toBeNull();
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(marker);
  });

  it("keeps its frozen record and lock when a result check is unavailable, then recovers by GET only", async () => {
    await mount(); const marker = await start(); readStatus = 503;
    await click(button("Check the result")); expect(unknown()).not.toBeNull();
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(marker); expect(writes).toHaveLength(1);
    expect(writeWorkspaceHistory("push", "/unknown")).toBe("blocked");
    readStatus = 200; applyResult(); await click(button("Check the result")); await waitForApp(() => !unknown());
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBeNull(); expect(writes).toHaveLength(1);
  });
  it("reloads after a definite first conflict, retains the edit and requires an explicit new submission", async () => {
    await mount(); await enter(); writeStatus = 409;
    // The server changes after the form's initial read, without changing the intended field.
    detail.task.updatedAt = next; subtasks[0].updatedAt = next;
    await submitTwice();
    await waitForApp(() => !!button(operation.button) && !button(operation.button).disabled && reads.length >= 6);
    expect(writes).toHaveLength(1); expect(writes[0].body).toEqual(operation.body);
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBeNull(); expect(unknown()).toBeNull();
    expect(app!.browser.document.body.textContent).toContain("The task changed elsewhere");
    writeStatus = 503; await submitTwice(); await waitForApp(() => !!unknown());
    expect(writes).toHaveLength(2);
    const expected = { ...operation.body };
    if ("expectedUpdatedAt" in expected) expected.expectedUpdatedAt = next;
    expect(writes[1].body).toEqual(expected);
  });

  it("does not resend a confirmed mutation when its subsequent detail read fails", async () => {
    await mount(); await enter(); writeStatus = 200; readStatus = 503;
    await submitTwice(); await waitForApp(() => !!button("Reload task details"));
    expect(writes).toHaveLength(1); expect(unknown()).toBeNull();
    expect(app!.browser.sessionStorage.getItem(taskKey)).toBeNull();
    readStatus = 200; await click(button("Reload task details"));
    await waitForApp(() => !!button("Save task"));
    expect(writes).toHaveLength(1); expect(unknown()).toBeNull();
  });

  it("does not claim an unchanged current resource matches the intended write", async () => {
    await mount(); await start(); await click(button("Check the result"));
    await waitForApp(() => !unknown());
    expect(writes).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(taskKey)).toBeNull();
    expect(app!.browser.document.body.textContent).toContain("The change is not on the task.");
    expect(app!.browser.document.body.textContent).not.toContain("The change was saved.");
  });

  it("recovers a transport-lost committed result after remount by exact GET, never another write", async () => {
    await mount(); writeStatus = 0; const marker = await start();
    await forceRemountAppAt(app!, route); await waitForApp(() => !!unknown());
    expect(writes).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(taskKey)).toBe(marker);
    await click(button("Check the result")); await waitForApp(() => !unknown());
    expect(writes).toHaveLength(1); expect(app!.browser.sessionStorage.getItem(taskKey)).toBeNull();
    expect(app!.browser.document.body.textContent).toContain("The change was saved.");
  });

});
