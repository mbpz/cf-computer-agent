// @vitest-environment node
import React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSnapshot } from "../../frontend/lib/graph-data";
import {
  GRAPH_CANVAS_LAYOUTS,
  GRAPH_CANVAS_LAYOUT_TIMEOUT_MS,
  GraphCanvas,
  graphCanvasLayoutOptions,
  graphSnapshotToCytoscapeElements,
  normalizeGraphCanvasLayout,
} from "../../frontend/components/graph/graph-canvas";

const cytoscapeMock = vi.hoisted(() => vi.fn());
vi.mock("cytoscape", () => ({ default: cytoscapeMock }));

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
    { id: "knowledge:k1", kind: "knowledge", label: "Design notes", status: "draft", href: "/knowledge/k1", metadata: { count: 2 } },
    { id: "task:t1", kind: "task", label: "Ship canvas", status: null, href: null, metadata: {} },
  ],
  edges: [
    { id: "edge:e1", source: "knowledge:k1", target: "task:t1", kind: "derived", label: "informs", weight: 1, citationIds: ["cite-1"] },
  ],
  rootId: "knowledge:k1",
  depth: 1,
  truncated: false,
};

function makeCytoscapeInstance() {
  const handlers = new Map<string, (event: { target: { id: () => string } }) => void>();
  const layoutHandlers = new Map<string, () => void>();
  const removeClass = vi.fn();
  const addClass = vi.fn();
  const layoutRun = vi.fn();
  const layoutStop = vi.fn();
  const layoutHandle = {
    run: layoutRun,
    stop: layoutStop,
    on: vi.fn((event: string, handler: () => void) => { layoutHandlers.set(event, handler); }),
    emitStop() { layoutHandlers.get("layoutstop")?.(); },
  };
  const selectedNodes = new Map<string, { addClass: typeof addClass; removeClass: typeof removeClass }>();
  const instance = {
    on: vi.fn((event: string, handler: (event: { target: { id: () => string } }) => void) => { handlers.set(event, handler); }),
    off: vi.fn((event: string) => { handlers.delete(event); }),
    destroy: vi.fn(),
    layout: vi.fn(() => layoutHandle),
    resize: vi.fn(),
    elements: vi.fn(() => ({ removeClass })),
    getElementById: vi.fn((id: string) => {
      const node = selectedNodes.get(id) ?? { addClass, removeClass };
      selectedNodes.set(id, node);
      return node;
    }),
    selectedNodes,
    layoutHandle,
    emitTap(id: string) { handlers.get("tap")?.({ target: { id: () => id } }); },
  };
  return instance;
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
  cytoscapeMock.mockReset();
});

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await browser.happyDOM.close();
  vi.unstubAllGlobals();
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("GraphCanvas", () => {
  it("renders a semantic fallback and exposes no undefined text", () => {
    const html = renderToStaticMarkup(<GraphCanvas snapshot={snapshot} selectedId={null} onSelect={vi.fn()} layout="concentric" />);

    expect(html).toContain("data-graph-canvas");
    expect(html).toContain("data-graph-fallback");
    expect(html).toContain("Design notes");
    expect(html).toContain("Ship canvas");
    expect(html).not.toContain("undefined");
  });

  it("maps a snapshot to complete Cytoscape node and edge elements", () => {
    expect(graphSnapshotToCytoscapeElements(snapshot)).toEqual([
      { group: "nodes", data: { id: "knowledge:k1", label: "Design notes", kind: "knowledge", status: "draft", href: "/knowledge/k1", metadata: { count: 2 } } },
      { group: "nodes", data: { id: "task:t1", label: "Ship canvas", kind: "task", status: null, href: null, metadata: {} } },
      { group: "edges", data: { id: "edge:e1", source: "knowledge:k1", target: "task:t1", kind: "derived", label: "informs", weight: 1, citationIds: ["cite-1"] } },
    ]);
  });

  it("accepts only the bounded built-in layout names", () => {
    expect(GRAPH_CANVAS_LAYOUTS).toEqual(["breadthfirst", "concentric", "cose", "grid"]);
    expect(normalizeGraphCanvasLayout("grid")).toBe("grid");
    expect(normalizeGraphCanvasLayout("preset")).toBe("concentric");
    expect(normalizeGraphCanvasLayout(undefined)).toBe("concentric");
  });

  it("uses non-animated bounded layout options and keeps a stoppable layout handle", async () => {
    const first = makeCytoscapeInstance();
    cytoscapeMock.mockReturnValue(first);
    const onSelect = vi.fn();
    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId={null} onSelect={onSelect} layout="cose" loadCytoscape={() => Promise.resolve({ default: cytoscapeMock })} />));
    await flushEffects();

    expect(first.layout).toHaveBeenCalledWith(graphCanvasLayoutOptions("cose"));
    expect(graphCanvasLayoutOptions("cose")).toMatchObject({ name: "cose", animate: false, numIter: expect.any(Number), refresh: expect.any(Number) });
    expect((graphCanvasLayoutOptions("cose").numIter as number)).toBeLessThanOrEqual(250);
    expect(first.layoutHandle.run).toHaveBeenCalledOnce();
    expect(GRAPH_CANVAS_LAYOUT_TIMEOUT_MS).toBeGreaterThan(0);

    act(() => root.unmount());
    expect(first.layoutHandle.stop).toHaveBeenCalledOnce();
  });

  it("keeps the semantic list usable on mobile and initializes Cytoscape after widening", async () => {
    const mediaListeners = new Set<(event: { matches: boolean }) => void>();
    let mobile = true;
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() { return mobile; },
      media: "(max-width: 48rem)",
      addEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => { mediaListeners.add(listener); },
      removeEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => { mediaListeners.delete(listener); },
    })));
    const first = makeCytoscapeInstance();
    cytoscapeMock.mockReturnValue(first);
    const loadCytoscape = vi.fn(() => Promise.resolve({ default: cytoscapeMock }));
    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId={null} onSelect={vi.fn()} layout="grid" loadCytoscape={loadCytoscape} />));
    await flushEffects();

    expect(host.querySelector('[data-graph-fallback]')).not.toBeNull();
    expect(loadCytoscape).not.toHaveBeenCalled();

    mobile = false;
    act(() => mediaListeners.forEach((listener) => listener({ matches: false })));
    await flushEffects();

    expect(loadCytoscape).toHaveBeenCalledOnce();
    expect(cytoscapeMock).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(first.layoutHandle.stop).toHaveBeenCalledOnce();
  });

  it("reflows on resize and disconnects the observer without leaking the instance", async () => {
    const observerCallbacks: Array<() => void> = [];
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { observerCallbacks.push(callback); }
      observe() {}
      disconnect() { disconnect(); }
    });
    const first = makeCytoscapeInstance();
    cytoscapeMock.mockReturnValue(first);
    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId={null} onSelect={vi.fn()} layout="grid" loadCytoscape={() => Promise.resolve({ default: cytoscapeMock })} />));
    await flushEffects();

    expect(observerCallbacks).toHaveLength(1);
    act(() => observerCallbacks[0]!());
    expect(first.resize).toHaveBeenCalledOnce();
    expect(first.layout).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    expect(first.destroy).toHaveBeenCalledOnce();
  });

  it("selects from the semantic fallback and wires Cytoscape taps", async () => {
    const first = makeCytoscapeInstance();
    cytoscapeMock.mockReturnValue(first);
    const onSelect = vi.fn();
    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId="task:t1" onSelect={onSelect} layout="grid" loadCytoscape={() => Promise.resolve({ default: cytoscapeMock })} />));
    await flushEffects();

    const selected = host.querySelector<HTMLButtonElement>('[data-graph-node-id="task:t1"]');
    expect(selected?.getAttribute("aria-pressed")).toBe("true");
    act(() => selected?.click());
    expect(onSelect).toHaveBeenCalledWith("task:t1");
    expect(first.layout).toHaveBeenCalledWith(expect.objectContaining({ name: "grid", animate: false }));

    first.emitTap("knowledge:k1");
    expect(onSelect).toHaveBeenCalledWith("knowledge:k1");
  });

  it("synchronizes the initial and changed selectedId after async Cytoscape creation", async () => {
    const first = makeCytoscapeInstance();
    cytoscapeMock.mockReturnValue(first);
    const onSelect = vi.fn();
    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId="task:t1" onSelect={onSelect} layout="grid" loadCytoscape={() => Promise.resolve({ default: cytoscapeMock })} />));
    await flushEffects();

    expect(first.elements).toHaveBeenCalled();
    expect(first.elements.mock.results.at(-1)?.value.removeClass).toHaveBeenCalledWith("is-selected");
    expect(first.getElementById).toHaveBeenCalledWith("task:t1");
    expect(first.selectedNodes.get("task:t1")?.addClass).toHaveBeenCalledWith("is-selected");

    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId="knowledge:k1" onSelect={onSelect} layout="grid" loadCytoscape={() => Promise.resolve({ default: cytoscapeMock })} />));
    await flushEffects();

    expect(first.getElementById).toHaveBeenCalledWith("knowledge:k1");
    expect(first.selectedNodes.get("knowledge:k1")?.addClass).toHaveBeenCalledWith("is-selected");
    expect(first.elements.mock.results.at(-1)?.value.removeClass).toHaveBeenCalledWith("is-selected");
  });

  it("destroys the instance and removes listeners on snapshot/layout changes and unmount", async () => {
    const first = makeCytoscapeInstance();
    const second = makeCytoscapeInstance();
    cytoscapeMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onSelect = vi.fn();
    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId={null} onSelect={onSelect} layout="concentric" loadCytoscape={() => Promise.resolve({ default: cytoscapeMock })} />));
    await flushEffects();

    const nextSnapshot = { ...snapshot, nodes: [...snapshot.nodes, { id: "goal:g1", kind: "goal" as const, label: "Outcome", status: null, href: null, metadata: {} }] };
    act(() => root.render(<GraphCanvas snapshot={nextSnapshot} selectedId={null} onSelect={onSelect} layout="breadthfirst" loadCytoscape={() => Promise.resolve({ default: cytoscapeMock })} />));
    await flushEffects();

    expect(first.off).toHaveBeenCalledWith("tap", expect.any(Function));
    expect(first.destroy).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(second.off).toHaveBeenCalledWith("tap", expect.any(Function));
    expect(second.destroy).toHaveBeenCalledOnce();
  });
});
