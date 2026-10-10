import { ApiRequestError } from "../../frontend/lib/api";
import { saveGraphAction } from "../../frontend/lib/graph-action-intent";
import { focusReceipt, taskReceipt } from "../helpers/graph-action-receipts";
// @vitest-environment node
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphPage, GraphRoute, type GraphPageState } from "../../frontend/pages/graph-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
import { pageKindForPath } from "../../frontend/app-routes";
import { routeCapability, WORKSPACE_ROUTE_CAPABILITIES } from "../../shared/workspace-route-capabilities";
import type { GraphQueryInput, GraphSnapshot } from "../../frontend/lib/graph-data";

vi.mock("../../frontend/components/graph/graph-canvas", () => ({
  GraphCanvas: ({ snapshot, fallbackLabel, onSelect }: { snapshot: GraphSnapshot; fallbackLabel?: string; onSelect?: (id: string) => void }) => (
    <div data-graph-canvas aria-label={fallbackLabel}>
      {snapshot.nodes.map((node) => <div key={node.id} role="button" data-graph-node-id={node.id} onMouseDown={() => queueMicrotask(() => onSelect?.(node.id))}>{node.label}</div>)}
    </div>
  ),
}));

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) {
      context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));

const { Window } = await import("happy-dom");

const snapshot: GraphSnapshot = {
  nodes: [
    { id: "project:p1", kind: "project", label: "Launch", status: "active", href: "/projects/p1", metadata: {} },
    { id: "task:t1", kind: "task", label: "Draft brief", status: "todo", href: "/tasks/t1", metadata: {} },
  ],
  edges: [{ id: "edge-1", source: "project:p1", target: "task:t1", kind: "belongs_to", label: "Contains", weight: 1, citationIds: [] }],
  rootId: null,
  depth: 2,
  truncated: false,
};

