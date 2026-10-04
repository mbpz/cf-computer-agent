// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../frontend/lib/tasks-data";
import { TasksRoute, InboxRoute, App } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
import { currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
import { writeWorkspaceHistory, registerWorkspaceLeaveGuard } from "../../frontend/lib/workspace-location";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("task editor through the real route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const task: TaskItem = { id: "task-alpha", title: "Alpha", notes: "Original", status: "todo", progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z" };
  let saved: typeof task; let writes: Array<{ url: string; method: string; body: Record<string, unknown> }>;
  let responder: ((url: string, init?: RequestInit) => Promise<Response> | Response | undefined) | undefined;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/tasks" });
    for (const [name, value] of Object.entries({ window: browser, HTMLElement: browser.HTMLElement, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(name, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
    saved = { ...task }; writes = []; responder = undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? "GET";
      if (method !== "GET") writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const override = responder?.(url, init); if (override) return override;
      if (url.startsWith("/api/tasks?")) return Response.json({ items: [saved], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      if (url === "/api/tasks" && method === "POST") return Response.json({ task: { ...task, ...JSON.parse(String(init?.body)) }, created: true });
      if (method === "PATCH") { saved = { ...saved, ...JSON.parse(String(init?.body)) }; return Response.json(saved); }
      if (url.endsWith("/tags")) return Response.json({ tags: JSON.parse(String(init?.body)).tags });
      if (url.endsWith("/links") && method === "POST") return Response.json({ link: { id: "link-one", taskId: task.id, knowledgeItemId: JSON.parse(String(init?.body)).knowledgeItemId, knowledgeTitle: null, createdAt: task.createdAt } });
      if ((url.endsWith("/subtasks") || url.endsWith("/dependencies")) && method === "GET") return Response.json([]);
      return Response.json({ task: saved, tags: [], links: [] });
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
  async function mount() { await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search="" />)); await flush(); }
  async function click(name: string) {
    const button = [...container.querySelectorAll("button")].find((node) => (node.getAttribute("aria-label") ?? node.textContent) === name);
    expect(button, name).toBeTruthy(); await act(async () => button!.click()); await flush();
  }
  async function change(label: string, value: string) {
    const node = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
    expect(node, label).toBeTruthy();
    await act(async () => {
      node.value = value;
      if (node.tagName === "SELECT") node.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
      else {
        // React was imported before the DOM harness, matching the existing route test setup.
        const key = Object.keys(node).find((value) => value.startsWith("__reactProps$"))!;
        const props = (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement }) => void }>)[key]!;
        props.onChange({ currentTarget: node });
      }
    });
  }
  it.each(["tasks", "inbox"])("guards dirty navigation from the %s editor, keeping by default and discarding once", async (entry) => {
    if (entry === "inbox") {
      browser.history.replaceState({}, "", "/inbox");
      responder = url => url.startsWith("/api/inbox?") ? Response.json({ items: [{ id: "inbox-one", clientKey: "capture-one", kind: "text", content: "Captured", sourceUrl: null, promotedSubmissionId: null, status: "promoted", promotedTaskId: task.id, createdAt: task.createdAt, updatedAt: task.updatedAt }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }) : undefined;
      await act(async () => root.render(<InboxRoute locale={createLocaleRuntime()} search="" memberId="alice" />)); await flush();
      await click("Open task");
    } else { await mount(); await click("Edit: Alpha (task-alpha)"); }
    await change("Task title", "Unsaved navigation draft");
    const original = browser.location.href, length = browser.history.length;
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"); });
    expect(browser.location.href).toBe(original); expect(browser.history.length).toBe(length);
    expect(browser.document.activeElement?.textContent).toBe("Keep editing");
    await click("Keep editing");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Unsaved navigation draft");
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"); });
    const confirm = container.querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await act(async () => { confirm.click(); confirm.click(); });
    expect(browser.location.pathname).toBe("/settings"); expect(browser.history.length).toBe(length + 1);
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(writes).toHaveLength(0);
  });
  it("reads input synchronously before React flushes the same event", async () => {
    await mount(); await click("New task");
    const node = container.querySelector('[aria-label="Task title"]') as HTMLInputElement;
    const key = Object.keys(node).find(value => value.startsWith("__reactProps$"))!;
    await act(async () => {
      node.value = "Synchronous draft";
      (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement }) => void }>)[key]!.onChange({ currentTarget: node });
      expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred");
    });
    expect(browser.location.pathname).toBe("/tasks"); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
  it("blocks same-event pending writes and unknown outcomes without a discard dialog", async () => {
    let reject!: (cause: unknown) => void;
    responder = (_url, init) => init?.method === "PATCH" ? new Promise<Response>((_resolve, no) => { reject = no; }) : undefined;
    await mount(); await click("Edit: Alpha (task-alpha)");
    const save = [...container.querySelectorAll("button")].find(node => node.textContent === "Save task")!;
    await act(async () => { save.click(); expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => reject(new TypeError("offline"))); await flush();
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    expect(browser.location.pathname).toBe("/tasks"); expect(writes).toHaveLength(1);
  });
  it("does not discard when another guard prevents the final commit", async () => {
    await mount(); await click("New task"); await change("Task title", "Retain me");
    let blocked = false;
    const unregister = registerWorkspaceLeaveGuard(() => blocked ? { kind: "block" } : { kind: "allow" });
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"); });
    blocked = true; await click("Discard changes");
    expect(browser.location.pathname).toBe("/tasks");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Retain me");
    unregister();
  });
  it("invalidates old navigation consent on editor unmount", async () => {
    await mount(); await click("New task"); await change("Task title", "Old draft");
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"); });
    const node = container.querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    const key = Object.keys(node).find(value => value.startsWith("__reactProps$"))!;
    const oldClick = (node as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
    await act(async () => root.render(<p>New owner</p>));
    await act(async () => oldClick());
    expect(browser.location.pathname).toBe("/tasks");
    await act(async () => { expect(writeWorkspaceHistory("push", "/knowledge")).toBe("committed"); });
  });

  it.each([true, false])("retains a real App task draft across raw Back then discards only after admitted arrival (native=%s)", async native => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis, native);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    let inboxReads = 0;
    responder = url => {
      if (url === "/api/session") return Response.json({ member: { id: "alice", email: "alice@app.test", role: "contributor" }, capabilities: ["tasks:use"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (url === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.startsWith("/api/inbox?")) { inboxReads++; return Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }); }
      if (url === "/api/notifications/summary") return Response.json({ unread: 0 });
      if (url.startsWith("/api/telemetry/")) return new Response(null, { status: 204 });
    };
    await act(async () => root.render(<App />)); await flush(); await flush();
    await click("New task"); await change("Task title", "Browser history draft");
    await act(async () => driver.arrive(1)); await flush();
    expect(container.querySelector('[aria-label="Task title"]')).not.toBeNull(); expect(inboxReads).toBe(0);
    await act(async () => driver.arrive(2)); await click("Keep editing");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Browser history draft");
    await act(async () => { driver.arrive(1); driver.arrive(2); }); await click("Discard changes");
    expect(container.querySelector('[aria-label="Task title"]')).not.toBeNull(); expect(inboxReads).toBe(0);
    await act(async () => driver.arrive(1)); await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(container.querySelector("main")?.textContent).toContain("Inbox");
    expect(inboxReads).toBe(1); expect(writes.filter(write => write.url === "/api/tasks")).toEqual([]);
  });

  it("keeps the editor and shows recoverable history failure instead of a silent URL/view mismatch", async () => {
    const driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis, false);
    writeWorkspaceHistory("push", "/inbox"); writeWorkspaceHistory("push", "/tasks");
    responder = url => {
      if (url === "/api/session") return Response.json({ member: { id: "alice", email: "alice@app.test", role: "contributor" }, capabilities: ["tasks:use"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (url === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url === "/api/notifications/summary") return Response.json({ unread: 0 });
      if (url.startsWith("/api/telemetry/")) return new Response(null, { status: 204 });
    };
    await act(async () => root.render(<App />)); await flush(); await flush();
    await click("New task"); await change("Task title", "Keep on unknown history");
    driver.corruptState(1); await act(async () => driver.arrive(1)); await flush();
    expect(container.textContent).toContain("Navigation could not be verified");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Keep on unknown history");
    await act(async () => driver.arrive(2)); await click("Retry original location");
    expect(container.textContent).not.toContain("Navigation could not be verified");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Keep on unknown history");
  });
  it.each([
    ["Task title", "Draft"], ["Task notes", "Draft notes"], ["Task priority", "high"],
    ["Task due date", "2026-10-02T12:30"], ["Task status", "doing"], ["Task progress", "40"],
    ["Task tags (comma-separated)", "draft"], ["Knowledge item ID", "knowledge-draft"],
  ])("protects %s from explicit replace and Escape keeps the draft", async (label, value) => {
    await mount(); await click("Edit: Alpha (task-alpha)"); await change(label, value);
    await act(async () => { expect(writeWorkspaceHistory("replace", "/tasks?page=2")).toBe("deferred"); });
    await act(async () => container.querySelector('[role="alertdialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect(browser.location.search).toBe("");
    expect((container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement).value).toBe(value);
    expect(writes).toHaveLength(0);
  });
  it("allows clean navigation and closes the editor only on the admitted location event", async () => {
    await mount(); await click("Edit: Alpha (task-alpha)");
    await act(async () => { expect(writeWorkspaceHistory("push", "/tasks?page=2")).toBe("committed"); });
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(browser.location.search).toBe("?page=2");
  });
  it("blocks competing navigation during local close confirmation", async () => {
    await mount(); await click("New task"); await change("Task title", "Local close draft"); await click("Close task editor");
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("blocked"); });
    await click("Keep editing"); expect(browser.location.pathname).toBe("/tasks");
  });
  it("retains dirty sibling subforms after an acknowledged field write", async () => {
    await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task tags (comma-separated)", "Unsaved tag");
    await change("Task title", "Saved title"); await click("Save task");
    await act(async () => { expect(writeWorkspaceHistory("push", "/settings")).toBe("deferred"); });
    await click("Keep editing");
    expect((container.querySelector('[aria-label="Task tags (comma-separated)"]') as HTMLInputElement).value).toBe("Unsaved tag");
    expect(writes).toHaveLength(1);
  });
  it("protects an actual App sidebar navigation and renders the destination only after consent", async () => {
    responder = url => {
      if (url === "/api/session") return Response.json({ member: { id: "alice", email: "alice@app.test", role: "contributor" }, capabilities: ["tasks:use"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (url === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.startsWith("/api/inbox?")) return Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      if (url === "/api/notifications/summary") return Response.json({ unread: 0 });
      if (url.startsWith("/api/telemetry/")) return new Response(null, { status: 204 });
    };
    await act(async () => root.render(<App />)); await flush(); await flush();
    await click("New task"); await change("Task title", "Sidebar draft");
    const link = container.querySelector<HTMLAnchorElement>('a[href="/inbox"]'); expect(link).toBeTruthy();
    await act(async () => link!.click()); await flush();
    expect(browser.location.pathname).toBe("/tasks"); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click("Keep editing"); expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Sidebar draft");
    await act(async () => link!.click()); await click("Discard changes");
    expect(browser.location.pathname).toBe("/inbox"); expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector("main")?.textContent).toContain("Inbox"); expect(writes.filter(write => write.url === "/api/tasks")).toHaveLength(0);
  });
  it.each([
    ["Task title", "Fresh title", "Save task", "title"],
    ["Task tags (comma-separated)", "fresh", "Save tags", "tags"],
    ["Task progress", "40", "Save progress", "progress"],
    ["Task status", "doing", "Save status", "status"],
    ["Knowledge item ID", "fresh-knowledge", "Link knowledge", "knowledgeItemId"],
  ])("submits the same fresh %s snapshot used by navigation admission", async (label, value, submit, key) => {
    await mount(); await click("Edit: Alpha (task-alpha)");
    const node = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
    const propKey = Object.keys(node).find(value => value.startsWith("__reactProps$"))!;
    const button = [...container.querySelectorAll("button")].find(node => node.textContent === submit)!;
    await act(async () => {
      node.value = value;
      if (node.tagName === "SELECT") node.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
      else (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement }) => void }>)[propKey]!.onChange({ currentTarget: node });
      button.click();
    }); await flush();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body[key]).toEqual(key === "tags" ? ["fresh"] : key === "progress" ? 40 : value);
    if (key === "status") expect(writes[0]!.body.expectedStatus).toBe(task.status);
    else expect(writes[0]!.body.expectedUpdatedAt).toBe(task.updatedAt);
  });
  it("creates from the task list and refreshes only after confirmed success", async () => {
    await mount(); await click("New task"); await change("Task title", "New work"); await click("Create task");
    expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ method: "POST", body: { title: "New work" } });
    expect(writes[0]!.body.id).toMatch(/^[a-z0-9-]+$/i); expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it("locks uncertain creation and retries exactly the same intent without automatic writes", async () => {
    let failed = false;
    responder = (url, init) => { if (url === "/api/tasks" && init?.method === "POST" && !failed) { failed = true; return Promise.reject(new TypeError("offline")); } };
    await mount(); await click("New task"); await change("Task title", "Once"); await click("Create task");
    expect(container.textContent).toContain("The write result is unknown");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).disabled).toBe(true);
    await flush(); expect(writes).toHaveLength(1); await click("Retry same operation");
    expect(writes).toHaveLength(2); expect(writes[0]!.body).toEqual(writes[1]!.body);
  });
  it("opens details, saves fields including clearing due date, and changes tags and associations", async () => {
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Task title", "Edited"); await change("Task notes", "Note"); await change("Task due date", "2026-09-28T12:30"); await click("Save task");
    expect(writes[0]).toMatchObject({ method: "PATCH", body: { title: "Edited", notes: "Note", dueAt: new Date("2026-09-28T12:30").toISOString() } });
    await change("Task due date", ""); await click("Save task"); expect(writes[1]!.body.dueAt).toBeNull();
    await change("Task tags (comma-separated)", "urgent, review"); await click("Save tags"); expect(writes.at(-1)!.body.tags).toEqual(["urgent", "review"]);
    await change("Knowledge item ID", "knowledge-one"); await click("Link knowledge"); expect(writes.at(-1)!.body).toEqual({ knowledgeItemId: "knowledge-one", expectedUpdatedAt: task.updatedAt });
  });
  it("does not repeat a successful write when detail readback fails", async () => {
    let failRead = false;
    responder = (url, init) => { if (init?.method === "PATCH") failRead = true; if (url === "/api/tasks/task-alpha" && !init?.method && failRead) return Response.json({}, { status: 500 }); };
    await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Confirmed"); await click("Save task");
    expect(writes).toHaveLength(1); expect(container.querySelector('[aria-label="Task title"]')).toBeNull();
    failRead = false; await click("Reload task details"); expect(writes).toHaveLength(1); expect(container.textContent).not.toContain("The write result is unknown");
  });
  it("deduplicates rapid submits and blocks Escape while a creation is pending", async () => {
    let resolve!: (response: Response) => void;
    responder = (url, init) => url === "/api/tasks" && init?.method === "POST" ? new Promise<Response>((done) => { resolve = done; }) : undefined;
    await mount(); await click("New task"); await change("Task title", "Once");
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent === "Create task")!;
    await act(async () => { button.click(); button.click(); }); expect(writes).toHaveLength(1);
    await act(async () => { container.querySelector('[role="dialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event); });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => resolve(Response.json({ task: { ...task, ...writes[0]!.body }, created: true }))); await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it("uses GET-only recovery after an initial detail failure and rejects another task's details", async () => {
    let wrong = true;
    responder = (url, init) => url === "/api/tasks/task-alpha" && !init?.method && wrong ? Response.json({ task: { ...task, id: "other", title: "Hidden target" }, tags: [], links: [] }) : undefined;
    await mount(); await click("Edit: Alpha (task-alpha)");
    expect(container.textContent).not.toContain("Hidden target"); expect(container.querySelector('[aria-label="Task title"]')).toBeNull();
    wrong = false; await click("Reload task details"); expect(writes).toHaveLength(0);
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Alpha");
  });
  it("aborts detail loading and ignores a late response after closing", async () => {
    let resolve!: (response: Response) => void; let signal: AbortSignal | null | undefined;
    responder = (url, init) => { if (url === "/api/tasks/task-alpha") { signal = init?.signal; return new Promise<Response>((done) => { resolve = done; }); } };
    await mount(); await click("Edit: Alpha (task-alpha)"); await click("Close task editor");
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({ task: { ...task, title: "Late" }, tags: [], links: [] }))); await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(container.textContent).not.toContain("Late"); expect(writes).toHaveLength(0);
  });
  it("shows inaccessible link fallback and removes an already missing link without a replay", async () => {
    let removed = false;
    responder = (url, init) => {
      if (init?.method === "DELETE") { removed = true; return Response.json({}, { status: 404 }); }
      if (url === "/api/tasks/task-alpha") return Response.json({ task, tags: [], links: removed ? [] : [{ id: "link-old", taskId: task.id, knowledgeItemId: "revoked", knowledgeTitle: null, createdAt: task.createdAt }] });
    };
    await mount(); await click("Edit: Alpha (task-alpha)"); expect(container.textContent).toContain("Knowledge no longer accessible");
    await click("Remove link: link-old"); expect(writes).toHaveLength(1); expect(writes[0]!.method).toBe("DELETE"); expect(container.textContent).not.toContain("Knowledge no longer accessible");
  });
  it("edits status and progress with absolute values and disables progress in terminal state", async () => {
    responder = (url, init) => {
      if (url.endsWith("/status") || url.endsWith("/progress")) { saved = { ...saved, ...JSON.parse(String(init?.body)) }; return Response.json(saved); }
    };
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Task status", "doing"); await click("Save status"); expect(writes.at(-1)!.body).toEqual({ status: "doing", expectedStatus: "todo" });
    await change("Task progress", "40"); await click("Save progress"); expect(writes.at(-1)!.body).toEqual({ progress: 40, expectedUpdatedAt: task.updatedAt });
    await change("Task status", "done"); await click("Save status"); expect((container.querySelector('[aria-label="Task progress"]') as HTMLInputElement).disabled).toBe(true);
  });
  it("preserves an unchanged due instant including milliseconds", async () => {
    saved = { ...saved, dueAt: "2026-09-26T12:34:56.789Z" } as typeof saved;
    await mount(); await click("Edit: Alpha (task-alpha)"); await click("Save task"); expect(writes[0]!.body.dueAt).toBe("2026-09-26T12:34:56.789Z");
  });
  it("allows correction after a known validation rejection but freezes malformed success", async () => {
    let attempt = 0;
    responder = (_url, init) => { if (init?.method === "PATCH") { attempt += 1; return attempt === 1 ? Response.json({}, { status: 422 }) : Response.json({ ...task, id: "wrong-task" }); } };
    await mount(); await click("Edit: Alpha (task-alpha)"); await click("Save task");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).disabled).toBe(false);
    await change("Task title", "Corrected"); await click("Save task");
    expect(container.textContent).toContain("The write result is unknown"); expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).disabled).toBe(true);
  });
  it("rejects excess tags locally and restores focus on normal Escape", async () => {
    await mount(); const trigger = container.querySelector('[aria-label="Edit: Alpha (task-alpha)"]') as HTMLButtonElement;
    trigger.focus(); await click("Edit: Alpha (task-alpha)");
    await change("Task tags (comma-separated)", Array.from({ length: 11 }, (_, index) => `tag-${index}`).join(",")); await click("Save tags"); expect(writes).toHaveLength(0);
    await act(async () => { container.querySelector('[role="dialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event); });
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull(); await click("Discard changes");
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(browser.document.activeElement).toBe(trigger);
  });
  it.each([
    ["Task title", "Draft"], ["Task notes", "Draft notes"], ["Task priority", "high"],
    ["Task due date", "2026-10-02T12:30"], ["Task status", "doing"], ["Task progress", "40"],
    ["Task tags (comma-separated)", "draft"], ["Knowledge item ID", "knowledge-draft"],
  ])("protects unsaved %s on close and refresh without submitting", async (label, value) => {
    await mount(); await click("Edit: Alpha (task-alpha)"); await change(label, value);
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    await click("Close task editor");
    const confirmation = container.querySelector('[role="alertdialog"]'); expect(confirmation).not.toBeNull();
    expect(confirmation?.textContent).toContain("task-alpha"); expect(confirmation?.textContent).toContain("No changes will be submitted");
    expect(browser.document.activeElement?.textContent).toBe("Keep editing"); expect(writes).toHaveLength(0);
    await click("Keep editing"); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect((container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement).value).toBe(value);
    await click("Close task editor"); const discard = container.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await act(async () => { discard.click(); discard.click(); });
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(writes).toHaveLength(0);
    const after = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
  });
  it("does not warn for untouched or reverted task fields", async () => {
    await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Draft"); await change("Task title", "Alpha");
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(false);
    await click("Close task editor"); expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("keeps new-task drafts on Escape and consumes discard before stale clicks", async () => {
    await mount(); await click("New task"); await change("Task title", "Unsubmitted task");
    await act(async () => container.querySelector('[role="dialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("Unsubmitted task");
    await act(async () => container.querySelector('[role="alertdialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Unsubmitted task");
    await click("Close task editor"); const stale = container.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await click("Discard changes"); await click("New task"); await act(async () => stale.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull(); expect(writes).toHaveLength(0);
  });
  it("blocks same-tick submit behind discard confirmation", async () => {
    await mount(); await click("New task"); await change("Task title", "Draft");
    const close = [...container.querySelectorAll("button")].find(node => node.textContent === "Close task editor")!;
    const form = container.querySelector("form")!;
    await act(async () => { close.click(); form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    expect(writes).toHaveLength(0); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click("Keep editing"); await click("Create task"); expect(writes).toHaveLength(1); expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it("preserves other unsaved forms when a status write is acknowledged", async () => {
    responder = (url, init) => { if (url.endsWith("/status")) { saved = { ...saved, ...JSON.parse(String(init?.body)) }; return Response.json(saved); } };
    await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Unsaved title");
    await change("Task tags (comma-separated)", "unsaved-tag"); await change("Knowledge item ID", "unsaved-link");
    await change("Task status", "doing"); await click("Save status");
    expect(writes).toHaveLength(1); expect(writes[0]!.body).toEqual({ status: "doing", expectedStatus: "todo" });
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Unsaved title");
    expect((container.querySelector('[aria-label="Task tags (comma-separated)"]') as HTMLInputElement).value).toBe("unsaved-tag");
    expect((container.querySelector('[aria-label="Knowledge item ID"]') as HTMLInputElement).value).toBe("unsaved-link");
    await click("Close task editor"); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
  it("clears only acknowledged fields and preserves another draft through GET-only recovery", async () => {
    let failRead = false;
    responder = (url, init) => {
      if (init?.method === "PATCH") { saved = { ...saved, ...JSON.parse(String(init.body)) }; failRead = true; return Response.json(saved); }
      if (url === "/api/tasks/task-alpha" && !init?.method && failRead) return Response.json({}, { status: 500 });
    };
    await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Saved title"); await change("Task progress", "45");
    await click("Save task"); expect(writes).toHaveLength(1);
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    failRead = false; await click("Reload task details");
    expect((container.querySelector('[aria-label="Task title"]') as HTMLInputElement).value).toBe("Saved title");
    expect((container.querySelector('[aria-label="Task progress"]') as HTMLInputElement).value).toBe("45");
    expect(writes).toHaveLength(1); await click("Close task editor"); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
  it("removes dirty protection after the only edited fields are saved", async () => {
    await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Saved"); await click("Save task");
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(false);
    await click("Close task editor"); expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(writes).toHaveLength(1);
  });
  it("invalidates an old confirmation callback even when reopening the unchanged draft", async () => {
    await mount(); await click("New task"); await change("Task title", "Same draft"); await click("Close task editor");
    const confirm = container.querySelector('[data-confirm-action]')!;
    const key = Object.keys(confirm).find(value => value.startsWith("__reactProps$"))!;
    const stale = (confirm as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
    await click("Keep editing"); await click("Close task editor"); await act(async () => stale());
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull(); expect(writes).toHaveLength(0);
    await click("Discard changes"); expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it("keeps unknown outcomes locked rather than offering to discard", async () => {
    responder = (_url, init) => init?.method === "PATCH" ? Promise.reject(new TypeError("offline")) : undefined;
    await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Unknown"); await click("Save task");
    await act(async () => container.querySelector('[role="dialog"]')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect(container.querySelector('[role="alertdialog"]')).toBeNull(); expect(container.textContent).toContain("The write result is unknown");
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true); expect(writes).toHaveLength(1);
  });
  it("accepts the backend's Unicode character limits without counting surrogate pairs twice", async () => {
    await mount(); await click("New task"); await change("Task title", "🌱".repeat(200)); await click("Create task");
    expect(writes).toHaveLength(1); expect(writes[0]!.body.title).toBe("🌱".repeat(200));
  });
  it.each([401, 403])("clears both the details and list after editor authorization failure %s", async (status) => {
    responder = (_url, init) => init?.method === "PATCH" ? Response.json({}, { status }) : undefined;
    await mount(); await click("Edit: Alpha (task-alpha)"); await click("Save task");
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(container.textContent).not.toContain("Alpha");
  });

  describe("unknown write reconciliation", () => {
    const KEY = "memory-garden:task-write:v1:alice";
    async function mountAs(memberId: string) { await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search="" memberId={memberId} />)); await flush(); await flush(); }
    async function refresh(memberId = "alice") { await act(async () => root.unmount()); root = createRoot(container); await mountAs(memberId); }
    async function leave() { let result: string | undefined; await act(async () => { result = writeWorkspaceHistory("push", "/settings"); }); return result; }
    const title = () => container.querySelector('[aria-label="Task title"]') as HTMLInputElement;

    it("checks an unknown field write read-only and releases it as not saved while keeping the draft", async () => {
      responder = (_url, init) => init?.method === "PATCH" ? Promise.reject(new TypeError("offline")) : undefined;
      await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Unknown"); await click("Save task");
      expect(container.textContent).toContain("The write result is unknown");
      await click("Check the result");
      expect(writes).toHaveLength(1);
      expect(container.textContent).not.toContain("The write result is unknown");
      expect(container.textContent).toContain("The change is not on the task");
      expect(title().disabled).toBe(false); expect(title().value).toBe("Unknown");
    });

    it("reports a checked write as saved when the read matches the intent", async () => {
      responder = (_url, init) => { if (init?.method === "PATCH") { saved = { ...saved, ...JSON.parse(String(init.body)) }; return Promise.reject(new TypeError("offline")); } };
      await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Landed"); await click("Save task");
      await click("Check the result");
      expect(writes).toHaveLength(1);
      expect(container.textContent).toContain("The change was saved.");
      expect(title().value).toBe("Landed"); expect(title().disabled).toBe(false);
      expect(await leave()).toBe("committed");
    });

    it("settles an unknown status write whose retry is rejected after a change elsewhere by checking", async () => {
      let posts = 0;
      responder = (url, init) => {
        if (url.endsWith("/status") && init?.method === "POST") {
          posts += 1;
          if (posts === 1) { saved = { ...saved, status: "blocked" }; return Promise.reject(new TypeError("offline")); }
          return Response.json({ error: { code: "TASK_TRANSITION_INVALID", message: "invalid", retryable: false } }, { status: 422 });
        }
      };
      await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task status", "doing"); await click("Save status");
      await click("Retry same operation");
      expect(container.textContent).toContain("The write result is unknown");
      await click("Check the result");
      expect(posts).toBe(2);
      expect(container.textContent).not.toContain("The write result is unknown");
      expect(container.textContent).toContain("The change is not on the task");
      expect(await leave()).toBe("deferred");
      expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    });

    it("creates again with the same task id after a not-saved check", async () => {
      let attempt = 0;
      responder = (url, init) => {
        if (url === "/api/tasks" && init?.method === "POST") { attempt += 1; if (attempt === 1) return Promise.reject(new TypeError("offline")); }
        if (/^\/api\/tasks\/[^/?]+$/u.test(url) && !init?.method && attempt === 1) return Response.json({ error: { code: "TASK_NOT_FOUND", message: "missing", retryable: false } }, { status: 404 });
      };
      await mount(); await click("New task"); await change("Task title", "Once"); await click("Create task");
      await click("Check the result");
      expect(container.textContent).toContain("The change is not on the task");
      await click("Create task");
      expect(writes).toHaveLength(2); expect(writes[1]!.body.id).toBe(writes[0]!.body.id);
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("records the write before sending and clears it after the receipt", async () => {
      const atSend: Array<string | null> = [];
      responder = (_url, init) => { if (init?.method === "PATCH") atSend.push(browser.sessionStorage.getItem(KEY)); return undefined; };
      await mountAs("alice"); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Recorded"); await click("Save task");
      expect(JSON.parse(atSend[0]!)).toEqual({ version: 1, memberId: "alice", intent: { op: "update", taskId: "task-alpha", fields: { title: "Recorded", notes: "Original", priority: "medium", dueAt: null }, expectedUpdatedAt: task.updatedAt } });
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
    });

    it("reopens an unknown field write after refresh, locked, and settles it by checking", async () => {
      responder = (_url, init) => { if (init?.method === "PATCH") { saved = { ...saved, ...JSON.parse(String(init.body)) }; return Promise.reject(new TypeError("offline")); } };
      await mountAs("alice"); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Across refresh"); await click("Save task");
      await refresh();
      expect(container.textContent).toContain("The write result is unknown");
      expect(title().disabled).toBe(true);
      expect(await leave()).toBe("blocked");
      const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
      await click("Check the result");
      expect(writes).toHaveLength(1);
      expect(container.textContent).toContain("The change was saved.");
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
      expect(await leave()).toBe("committed");
    });

    it("reopens an unknown creation after refresh with its fields and retries the same id", async () => {
      let attempt = 0;
      responder = (url, init) => { if (url === "/api/tasks" && init?.method === "POST") { attempt += 1; if (attempt === 1) return Promise.reject(new TypeError("offline")); } };
      await mountAs("alice"); await click("New task"); await change("Task title", "Created once"); await click("Create task");
      await refresh();
      expect(container.textContent).toContain("The write result is unknown");
      expect(title().value).toBe("Created once");
      await click("Retry same operation");
      expect(writes).toHaveLength(2); expect(writes[1]!.body).toEqual(writes[0]!.body);
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
    });

    it("sends the read version and reports a save rejected as changed elsewhere, reloading while keeping the draft", async () => {
      let reads = 0;
      responder = (url, init) => {
        if (init?.method === "PATCH") return Response.json({ error: { code: "TASK_VERSION_CONFLICT", message: "changed", retryable: false } }, { status: 409 });
        if (url === "/api/tasks/task-alpha" && !init?.method) { reads += 1; return Response.json({ task: reads > 1 ? { ...saved, notes: "Changed in another tab", updatedAt: "2026-09-27T00:00:00Z" } : saved, tags: [], links: [] }); }
      };
      await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Mine"); await click("Save task"); await flush();
      expect(writes[0]!.body).toMatchObject({ title: "Mine", expectedUpdatedAt: task.updatedAt });
      expect(container.textContent).toContain("changed elsewhere");
      expect(container.textContent).not.toContain("The write result is unknown");
      expect(reads).toBe(2);
      expect(title().value).toBe("Mine");
      expect(title().disabled).toBe(false);
      await click("Save task");
      expect(writes[1]!.body).toMatchObject({ title: "Mine", expectedUpdatedAt: "2026-09-27T00:00:00Z" });
    });

    it("sends the read status as the expected status", async () => {
      responder = (url, init) => { if (url.endsWith("/status")) { saved = { ...saved, status: "doing" }; return Response.json(saved); } };
      await mount(); await click("Edit: Alpha (task-alpha)"); await change("Task status", "doing"); await click("Save status");
      expect(writes[0]!.body).toEqual({ status: "doing", expectedStatus: "todo" });
    });

    it("clears the record when the write is definitively rejected", async () => {
      responder = (_url, init) => init?.method === "PATCH" ? Response.json({ error: { code: "TASK_INVALID", message: "bad", retryable: false } }, { status: 422 }) : undefined;
      await mountAs("alice"); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Rejected"); await click("Save task");
      expect(container.textContent).toContain("Unable to update the task.");
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
    });

    it("does not reopen one member's unknown write for another member", async () => {
      responder = (_url, init) => init?.method === "PATCH" ? Promise.reject(new TypeError("offline")) : undefined;
      await mountAs("alice"); await click("Edit: Alpha (task-alpha)"); await change("Task title", "Private"); await click("Save task");
      await refresh("bob");
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(container.textContent).not.toContain("Private");
      expect(browser.sessionStorage.getItem(KEY)).not.toBeNull();
    });

    it("does not send a write it cannot record, and an unreadable record can only be discarded", async () => {
      browser.sessionStorage.setItem(KEY, "{broken");
      await mountAs("alice");
      const blocked = container.querySelector("[data-task-write-record-blocked]") as HTMLElement;
      expect(blocked.textContent).toContain("can't be read");
      await click("Edit: Alpha (task-alpha)"); await change("Task title", "Blocked"); await click("Save task");
      expect(writes).toHaveLength(0);
      expect(container.textContent).toContain("was not sent");
      await click("Close task editor"); await click("Discard changes");
      await click("Discard record");
      expect(container.querySelector("[data-task-write-record-blocked]")).toBeNull();
      expect(browser.sessionStorage.getItem(KEY)).toBeNull();
      await click("Edit: Alpha (task-alpha)"); await change("Task title", "Now sent"); await click("Save task");
      expect(writes).toHaveLength(1);
    });
  });
});
