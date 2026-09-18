// @vitest-environment node
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphPage, GraphRoute, type GraphPageState } from "../../frontend/pages/graph-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { pageKindForPath } from "../../frontend/app-routes";
import { routeCapability, WORKSPACE_ROUTE_CAPABILITIES } from "../../shared/workspace-route-capabilities";
import type { GraphSnapshot } from "../../frontend/lib/graph-data";

vi.mock("../../frontend/components/graph/graph-canvas", () => ({
  GraphCanvas: ({ snapshot, fallbackLabel }: { snapshot: GraphSnapshot; fallbackLabel?: string }) => (
    <div data-graph-canvas aria-label={fallbackLabel}>
      {snapshot.nodes.map((node) => <button key={node.id} type="button" data-graph-node-id={node.id}>{node.label}</button>)}
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

  it("registers and dispatches the authenticated graph route", () => {
    expect(routeCapability("/graph")).toMatchObject({ id: "graph", path: "/graph", pageKind: "graph", group: "workspace", requiredPermission: "workspace.tasks" });
    expect(pageKindForPath("/graph")).toBe("graph");
    expect(WORKSPACE_ROUTE_CAPABILITIES.some((route) => route.path === "/graph" && route.availability === "ready")).toBe(true);
  });
});