function renderState(locale: ReturnType<typeof createLocaleRuntime>, state: GraphPageState) {
  return renderToStaticMarkup(<GraphPage locale={locale} state={state} />);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

let browser: InstanceType<typeof Window>;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  browser = new Window({ url: "https://app.test/graph" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event"] as const) {
    vi.stubGlobal(key, key === "window" ? browser : browser[key]);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await browser.happyDOM.close();
  vi.unstubAllGlobals();
});

describe("GraphPage", () => {
  it.each([
    ["loading", { kind: "loading" }],
    ["error", { kind: "error" }],
    ["empty", { kind: "empty" }],
  ] as const)("renders the %s state without leaking undefined", (_, state) => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });
    const html = renderState(locale, state);
    expect(html).toContain(frontendText(locale, `GRAPH_${state.kind.toUpperCase()}`));
    expect(html).not.toContain("undefined");
  });

  it("renders ready and truncated graph states with the canvas and local lens controls", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });
    const html = renderState(locale, { kind: "ready", snapshot });
    expect(html).toContain(frontendText(locale, "GRAPH_TITLE"));
    expect(html).toContain('data-graph-canvas');
    expect(html).toContain('data-graph-node-id="project:p1"');
    expect(html).toContain('data-graph-query');
    expect(html).toContain('data-graph-lens');
    expect(html).not.toContain("undefined");

    const truncated = renderState(locale, { kind: "truncated", snapshot: { ...snapshot, truncated: true } });
    expect(truncated).toContain(frontendText(locale, "GRAPH_TRUNCATED"));
    expect(truncated).not.toContain("undefined");
  });

  it("keeps Hook order stable across a real loading-to-ready transition", async () => {
    const pending = deferred<GraphSnapshot>();
    const load = vi.fn(() => pending.promise);
    const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });

    act(() => root.render(<GraphRoute locale={locale} load={load} />));
    await act(async () => { await Promise.resolve(); });
    expect(host.querySelector("[data-graph-page-loading]")).not.toBeNull();

    await act(async () => {
      pending.resolve(snapshot);
      await pending.promise;
      await Promise.resolve();
    });

    expect(host.querySelector("[data-graph-page]")).not.toBeNull();
    expect(host.querySelector('[data-graph-node-id="project:p1"]')).not.toBeNull();
    expect(host.textContent).not.toContain("undefined");
  });

  it("renders the graph shell in both supported locales", () => {
    const english = renderState(createLocaleRuntime({ navigatorLanguage: "en-US" }), { kind: "empty" });
    const chineseLocale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const chinese = renderState(chineseLocale, { kind: "empty" });
    expect(english).toContain("No work graph data yet");
    expect(chinese).toContain(frontendText(chineseLocale, "GRAPH_EMPTY"));
    expect(chinese).not.toContain("undefined");
  });

  it("blocks leaving while a graph action is running and keeps that action when another node is selected", async () => {
    let resolveAction!: (response: Response) => void;
    const posts: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url: String(input), body: String(init.body) });
        return new Promise<Response>((resolve) => { resolveAction = resolve; });
      }
      return Response.json({});
    });
    await renderReadyGraph();
    await clickNode("task:t1");
    const start = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === "Start focus") as HTMLButtonElement;
    await act(async () => { start.click(); start.click(); });
    expect(posts).toHaveLength(1);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    const unload = new browser.Event("beforeunload", { cancelable: true });
    browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await clickNode("project:p1");
    expect(host.querySelector("[data-graph-inspector-actions]")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    expect(posts).toHaveLength(1);

    await act(async () => resolveAction(Response.json(focusReceipt(JSON.parse(posts[0]!.body).id))));
    await flush();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("retries an unconfirmed graph action with the same identity after the node is filtered out", async () => {
    const posts: string[] = [];
    let attempt = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        attempt += 1;
        if (attempt === 1) throw new TypeError("network down");
        return Response.json(focusReceipt(JSON.parse(String(init?.body ?? "{}")).id));
      }
      return Response.json({});
    });
    await renderReadyGraph();
    await clickNode("task:t1");
    await clickButton("Start focus");
    await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")?.textContent).toContain("was not confirmed");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");

    await change(host.querySelector("[data-graph-lens]") as HTMLSelectElement, "knowledge");
    await flush();
    expect(host.querySelector('[data-graph-node-id="task:t1"]')).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    await clickButton("Retry action");
    await flush();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toBe(posts[1]);
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("restores an unconfirmed graph action after remount and retries the same identity", async () => {
    const posts: string[] = [];
    let fail = true;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        if (fail) throw new TypeError("network down");
        return Response.json(focusReceipt(JSON.parse(String(init?.body ?? "{}")).id));
      }
      return Response.json({});
    });
    await renderMemberGraph();
    await clickNode("task:t1");
    await clickButton("Start focus");
    await flush();
    const stored = browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a");
    const clientKey = JSON.parse(posts[0]!).clientKey as string;
    expect(stored).toContain("task:t1");
    expect(stored).toContain(clientKey);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");

    act(() => root.unmount());
    root = createRoot(host);
    await renderMemberGraph();
    expect(posts).toHaveLength(1);
    expect(host.querySelector("[data-graph-action-unconfirmed]")?.textContent).toContain("was not confirmed");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    fail = false;
    await clickButton("Retry action");
    await flush();
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[1]!).clientKey).toBe(clientKey);
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("shows the original operation ID and confirms it with GET only while blocking retries", async () => {
    const clientKey = "graph-action:t1:query-key";
    const intent = { node: snapshot.nodes[1]!, clientKey };
    expect(saveGraphAction("member-a", intent)).toBe(true);
    const pending = deferred<Response>();
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", (path: RequestInfo | URL, init?: RequestInit) => { calls.push({ path: String(path), init }); return pending.promise; });
    await renderMemberGraph();
    expect(host.querySelector("[data-graph-operation-id]")?.textContent).toContain(clientKey);
    await clickButton("Check exact result");
    await clickButton("Check exact result");
    await clickButton("Retry action");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: `/api/focus/${encodeURIComponent(clientKey)}`, init: { method: "GET", cache: "no-store" } });
    expect(calls[0]!.init!.body).toBeUndefined();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    await act(async () => pending.resolve(Response.json(focusReceipt(clientKey).session)));
    await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it.each([404, 500, "wrong-target"] as const)("keeps the original intent when exact lookup cannot confirm (%s)", async (failure) => {
    const clientKey = "query-failed";
    expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey })).toBe(true);
    const stored = browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a");
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (path: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(path), init });
      if (init?.method === "POST") return Response.json(focusReceipt(clientKey, "t1", false));
      return typeof failure === "number" ? Response.json({}, { status: failure }) : Response.json(focusReceipt(clientKey, "other-task").session);
    });
    await renderMemberGraph();
    await clickButton("Check exact result"); await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
    expect(host.textContent).toContain("could not confirm");
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBe(stored);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    await clickButton("Retry action"); await flush();
    expect(calls.map((c) => c.init?.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(String(calls[1]!.init?.body))).toMatchObject({ id: clientKey, clientKey, taskId: "t1" });
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
  });

  it("allows exact lookup of a restored intent even when the graph is empty", async () => {
    const clientKey = "query-empty";
    expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey })).toBe(true);
    vi.stubGlobal("fetch", async () => Response.json(focusReceipt(clientKey).session));
    const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });
    await act(async () => root.render(<GraphPage locale={locale} memberId="member-a" state={{ kind: "empty" }} />));
    await clickButton("Check exact result"); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("aborts an exact lookup on unmount and ignores its late success", async () => {
    const clientKey = "query-aborted";
    expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey })).toBe(true);
    const pending = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_path: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal ?? undefined; return pending.promise; });
    await renderMemberGraph();
    await clickButton("Check exact result");
    act(() => root.unmount()); root = createRoot(host);
    expect(signal?.aborted).toBe(true);
    await renderMemberGraph();
    await act(async () => pending.resolve(Response.json(focusReceipt(clientKey).session)));
    await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toContain(clientKey);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
  });

  it.each([401, 403])("preserves unresolved operation identity when exact lookup denies access (%i)", async (status) => {
    expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey: "query-denied" })).toBe(true);
    vi.stubGlobal("fetch", async () => Response.json({}, { status }));
    await renderMemberGraph();
    await clickButton("Check exact result"); await flush();
    expect(host.textContent).toContain("permission");
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toContain("query-denied");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("keeps the operation locked if clearing its confirmed record fails", async () => {
    const clientKey = "query-storage-failed";
    expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey })).toBe(true);
    vi.stubGlobal("fetch", async () => Response.json(focusReceipt(clientKey).session));
    await renderMemberGraph();
    const remove = vi.spyOn(browser.sessionStorage, "removeItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    await clickButton("Check exact result"); await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toContain(clientKey);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    remove.mockRestore();
    await clickButton("Check exact result"); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("keeps a knowledge action pending across remount until its link is confirmed", async () => {
    const graph: GraphSnapshot = { ...snapshot, nodes: [{ id: "knowledge:knowledge-1", kind: "knowledge", label: "Review knowledge", status: null, href: "/knowledge/knowledge-1", metadata: {} }], edges: [] };
    const posts: string[] = [];
    let complete = false;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      posts.push(String(init?.body));
      const receipt = taskReceipt(JSON.parse(String(init?.body)).id, false);
      return Response.json(complete ? receipt : { task: receipt.task, created: false });
    });
    await renderMemberGraph(graph);
    await clickNode("knowledge:knowledge-1");
    await clickButton("Create task");
    await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
    const stored = browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a");
    expect(stored).toContain(JSON.parse(posts[0]!).id);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    act(() => root.unmount());
    root = createRoot(host);
    await renderMemberGraph(graph);
    expect(posts).toHaveLength(1);
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBe(stored);
    complete = true;
    await clickButton("Retry action");
    await flush();
    expect(posts).toEqual([posts[0], posts[0]]);
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("retains an unknown successful-HTTP receipt across remount and only unlocks on the matching replay", async () => {
    const posts: string[] = [];
    let valid = false;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json({});
      posts.push(String(init.body));
      const intent = JSON.parse(String(init.body));
      return Response.json(valid ? { created: false, session: {
        id: intent.id, clientKey: intent.clientKey, taskId: intent.taskId,
        memberId: "member-a", calendarEventId: null, startTitle: "Draft brief", durationMinutes: 25,
        status: "active", startedAt: "2026-10-10T00:00:00.000Z", pausedAt: null, endedAt: null,
        elapsedMs: 0, createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z",
      } } : {});
    });
    await renderMemberGraph();
    await clickNode("task:t1");
    await clickButton("Start focus");
    await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
    const stored = browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a");
    expect(stored).toContain(JSON.parse(posts[0]!).clientKey);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    act(() => root.unmount());
    root = createRoot(host);
    await renderMemberGraph();
    expect(posts).toHaveLength(1);
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBe(stored);
    valid = true;
    await clickButton("Retry action");
    await flush();
    expect(posts).toEqual([posts[0], posts[0]]);
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("does not send a graph action when this tab cannot record it", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") posts += 1;
      return Response.json(focusReceipt(JSON.parse(String(init?.body ?? "{}")).id));
    });
    await renderMemberGraph();
    await clickNode("task:t1");
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    await clickButton("Start focus");
    await flush();
    expect(posts).toBe(0);
    expect(host.textContent).toContain("could not record");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("blocks a new graph action but not leave when the stored action cannot be read, until it is discarded", async () => {
    browser.sessionStorage.setItem("memory-garden:graph-action:v1:member-a", "{");
    let posts = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") posts += 1;
      return Response.json(focusReceipt(JSON.parse(String(init?.body ?? "{}")).id));
    });
    await renderMemberGraph();
    expect(host.textContent).toContain("can't be read");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
    await clickNode("task:t1");
    const start = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === "Start focus") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    await act(async () => start.click());
    expect(posts).toBe(0);
    await clickButton("Discard record");
    await flush();
    expect(host.textContent).not.toContain("can't be read");
    await clickButton("Start focus");
    await flush();
    expect(posts).toBe(1);
  });

  it.each([400, 404, 409, 422])("preserves an unresolved operation after replay is rejected with %s", async (status) => {
    const graph: GraphSnapshot = { ...snapshot, nodes: [{ id: "knowledge:knowledge-1", kind: "knowledge", label: "Review knowledge", status: null, href: "/knowledge/knowledge-1", metadata: {} }], edges: [] };
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ path: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (requests.length === 1) throw new TypeError("response lost after commit");
      if (init?.method === "POST") return Response.json({ error: { code: status === 409 ? "TASK_CREATE_CONFLICT" : "TASK_KNOWLEDGE_NOT_FOUND", message: "Cannot confirm prior operation", retryable: false } }, { status });
      const key = JSON.parse(requests[0]!.body!).id as string;
      const receipt = taskReceipt(key, false);
      return Response.json({ task: receipt.task, links: [{ ...receipt.link, knowledgeTitle: "Review knowledge" }] });
    });
    await renderMemberGraph(graph);
    await clickNode("knowledge:knowledge-1");
    await clickButton("Create task"); await flush();
    const storageKey = "memory-garden:graph-action:v1:member-a";
    const original = browser.sessionStorage.getItem(storageKey);
    expect(original).not.toBeNull();
    await clickButton("Retry action"); await flush();
    expect(requests[1]!.body).toBe(requests[0]!.body);
    expect(browser.sessionStorage.getItem(storageKey)).toBe(original);
    expect(host.textContent).not.toContain("nothing was saved");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    act(() => root.unmount()); root = createRoot(host);
    await renderMemberGraph(graph);
    expect(requests).toHaveLength(2);
    expect(host.querySelector("[data-graph-operation-id]")?.textContent).toBe(JSON.parse(requests[0]!.body!).id);
    await clickButton("Check exact result"); await flush();
    expect(requests).toHaveLength(3);
    expect(requests[2]).toEqual({ path: `/api/tasks/${encodeURIComponent(JSON.parse(requests[0]!.body!).id)}`, method: "GET", body: undefined });
    expect(browser.sessionStorage.getItem(storageKey)).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("releases a first FOCUS_ALREADY_OPEN rejection so the existing session can be managed", async () => {
    const requests: Array<{ path: string; method: string }> = [];
    vi.stubGlobal("fetch", async (path: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ path: String(path), method: init?.method ?? "GET" });
      return Response.json({ error: { code: "FOCUS_ALREADY_OPEN", message: "A focus session is already open", retryable: false } }, { status: 409 });
    });
    await renderMemberGraph();
    await clickNode("task:t1");
    await clickButton("Start focus"); await flush();
    expect(requests).toEqual([{ path: "/api/focus", method: "POST" }]);
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(host.textContent).toContain("The action was rejected and nothing was saved.");
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
    const unload = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    await act(async () => { expect(writeWorkspaceHistory("push", "/focus")).toBe("committed"); });
    expect(window.location.pathname).toBe("/focus");
    act(() => root.unmount()); root = createRoot(host);
    await renderMemberGraph();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it("does not erase a previous unknown focus start when its retry returns FOCUS_ALREADY_OPEN", async () => {
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", async (path: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ path: String(path), method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (requests.length === 1) throw new TypeError("start response lost");
      if (init?.method === "POST") return Response.json({ error: { code: "FOCUS_ALREADY_OPEN", message: "A focus session is already open", retryable: false } }, { status: 409 });
      const key = JSON.parse(requests[0]!.body!).id as string;
      return Response.json({ ...focusReceipt(key).session, status: "completed", endedAt: "2026-10-10T00:25:00.000Z", elapsedMs: 1500000, updatedAt: "2026-10-10T00:25:00.000Z" });
    });
    await renderMemberGraph();
    await clickNode("task:t1");
    await clickButton("Start focus"); await flush();
    const storageKey = "memory-garden:graph-action:v1:member-a";
    const original = browser.sessionStorage.getItem(storageKey);
    expect(original).not.toBeNull();
    await clickButton("Retry action"); await flush();
    expect(requests[1]!.body).toBe(requests[0]!.body);
    expect(browser.sessionStorage.getItem(storageKey)).toBe(original);
    expect(host.textContent).not.toContain("nothing was saved");
    expect(writeWorkspaceHistory("push", "/focus")).toBe("blocked");
    act(() => root.unmount()); root = createRoot(host);
    await renderMemberGraph();
    expect(requests).toHaveLength(2);
    await clickButton("Check exact result"); await flush();
    expect(requests[2]).toEqual({ path: `/api/focus/${encodeURIComponent(JSON.parse(requests[0]!.body!).id)}`, method: "GET", body: undefined });
    expect(browser.sessionStorage.getItem(storageKey)).toBeNull();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    await act(async () => { expect(writeWorkspaceHistory("push", "/focus")).toBe("committed"); });
  });

  it("keeps a focus start uncertain when a server failure carries the already-open error code", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { code: "FOCUS_ALREADY_OPEN", message: "Server failure", retryable: true } }, { status: 500 }));
    await renderMemberGraph();
    await clickNode("task:t1");
    await clickButton("Start focus"); await flush();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).not.toBeNull();
    expect(writeWorkspaceHistory("push", "/focus")).toBe("blocked");
  });

  it.each([404, 409])("does not infer that an initial %s response proves no task was saved", async (status) => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { code: status === 409 ? "TASK_CREATE_CONFLICT" : "TASK_KNOWLEDGE_NOT_FOUND", message: "Prior state cannot be confirmed", retryable: false } }, { status }));
    await renderMemberGraph();
    await clickNode("task:t1");
    await clickButton("Start focus"); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).not.toBeNull();
    expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
    expect(host.textContent).not.toContain("nothing was saved");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
  });

  it("releases the leave lock when a graph action is rejected before it is saved", async () => {
    const keys: string[] = [];
    let attempt = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        attempt += 1;
        keys.push(JSON.parse(String(init.body)).clientKey as string);
        return attempt === 1
          ? Response.json({ error: { code: "FOCUS_INVALID", message: "invalid", retryable: false } }, { status: 400 })
          : Response.json(focusReceipt(JSON.parse(String(init?.body ?? "{}")).id));
      }
      return Response.json({});
    });
    await renderReadyGraph();
    await clickNode("task:t1");
    await clickButton("Start focus");
    await flush();
    expect(host.textContent).toContain("The action was rejected and nothing was saved.");
    expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
    await clickButton("Start focus");
    await flush();
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("does not lock leaving when the action is not sent", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") posts.push(String(input));
      return Response.json({});
    });
    const decisionSnapshot: GraphSnapshot = {
      ...snapshot,
      nodes: [...snapshot.nodes, { id: "decision:d1", kind: "decision", label: "Decide", status: "open", href: "/decisions/d1", metadata: {} }],
    };
    await renderReadyGraph(decisionSnapshot);
    await clickNode("decision:d1");
    await clickButton("Create action item");
    await flush();
    expect(posts).toHaveLength(0);
    expect(host.textContent).toContain("The action was not sent.");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it.each([401, 403])("clears the graph and the action lock when the action is denied with %s", async (status) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ error: { code: "FORBIDDEN", message: "denied", retryable: false } }, { status })
      : Response.json({}));
    await renderReadyGraph();
    await clickNode("task:t1");
    await clickButton("Start focus");
    await flush();
    expect(host.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    expect(host.querySelector("[data-graph-node-id]")).toBeNull();
    expect(host.textContent).not.toContain("Draft brief");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("registers and dispatches the authenticated graph route", () => {
    expect(routeCapability("/graph")).toMatchObject({ id: "graph", path: "/graph", pageKind: "graph", group: "workspace", requiredPermission: "workspace.tasks" });
    expect(pageKindForPath("/graph")).toBe("graph");
    expect(WORKSPACE_ROUTE_CAPABILITIES.some((route) => route.path === "/graph" && route.availability === "ready")).toBe(true);
  });
});

