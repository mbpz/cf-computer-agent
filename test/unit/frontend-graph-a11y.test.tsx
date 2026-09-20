// @vitest-environment node
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphCanvas } from "../../frontend/components/graph/graph-canvas";
import type { GraphSnapshot } from "../../frontend/lib/graph-data";
import { GraphInspector } from "../../frontend/components/graph/graph-inspector";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

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
    { id: "task:t1", kind: "task", label: "Draft brief", status: "todo", href: "/tasks/t1", metadata: {} },
    { id: "project:p1", kind: "project", label: "Launch", status: "active", href: "/projects/p1", metadata: {} },
    { id: "goal:g1", kind: "goal", label: "Ship", status: null, href: "/goals/g1", metadata: {} },
  ],
  edges: [],
  rootId: null,
  depth: 1,
  truncated: false,
};

let browser: InstanceType<typeof Window>;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  browser = new Window({ url: "https://app.test/graph" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "Node", "Event", "KeyboardEvent"] as const) {
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

describe("Graph accessibility contract", () => {
  it("moves across node buttons with arrows, activates with Enter, and clears with Escape", () => {
    const onSelect = vi.fn();
    const onClearSelection = vi.fn();
    act(() => root.render(<GraphCanvas snapshot={snapshot} selectedId={null} onSelect={onSelect} onClearSelection={onClearSelection} />));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("[data-graph-node-id]")];
    expect(buttons).toHaveLength(3);

    buttons[0]!.focus();
    act(() => buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement).toBe(buttons[1]);
    act(() => buttons[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(document.activeElement).toBe(buttons[0]);
    act(() => buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith("task:t1");
    act(() => buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it("keeps the inspector focus target and action button in the semantic tab order", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });
    act(() => root.render(
      <div>
        <GraphCanvas snapshot={snapshot} selectedId="task:t1" onSelect={vi.fn()} />
        <GraphInspector locale={locale} node={snapshot.nodes[0]} onAction={vi.fn()} />
      </div>,
    ));
    const inspector = host.querySelector<HTMLElement>("[data-graph-inspector]");
    const action = host.querySelector<HTMLButtonElement>("[data-graph-inspector-actions] button");
    expect(inspector?.tabIndex).toBe(-1);
    expect(action).not.toBeNull();
    expect(host.textContent).not.toContain("undefined");
  });
});
