// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("private task numbered route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/tasks?status=doing&page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("restores filters and page on popstate while aborting the stale request", async () => {
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); requests.push({ url, signal: init?.signal ?? undefined }); return taskPage(url); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    expect(requests[0]?.url).toContain("status=doing"); expect(requests[0]?.url).toContain("page=2");
    await act(async () => { browser.history.pushState({}, "", "/tasks?priority=high&pageSize=50"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(requests[0]?.signal?.aborted).toBe(true); expect(requests.at(-1)?.url).toContain("priority=high"); expect(requests.at(-1)?.url).toContain("pageSize=50");
  });

  it("replaces an empty mutation page with the preceding page once", async () => {
    const urls: string[] = []; let deleted = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); urls.push(url); if (init?.method === "DELETE") { deleted = true; return new Response(null, { status: 204 }); } return taskPage(url, deleted); });
    await act(async () => root.render(<TasksRoute locale={createLocaleRuntime()} search={browser.location.search} />)); await flush();
    const button = container.querySelector("button.bg-destructive") as HTMLButtonElement; expect(button).toBeTruthy();
    await act(async () => button.click()); await flush();
    expect(browser.location.search).toContain("status=doing"); expect(browser.location.search).not.toContain("page=2");
    expect(urls.filter((url) => url.startsWith("/api/tasks?")).length).toBe(3);
  });
});

function taskPage(url: string, empty = false): Response { const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20"); const items = empty && page === 2 ? [] : [{ id: "task-1", title: "Alpha", notes: "", status: "doing", progress: 10, priority: "high", dueAt: null, completedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]; return Response.json({ items, pagination: { page, pageSize, total: empty ? 1 : 21, totalPages: empty ? 1 : 2 } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