describe("graph view refresh", () => {
  const viewKey = "memory-garden:graph-view:v1:member-a";
  const query = () => host.querySelector("[data-graph-query]") as HTMLInputElement;
  const lens = () => host.querySelector("[data-graph-lens]") as HTMLSelectElement;
  async function typeQuery(value: string) {
    const el = query();
    const key = Object.keys(el).find((name) => name.startsWith("__reactProps$"));
    await act(async () => { (el as unknown as Record<string, { onChange: (event: { currentTarget: { value: string } }) => void }>)[key!].onChange({ currentTarget: { value } }); });
  }
  async function render(load = vi.fn(async (_input: GraphQueryInput) => snapshot)) {
    await act(async () => { root.render(<GraphRoute memberId="member-a" locale={createLocaleRuntime()} load={load} />); });
    await flush();
    return load;
  }
  async function remount(load = vi.fn(async (_input: GraphQueryInput) => snapshot)) {
    act(() => root.unmount());
    root = createRoot(host);
    return render(load);
  }

  it("keeps graph filters after refresh and does not block leave", async () => {
    const load = await render();
    await typeQuery("Launch");
    await change(lens(), "knowledge");
    await flush();
    expect(window.sessionStorage.getItem(viewKey)).toContain("Launch");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
    const again = await remount();
    expect(query().value).toBe("Launch");
    expect(lens().value).toBe("knowledge");
    expect(again.mock.calls.some(([input]) => input.scope === "knowledge")).toBe(true);
    expect(load.mock.calls.some(([input]) => input.scope === "knowledge")).toBe(true);
    expect(writeWorkspaceHistory("push", "/home")).toBe("committed");
  });

  it("keeps the graph filters on screen when the tab cannot record them", async () => {
    await render();
    const storage = window.sessionStorage;
    const original = storage.setItem;
    Object.defineProperty(storage, "setItem", { configurable: true, writable: true, value(key: string, value: string) { if (String(key).includes("graph-view")) throw new Error("full"); return original.call(storage, key, value); } });
    await typeQuery("Launch");
    await flush();
    expect(query().value).toBe("Launch");
    expect(host.textContent).toContain("could not record");
  });

  it("allows leave when the graph filters cannot be read and records only after discard", async () => {
    window.sessionStorage.setItem(viewKey, "{");
    await render();
    expect(host.textContent).toContain("can't be read");
    expect(query().value).toBe("");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
    const discard = [...host.querySelectorAll("button")].find((item) => item.textContent === "Discard record") as HTMLButtonElement;
    await act(async () => discard.click());
    await typeQuery("After discard");
    await flush();
    expect(window.sessionStorage.getItem(viewKey)).toContain("After discard");
  });
});

