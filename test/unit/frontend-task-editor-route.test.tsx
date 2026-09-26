// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../frontend/lib/tasks-data";
import { TasksRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

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
    await change("Knowledge item ID", "knowledge-one"); await click("Link knowledge"); expect(writes.at(-1)!.body).toEqual({ knowledgeItemId: "knowledge-one" });
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
    await change("Task status", "doing"); await click("Save status"); expect(writes.at(-1)!.body).toEqual({ status: "doing" });
    await change("Task progress", "40"); await click("Save progress"); expect(writes.at(-1)!.body).toEqual({ progress: 40 });
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
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(browser.document.activeElement).toBe(trigger);
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
});
