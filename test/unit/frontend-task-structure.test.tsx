// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { TaskItem } from "../../frontend/lib/tasks-data";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("task subtasks and dependencies", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const task: TaskItem = { id: "task-alpha", title: "Alpha", notes: "Original", status: "todo", progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" };
  const subtask = { id: "subtask-1", taskId: task.id, title: "Outline", status: "todo", position: 0, updatedAt: "2026-09-26T00:00:00.000Z" };
  let writes: Array<{ url: string; method: string; body: Record<string, unknown> }>;
  let subtasks: Array<typeof subtask>; let dependencies: unknown[];
  let failCreate = false; let claimPosition = false; let loseReply = false;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/tasks" });
    for (const [name, value] of Object.entries({ window: browser, HTMLElement: browser.HTMLElement, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(name, value);
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.spyOn(browser.crypto, "randomUUID").mockReturnValue("subtask-1");
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
    writes = []; subtasks = []; dependencies = []; failCreate = false; claimPosition = false; loseReply = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? "GET";
      if (method !== "GET") writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (url.endsWith("/subtasks") && method === "GET") return Response.json(subtasks);
      if (url.endsWith("/dependencies") && method === "GET") return Response.json(dependencies);
      if (url.endsWith("/subtasks") && method === "POST") {
        if (failCreate) return new Response(null, { status: 503 });
        const body = JSON.parse(String(init!.body));
        if (claimPosition) {
          claimPosition = false;
          subtasks.push({ ...subtask, id: "competitor", title: "Competitor", position: body.position });
        }
        const existing = subtasks.find((item) => item.id === body.id);
        if (existing) return Response.json({ subtask: existing, created: false });
        if (subtasks.some((item) => item.position === body.position)) return new Response(null, { status: 409 });
        const created = { ...subtask, ...body };
        subtasks = [...subtasks, created];
        if (loseReply) { loseReply = false; return new Response(null, { status: 503 }); }
        return Response.json({ subtask: created, created: true }, { status: 201 });
      }
      if (method === "DELETE" && url.includes("/subtasks/")) { subtasks = subtasks.filter((item) => item.id !== url.split("/").at(-1)); return new Response(null, { status: 204 }); }
      if (method === "PATCH" && url.includes("/subtasks/")) return new Response(null, { status: 409 });
      if (url.endsWith("/dependencies") && method === "POST") {
        dependencies = [{ taskId: task.id, dependsOnTaskId: "task-beta" }];
        return Response.json({ dependency: dependencies[0], created: true }, { status: 201 });
      }
      if (url.startsWith("/api/tasks?")) return Response.json({ items: [task], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      return Response.json({ task, tags: [], links: [] });
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
  async function mount() { await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search="" memberId="alice" />)); await flush(); await flush(); }
  async function click(name: string) {
    const button = [...container.querySelectorAll("button")].find((node) => (node.getAttribute("aria-label") ?? node.textContent) === name);
    expect(button, name).toBeTruthy(); await act(async () => button!.click()); await flush();
  }
  async function change(label: string, value: string) {
    const node = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
    expect(node, label).toBeTruthy();
    const key = Object.keys(node).find((item) => item.startsWith("__reactProps$"))!;
    await act(async () => { node.value = value; (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement }) => void }>)[key]!.onChange({ currentTarget: node }); });
  }

  it("adds a subtask with one id and removes it with the subtask version", async () => {
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Subtask title", "Outline"); await click("Add subtask");
    expect(writes[0]).toMatchObject({ method: "POST", body: { id: "subtask-1", title: "Outline", status: "todo", position: 0 } });
    expect(writes[0]!.url).toBe("/api/tasks/task-alpha/subtasks");
    await click("Remove subtask: Outline");
    expect(writes[1]).toMatchObject({ method: "DELETE", body: { expectedUpdatedAt: subtask.updatedAt } });
  });


  it("adds after deleting a non-last subtask without reusing an occupied position", async () => {
    subtasks = [{ ...subtask, id: "old-first" }, { ...subtask, id: "old-last", title: "Last", position: 1 }];
    await mount(); await click("Edit: Alpha (task-alpha)");
    await click("Remove subtask: Outline");
    await change("Subtask title", "New item"); await click("Add subtask");
    expect(writes.at(-1)!.body).toMatchObject({ id: "subtask-1", title: "New item", position: 2 });
    expect(subtasks.map((item) => item.title)).toEqual(["Last", "New item"]);
    expect(browser.sessionStorage.getItem("memory-garden:task-write:v1:alice")).toBeNull();
  });

  it.each([
    { positions: [8, 2], expected: 9 },
    { positions: [10000, 0, 2], expected: 1 },
  ])("chooses a free bounded position for sparse order $positions", async ({ positions, expected }) => {
    subtasks = positions.map((position) => ({ ...subtask, id: `old-${position}`, title: `Old ${position}`, position }));
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Subtask title", "New item"); await click("Add subtask");
    expect(writes.at(-1)!.body).toMatchObject({ id: "subtask-1", position: expected });
    expect(subtasks.some((item) => item.id === "subtask-1")).toBe(true);
  });

  it("persists the chosen sparse position and retries the identical request after refresh", async () => {
    subtasks = [{ ...subtask, id: "old", title: "Old", position: 8 }]; failCreate = true;
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Subtask title", "New item"); await click("Add subtask");
    const original = writes.at(-1)!;
    expect(original.body).toMatchObject({ id: "subtask-1", position: 9 });
    await act(async () => root.unmount()); root = createRoot(container);
    // The list changed, but an uncertain retry must not pick another position or id.
    subtasks.push({ ...subtask, id: "competing", title: "Competing", position: 9 }); failCreate = false;
    await mount();
    await click("Retry same operation");
    expect(writes.at(-1)).toEqual(original);
    expect(browser.sessionStorage.getItem("memory-garden:task-write:v1:alice")).not.toBeNull();
    expect(container.querySelector("[data-task-list-unknown]")).not.toBeNull();
    const count = writes.length;
    await click("Check the result");
    expect(writes).toHaveLength(count);
    expect(subtasks.some((item) => item.id === "subtask-1")).toBe(false);
  });


  it("reloads a definitively rejected position conflict and preserves the draft for a new deliberate submit", async () => {
    subtasks = [{ ...subtask, id: "old", title: "Old", position: 8 }]; claimPosition = true;
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Subtask title", "New item");
    // History initialization also uses UUIDs; scope these values to submissions.
    vi.mocked(browser.crypto.randomUUID).mockReturnValueOnce("subtask-rejected").mockReturnValue("subtask-accepted");
    await click("Add subtask");
    expect(writes[0]!.body).toMatchObject({ id: "subtask-rejected", position: 9 });
    expect(container.textContent).toContain("changed elsewhere");
    expect((container.querySelector('[aria-label="Subtask title"]') as HTMLInputElement).value).toBe("New item");
    expect(browser.sessionStorage.getItem("memory-garden:task-write:v1:alice")).toBeNull();
    await click("Add subtask");
    expect(writes[1]!.body).toMatchObject({ id: "subtask-accepted", position: 10, title: "New item" });
    expect(subtasks.map((item) => item.id)).toEqual(["old", "competitor", "subtask-accepted"]);
  });

  it.each(["Check the result", "Retry same operation"])("recovers a committed create with a lost reply using %s after refresh", async (action) => {
    subtasks = [{ ...subtask, id: "old", title: "Old", position: 8 }]; loseReply = true;
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Subtask title", "New item"); await click("Add subtask");
    const original = writes[0]!;
    expect(original.body).toMatchObject({ id: "subtask-1", position: 9 });
    expect(subtasks).toHaveLength(2);
    expect(browser.sessionStorage.getItem("memory-garden:task-write:v1:alice")).not.toBeNull();
    await act(async () => root.unmount()); root = createRoot(container);
    await mount(); await click(action);
    expect(writes).toHaveLength(action === "Check the result" ? 1 : 2);
    expect(writes.at(-1)).toEqual(original);
    expect(subtasks).toHaveLength(2);
    expect(browser.sessionStorage.getItem("memory-garden:task-write:v1:alice")).toBeNull();
  });

  it("keeps an unknown subtask after refresh and checks it without sending again", async () => {
    failCreate = true;
    await mount(); await click("Edit: Alpha (task-alpha)");
    await change("Subtask title", "Outline"); await click("Add subtask");
    expect(browser.sessionStorage.getItem("memory-garden:task-write:v1:alice")).toContain("\"subtask-1\"");
    await act(async () => root.unmount()); root = createRoot(container);
    failCreate = false; subtasks = [subtask];
    await mount();
    expect(container.querySelector("[data-task-list-unknown]")).not.toBeNull();
    let left = ""; await act(async () => { left = writeWorkspaceHistory("push", "/settings"); });
    expect(left).toBe("blocked");
    const posts = writes.length;
    await click("Check the result");
    expect(writes).toHaveLength(posts);
    expect(browser.sessionStorage.getItem("memory-garden:task-write:v1:alice")).toBeNull();
  });

  it("reloads when a subtask change conflicts and adds a dependency with the parent version", async () => {
    subtasks = [subtask];
    await mount(); await click("Edit: Alpha (task-alpha)");
    await click("Mark subtask done: Outline");
    expect(writes[0]!.body).toMatchObject({ title: "Outline", status: "done", position: 0, expectedUpdatedAt: subtask.updatedAt });
    expect(container.textContent).toContain("changed elsewhere");
    await change("Depends on task", "task-beta"); await click("Add dependency");
    expect(writes.at(-1)).toMatchObject({ method: "POST", body: { dependsOnTaskId: "task-beta", expectedUpdatedAt: task.updatedAt } });
    expect(writes.at(-1)!.url).toBe("/api/tasks/task-alpha/dependencies");
  });
});