async function renderReadyGraph(graph: GraphSnapshot = snapshot) {
  const load = vi.fn(async () => graph);
  await act(async () => { root.render(<GraphRoute locale={createLocaleRuntime()} load={load} />); });
  await flush();
}

async function renderMemberGraph(graph: GraphSnapshot = snapshot) {
  const load = vi.fn(async () => graph);
  await act(async () => { root.render(<GraphRoute memberId="member-a" locale={createLocaleRuntime()} load={load} />); });
  await flush();
}

async function clickNode(id: string) {
  const node = host.querySelector(`[data-graph-node-id="${id}"]`) as HTMLButtonElement;
  expect(node).not.toBeNull();
  await act(async () => node.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true })));
}

async function clickButton(label: string) {
  const button = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === label) as HTMLButtonElement | undefined;
  expect(button, `${label} :: ${host.textContent}`).toBeTruthy();
  await act(async () => button!.click());
}

async function change(control: HTMLSelectElement, value: string) {
  await act(async () => { control.value = value; control.dispatchEvent(new window.Event("change", { bubbles: true })); });
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); });
}


it.each([409, 500])("handles first task capacity response %s without confusing a server failure with rejection", async status => {
  const graph: GraphSnapshot = { ...snapshot, nodes: [{ id: "knowledge:knowledge-1", kind: "knowledge", label: "Capacity knowledge", status: null, href: "/knowledge/knowledge-1", metadata: {} }], edges: [] };
  vi.stubGlobal("fetch", async () => Response.json({ error: { code: "TASK_LIMIT_REACHED", message: "Capacity reached", retryable: status >= 500 } }, { status }));
  await renderMemberGraph(graph); await clickNode("knowledge:knowledge-1");
  await clickButton("Create task"); await flush();
  expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a") === null).toBe(status === 409);
  expect(host.querySelector("[data-graph-action-unconfirmed]") === null).toBe(status === 409);
  await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe(status === 409 ? "committed" : "blocked"); });
});

