// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../frontend/pages/home-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { buildWorkbenchSummary } from "../../frontend/lib/workbench-data";

const summary = {
  taskCount: 4,
  overdueTaskCount: 1,
  recentKnowledge: [{ id: "k1", title: "Work guide", summary: "2026-09-08T00:00:00.000Z" }],
  recentActivity: [{ id: "a1", label: "knowledge.published", href: "/knowledge/k1", createdAt: "2026-09-08T00:00:00.000Z" }],
  // The shortcut grid is the summary's real list, not a hand-copied one, so a
  // second capture shortcut cannot slip back in through the data.
  quickActions: buildWorkbenchSummary({}).quickActions,
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

  it.each(["en", "zh-CN"] as const)("offers exactly one capture action to /submit in %s", (navigatorLanguage) => {
    const locale = createLocaleRuntime({ navigatorLanguage });
    const html = renderToStaticMarkup(<HomePage locale={locale} state={{ kind: "ready", summary }} />);
    expect(html.match(/href="\/submit"/gu) ?? []).toHaveLength(1);
    expect(html).toContain(locale.t("WORKBENCH_QUICK_SUBMIT"));
    expect(html).not.toContain("WORKBENCH_OPEN_CAPTURE");
  });

  it("keeps the legacy embed on a single capture action as well", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<HomePage locale={locale} state={{ kind: "ready", total: 4, pending: 1, published: 3, recent: [] }} />);
    expect(html.match(/href="\/submit"/gu) ?? []).toHaveLength(1);
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
