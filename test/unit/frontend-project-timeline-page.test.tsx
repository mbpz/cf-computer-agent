// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { ProjectTimelinePage } from "../../frontend/pages/project-timeline-page";

describe("Project timeline page", () => {
  it("renders meeting, decision and action controls without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<ProjectTimelinePage locale={locale} state={{ kind: "ready", project: { id: "project-1", clientKey: "project-1", title: "发布 2.0", description: null, status: "active", progress: 30, targetAt: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z" }, items: [{ id: "timeline-1", projectId: "project-1", clientKey: "timeline-1", kind: "decision", title: "确定范围", body: "保持免费层", status: "open", startsAt: null, dueAt: "2026-09-12T00:00:00.000Z", createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z" }], nextCursor: "cursor-2" }} onCreate={vi.fn()} onStatusChange={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain("发布 2.0");
    expect(html).toContain(frontendText(locale, "PROJECT_TIMELINE_KIND_DECISION"));
    expect(html).toContain(frontendText(locale, "PROJECT_TIMELINE_LOAD_MORE"));
    expect(html).not.toContain("undefined");
  });
});