it("preserves an unknown task creation when same-key replay reaches capacity", async () => {
  const graph: GraphSnapshot = { ...snapshot, nodes: [{ id: "knowledge:knowledge-1", kind: "knowledge", label: "Capacity knowledge", status: null, href: "/knowledge/knowledge-1", metadata: {} }], edges: [] };
  const bodies: string[] = [];
  vi.stubGlobal("fetch", async (_path: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      bodies.push(String(init.body));
      if (bodies.length === 1) throw new TypeError("Lost response");
      return Response.json({ error: { code: "TASK_LIMIT_REACHED", message: "Capacity reached", retryable: false } }, { status: 409 });
    }
    return Response.json({ error: { code: "TASK_NOT_FOUND", message: "Missing", retryable: false } }, { status: 404 });
  });
  await renderMemberGraph(graph); await clickNode("knowledge:knowledge-1");
  await clickButton("Create task"); await flush();
  const original = browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a");
  await clickButton("Retry action"); await flush();
  expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
  await clickButton("Check exact result"); await flush();
  expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBe(original);
  expect(host.querySelector("[data-graph-action-unconfirmed]")).not.toBeNull();
  expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
});


describe("revoked graph recovery", () => {
  it.each([[401, "success"], [403, "success"], [401, "error"], [403, "error"]] as const)("preserves denial against an older graph response (%i, %s)", async (status, outcome) => {
    expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey: "query-denied-late" })).toBe(true);
    const pending = deferred<GraphSnapshot>();
    let readSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async () => Response.json({}, { status }));
    const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });
    await act(async () => root.render(<GraphRoute locale={locale} memberId="member-a" load={(_query, signal) => { readSignal = signal; return pending.promise.then(value => { if (outcome === "error") throw new Error("late graph failure"); return value; }); }} />));
    await clickButton("Check exact result"); await flush();
    expect(host.textContent).toContain("permission");
    expect(host.querySelector("[data-graph-canvas]")).toBeNull();
    expect(readSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(snapshot));
    await flush();
    expect(host.querySelector("[data-graph-canvas]")).toBeNull();
    expect(host.textContent).toContain("permission");
  });
});


