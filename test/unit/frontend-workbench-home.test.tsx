// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../frontend/pages/home-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const summary = {
  taskCount: 4,
  overdueTaskCount: 1,
  recentKnowledge: [{ id: "k1", title: "Work guide", summary: "2026-09-08T00:00:00.000Z" }],
  recentActivity: [{ id: "a1", label: "knowledge.published", href: "/knowledge/k1", createdAt: "2026-09-08T00:00:00.000Z" }],
  quickActions: [
    { id: "create-knowledge", href: "/submit", labelKey: "WORKBENCH_QUICK_SUBMIT" },
    { id: "open-tasks", href: "/tasks", labelKey: "WORKBENCH_QUICK_TASKS" },
    { id: "ask-ai", href: "/agent", labelKey: "WORKBENCH_QUICK_AI" },
    { id: "search-knowledge", href: "/search", labelKey: "WORKBENCH_QUICK_SEARCH" },
  ],
} as const;

describe("workbench home", () => {
  it("renders the seven workbench areas without undefined values", () => {
    const html = renderToStaticMarkup(<HomePage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "ready", summary }} />);
    expect(html).toContain("Your workbench");
    expect(html).toContain("Capture");
    expect(html).toContain("My tasks");
    expect(html).toContain("Recent knowledge");
    expect(html).toContain("Activity");
    expect(html).toContain("Ask AI");
    expect(html).toContain("Work guide");
    expect(html).not.toContain("undefined");
  });

  it("renders explicit empty and error states", () => {
    const empty = renderToStaticMarkup(<HomePage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "ready", summary: { ...summary, recentKnowledge: [], recentActivity: [] } }} />);
    const error = renderToStaticMarkup(<HomePage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "error", message: "Unable to load workspace" }} />);
    expect(empty).toContain("No recent knowledge yet.");
    expect(empty).toContain("No recent activity yet.");
    expect(error).toContain("Unable to load workspace");
    expect(`${empty}${error}`).not.toContain("undefined");
  });
});
