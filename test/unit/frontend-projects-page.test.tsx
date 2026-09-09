// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { ProjectsPage } from "../../frontend/pages/projects-page";

describe("Projects page", () => {
  it("renders project summary controls without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [{
      id: "project-1", clientKey: "project-1", title: "发布 2.0", description: "完成工作台聚合", status: "active", progress: 55,
      targetAt: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
    }], summaries: { "project-1": { goalCount: 2, taskCount: 4, completedTaskCount: 1, goals: [{ id: "goal-1", title: "稳定发布" }] } }, nextCursor: "cursor-2" }} onCreate={vi.fn()} onStatusChange={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "PROJECTS_TITLE"));
    expect(html).toContain(frontendText(locale, "PROJECTS_CREATE"));
    expect(html).toContain(frontendText(locale, "PROJECTS_TASKS"));
    expect(html).toContain(frontendText(locale, "PROJECTS_LOAD_MORE"));
    expect(html).not.toContain("undefined");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "PROJECTS_RETRY"));
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [], summaries: {} }} />)).toContain(frontendText(locale, "PROJECTS_EMPTY"));
  });
});