it.each([401, 403])("restores the same operation after a denied retry and a fresh authorized read (%i)", async status => {
  const clientKey = "retry-denied-restore";
  expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey })).toBe(true);
  const stored = browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a");
  const calls: { path: string; init?: RequestInit }[] = [];
  let denied = true;
  vi.stubGlobal("fetch", async (path: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ path: String(path), init });
    return denied ? Response.json({}, { status }) : Response.json(focusReceipt(clientKey).session);
  });
  await renderMemberGraph();
  await clickButton("Retry action"); await flush();
  expect(host.querySelector("[data-page-state='forbidden']")).not.toBeNull();
  expect(host.textContent).not.toContain("Draft brief");
  expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBe(stored);
  // The leave guard is gone, but the unresolved intent must survive authentication recovery.
  await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed"); });
  denied = false;
  await clickButton("Try the work graph again"); await flush();
  expect(host.querySelector("[data-graph-operation-id]")?.textContent).toBe(clientKey);
  expect(calls.map(call => call.init?.method)).toEqual(["POST"]);
  await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked"); });
  await clickButton("Check exact result"); await flush();
  expect(calls.map(call => call.init?.method)).toEqual(["POST", "GET"]);
  expect(calls[1]?.path).toBe(`/api/focus/${clientKey}`);
  expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ id: clientKey, clientKey, taskId: "t1" });
  expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
});

