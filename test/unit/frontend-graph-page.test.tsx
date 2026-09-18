// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GraphPage, type GraphPageState } from "../../frontend/pages/graph-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { pageKindForPath } from "../../frontend/app-routes";
import { routeCapability, WORKSPACE_ROUTE_CAPABILITIES } from "../../shared/workspace-route-capabilities";
import type { GraphSnapshot } from "../../frontend/lib/graph-data";

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

  it("renders the graph shell in both supported locales", () => {
    const english = renderState(createLocaleRuntime({ navigatorLanguage: "en-US" }), { kind: "empty" });
    const chineseLocale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const chinese = renderState(chineseLocale, { kind: "empty" });
    expect(english).toContain("No work graph data yet");
    expect(chinese).toContain(frontendText(chineseLocale, "GRAPH_EMPTY"));
    expect(chinese).not.toContain("undefined");
  });

  it("registers and dispatches the authenticated graph route", () => {
    expect(routeCapability("/graph")).toMatchObject({ id: "graph", path: "/graph", pageKind: "graph", group: "workspace" });
    expect(pageKindForPath("/graph")).toBe("graph");
    expect(WORKSPACE_ROUTE_CAPABILITIES.some((route) => route.path === "/graph" && route.availability === "ready")).toBe(true);
  });
});
