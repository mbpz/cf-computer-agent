// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GraphInspector } from "../../frontend/components/graph/graph-inspector";
import { buildGraphInspectorModel } from "../../frontend/lib/graph-inspector";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import type { GraphNode } from "../../frontend/lib/graph-data";

const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });

const node: GraphNode = {
  id: "task:t1",
  kind: "task",
  label: "Draft brief",
  status: "todo",
  href: "/tasks/t1",
  metadata: {
    dueAt: "2026-09-20",
    priority: 2,
    owner: null,
  },
};

describe("graph inspector", () => {
  it("normalizes selected node fields and metadata without undefined values", () => {
    const model = buildGraphInspectorModel(node);
    expect(model).toEqual({
      id: "task:t1",
      kind: "task",
      label: "Draft brief",
      status: "todo",
      href: "/tasks/t1",
      metadata: [
        { key: "dueAt", value: "2026-09-20" },
        { key: "owner", value: "COMMON_VALUE_UNAVAILABLE" },
        { key: "priority", value: "2" },
      ],
    });
    expect(JSON.stringify(model)).not.toContain("undefined");
  });

  it("renders an empty selection state", () => {
    const html = renderToStaticMarkup(<GraphInspector locale={locale} node={null} />);
    expect(html).toContain(frontendText(locale, "GRAPH_INSPECTOR_TITLE"));
    expect(html).toContain(frontendText(locale, "GRAPH_INSPECTOR_EMPTY"));
    expect(html).not.toContain("undefined");
  });

  it("renders node details and localized fallbacks for nullable values", () => {
    const html = renderToStaticMarkup(<GraphInspector locale={locale} node={node} />);
    expect(html).toContain("Draft brief");
    expect(html).toContain("task");
    expect(html).toContain("todo");
    expect(html).toContain("/tasks/t1");
    expect(html).toContain("dueAt");
    expect(html).toContain(frontendText(locale, "COMMON_VALUE_UNAVAILABLE"));
    expect(html).not.toContain("undefined");
  });

  it("renders a localized action for supported nodes without undefined output", () => {
    const html = renderToStaticMarkup(<GraphInspector locale={locale} node={node} onAction={() => undefined} />);
    expect(html).toContain(frontendText(locale, "GRAPH_ACTIONS_TITLE"));
    expect(html).toContain(frontendText(locale, "GRAPH_ACTION_START_FOCUS"));
    expect(html).not.toContain("undefined");
  });
});
