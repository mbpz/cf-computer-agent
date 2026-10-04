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
import type { GraphSnapshot } from "../../frontend/lib/graph-data";

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

    await act(async () => resolveAction(Response.json({ id: "focus-1" })));
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
        return Response.json({ id: "focus-1" });
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

  it("releases the leave lock when a graph action is rejected before it is saved", async () => {
    const keys: string[] = [];
    let attempt = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        attempt += 1;
        keys.push(JSON.parse(String(init.body)).clientKey as string);
        return attempt === 1
          ? Response.json({ error: { code: "FOCUS_INVALID", message: "invalid", retryable: false } }, { status: 400 })
          : Response.json({ id: "focus-1" });
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

async function renderReadyGraph(graph: GraphSnapshot = snapshot) {
  const load = vi.fn(async () => graph);
  await act(async () => { root.render(<GraphRoute locale={createLocaleRuntime()} load={load} />); });
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
