// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const task: Record<string, unknown> = {
  id: "task-1",
  title: "Ship the guide",
  notes: "Private note",
  status: "todo",
  priority: "high",
  progress: 40,
  dueAt: null,
  completedAt: null,
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
};

describe("task list notes read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => {
    task.notes = "Private note";
    browser = new Window({ url: "https://app.test/tasks" });
    vi.stubGlobal("window", browser); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not hide a missing note as an empty task", async () => {
    delete task.notes;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Ship the guide");
  });

  it("shows an explicit empty note without extra note text", async () => {
    task.notes = "";
    await mount();
    expect(container.textContent).toContain("Ship the guide");
    expect(container.textContent).not.toContain("Private note");
    expect(container.textContent).not.toContain("Unable to load the page.");
  });

  it("shows an explicit note", async () => {
    await mount();
    expect(container.textContent).toContain("Ship the guide");
    expect(container.textContent).toContain("Private note");
    expect(container.textContent).not.toContain("Unable to load the page.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...task }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    await act(async () => root.render(<TasksRoute locale={locale} search="" />));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Unable to load the page.") || text.includes("Ship the guide")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