it.each([401, 403])("clears a definite first rejection without blocking the member's next graph action (%i)", async status => {
  vi.stubGlobal("fetch", async () => Response.json({}, { status }));
  await renderMemberGraph(); await clickNode("task:t1"); await clickButton("Start focus"); await flush();
  expect(host.querySelector("[data-page-state='forbidden']")).not.toBeNull();
  expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
  await clickButton("Try the work graph again"); await flush();
  expect(host.querySelector("[data-graph-action-unconfirmed]")).toBeNull();
  await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed"); });
});


it.each([401, 403])("releases the restored lock when the graph read itself denies access (%i)", async status => {
  const clientKey = "graph-read-denied";
  expect(saveGraphAction("member-a", { node: snapshot.nodes[1]!, clientKey })).toBe(true);
  const stored = browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a");
  let denied = true;
  const load = async () => {
    if (denied) throw new ApiRequestError("FORBIDDEN", "denied", status, false);
    return snapshot;
  };
  const requester = vi.fn(async () => Response.json(focusReceipt(clientKey).session));
  vi.stubGlobal("fetch", requester);
  await act(async () => root.render(<GraphRoute memberId="member-a" locale={createLocaleRuntime()} load={load} />));
  await flush();
  expect(host.querySelector("[data-page-state='forbidden']")).not.toBeNull();
  expect(host.textContent).not.toContain("Draft brief");
  expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBe(stored);
  await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed"); });
  denied = false;
  await clickButton("Try the work graph again"); await flush();
  expect(host.querySelector("[data-graph-operation-id]")?.textContent).toBe(clientKey);
  expect(requester).not.toHaveBeenCalled();
  await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked"); });
  await clickButton("Check exact result"); await flush();
  expect(requester).toHaveBeenCalledTimes(1);
  expect(browser.sessionStorage.getItem("memory-garden:graph-action:v1:member-a")).toBeNull();
});


