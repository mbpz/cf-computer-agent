// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { ProjectsPage } from "../../frontend/pages/projects-page";

const project = { id: "project-1", clientKey: "project-1", title: "发布 2.0", description: "完成工作台聚合", status: "active" as const, progress: 55, targetAt: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z" };
const summary = { goalCount: 2, taskCount: 4, completedTaskCount: 1, goals: [{ id: "goal-1", title: "稳定发布" }] };

describe("Projects page", () => {
  it("renders project summary controls without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [project], summaries: { "project-1": summary }, nextCursor: "cursor-2" }} onCreate={vi.fn()} onStatusChange={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "PROJECTS_TITLE"));
    expect(html).toContain(frontendText(locale, "PROJECTS_CREATE"));
    expect(html).toContain(frontendText(locale, "PROJECTS_TASKS"));
    expect(html).toContain(frontendText(locale, "PROJECTS_COLUMN_PROJECT"));
    expect(html).toContain('data-project-id="project-1"');
    expect(html).not.toContain("undefined");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "PROJECTS_RETRY"));
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [], summaries: {} }} />)).toContain(frontendText(locale, "PROJECTS_EMPTY"));
  });

  it("keeps a per-row summary retry and renders no numbered pagination", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [project], summaries: {}, pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 } }} onRetrySummary={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain('data-summary-retry');
    expect(html).toContain(frontendText(locale, "PROJECTS_SUMMARY_FAILED"));
    expect(html).not.toContain("data-pagination-desktop");
    expect(html).not.toContain("data-pagination-mobile");
    expect(html).not.toContain(frontendText(locale, "PROJECTS_LOAD_MORE"));
  });

  it("announces the end of the list only once no later page remains", () => {
    const locale = createLocaleRuntime();
    const render = (pagination: { page: number; pageSize: 20; total: number; totalPages: number }) => renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [project], summaries: { "project-1": summary }, pagination }} onLoadMore={vi.fn()} />);
    expect(render({ page: 1, pageSize: 20, total: 40, totalPages: 2 })).not.toContain(frontendText(locale, "LIST_END_OF_LIST"));
    expect(render({ page: 2, pageSize: 20, total: 40, totalPages: 2 })).toContain(frontendText(locale, "LIST_END_OF_LIST"));
  });
});