describe("graph suggestion request ownership", () => {
  const suggestions = { suggestions: [{ id: "private-suggestion", kind: "task_to_knowledge", title: "Private old suggestion", rationale: "Private old rationale", sourceNodeIds: ["task:t1"], targetNodeIds: [], citationIds: [], evidenceGap: true, promotionRequired: true }] };
  const generate = () => clickButton("Generate suggestions");

  it("reserves suggestion generation synchronously against same-event double clicks", async () => {
    const pending = deferred<Response>();
    const requester = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", requester);
    await renderMemberGraph();
    const button = host.querySelector("[data-graph-suggestions] button") as HTMLButtonElement;
    await act(async () => { button.click(); button.click(); });
    expect(requester).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(Response.json(suggestions)));
    await flush();
    expect(host.textContent).toContain("Private old suggestion");
  });

  it.each([401, 403])("treats suggestion %i as revocation, not an ordinary panel error", async status => {
    vi.stubGlobal("fetch", async () => Response.json({}, { status }));
    await renderMemberGraph(); await generate(); await flush();
    expect(host.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    expect(host.querySelector("[data-graph-canvas]")).toBeNull();
    expect(host.textContent).not.toContain("Draft brief");
    await clickButton("Try the work graph again"); await flush();
    expect(host.querySelector("[data-graph-page]")).not.toBeNull();
    expect(host.querySelector("[data-graph-suggestions] [role=alert]")).toBeNull();
  });

  it.each(["settled", "pending"] as const)("does not resurrect %s suggestions after graph-read revocation and recovery", async phase => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    const requester = vi.fn((_path: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return pending.promise; });
    vi.stubGlobal("fetch", requester);
    let denied = false;
    const load = vi.fn(async () => {
      if (denied) throw new ApiRequestError("FORBIDDEN", "denied", 403, false);
      return snapshot;
    });
    await act(async () => root.render(<GraphRoute memberId="member-a" locale={createLocaleRuntime()} load={load} />));
    await flush(); await generate();
    if (phase === "settled") {
      await act(async () => pending.resolve(Response.json(suggestions))); await flush();
      expect(host.textContent).toContain("Private old suggestion");
    }
    denied = true;
    await change(host.querySelector("[data-graph-time-range]") as HTMLSelectElement, "7d"); await flush();
    expect(host.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    denied = false;
    await clickButton("Try the work graph again"); await flush();
    if (phase === "pending") {
      // The transport deliberately ignores abort: ownership must reject a late success too.
      await act(async () => pending.resolve(Response.json(suggestions))); await flush();
    }
    expect(host.querySelector("[data-graph-page]")).not.toBeNull();
    expect(host.textContent).not.toContain("Private old suggestion");
    if (phase === "pending") expect(signal?.aborted).toBe(true);
    expect(requester).toHaveBeenCalledTimes(1);
  });

  it("cancels suggestions on denied graph actions and ignores their late receipt", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (path: string, init?: RequestInit) => {
      if (path === "/api/graph/suggestions") { signal = init?.signal ?? undefined; return pending.promise; }
      return Promise.resolve(Response.json({}, { status: 403 }));
    });
    await renderMemberGraph(); await generate();
    await clickNode("task:t1"); await clickButton("Start focus"); await flush();
    expect(host.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    await clickButton("Try the work graph again"); await flush();
    await act(async () => pending.resolve(Response.json(suggestions))); await flush();
    expect(host.textContent).not.toContain("Private old suggestion");
    expect(signal?.aborted).toBe(true);
  });

  it.each(["success", "denied", "error"] as const)("invalidates an older suggestion %s when the graph scope changes", async outcome => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    const requester = vi.fn((_path: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return pending.promise; });
    vi.stubGlobal("fetch", requester);
    await renderMemberGraph(); await generate();
    await change(host.querySelector("[data-graph-time-range]") as HTMLSelectElement, "7d"); await flush();
    await act(async () => pending.resolve(outcome === "success" ? Response.json(suggestions) : Response.json({}, { status: outcome === "denied" ? 403 : 503 })));
    await flush();
    expect(host.querySelector("[data-graph-page]")).not.toBeNull();
    expect(host.textContent).not.toContain("Private old suggestion");
    expect(host.querySelector("[data-graph-suggestions] [role=alert]")).toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(requester).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "denied", "error"] as const)("does not let an old %s release or overwrite the newer request", async outcome => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    const requester = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    vi.stubGlobal("fetch", requester);
    await renderMemberGraph(); await generate();
    await change(host.querySelector("[data-graph-time-range]") as HTMLSelectElement, "7d"); await flush();
    await generate();
    await act(async () => old.resolve(outcome === "success" ? Response.json(suggestions) : Response.json({}, { status: outcome === "denied" ? 403 : 503 })));
    await flush();
    const button = host.querySelector("[data-graph-suggestions] button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(host.textContent).not.toContain("Private old suggestion");
    expect(host.querySelector("[data-graph-suggestions] [role=alert]")).toBeNull();
    await act(async () => button.click());
    expect(requester).toHaveBeenCalledTimes(2);
    await act(async () => current.resolve(Response.json({ suggestions: [{ ...suggestions.suggestions[0], title: "Current suggestion" }] })));
    await flush();
    expect(host.textContent).toContain("Current suggestion");
    expect(button.disabled).toBe(false);
  });

  it("aborts suggestion reads on unmount without replaying them on remount", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    const requester = vi.fn((_path: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return pending.promise; });
    vi.stubGlobal("fetch", requester);
    await renderMemberGraph(); await generate();
    await act(async () => root.render(null));
    expect(signal?.aborted).toBe(true);
    await renderMemberGraph();
    await act(async () => pending.resolve(Response.json(suggestions))); await flush();
    expect(host.textContent).not.toContain("Private old suggestion");
    expect(requester).toHaveBeenCalledTimes(1);
  });

  it("keeps ordinary suggestion failure local and retries only on explicit request", async () => {
    const requester = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json(suggestions));
    vi.stubGlobal("fetch", requester);
    await renderMemberGraph(); await generate(); await flush();
    expect(host.querySelector("[data-graph-page]")).not.toBeNull();
    expect(host.querySelector("[data-graph-suggestions] [role=alert]")).not.toBeNull();
    expect(requester).toHaveBeenCalledTimes(1);
    await generate(); await flush();
    expect(requester).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Private old suggestion");
  });
});
