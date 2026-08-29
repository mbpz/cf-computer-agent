// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TasksPage } from "../../frontend/pages/tasks/tasks-page";

describe("private tasks page", () => {
  it("renders filters, accessible actions, and numbered pagination", () => {
    const html = renderToStaticMarkup(<TasksPage filters={{ status: "doing" }} state={{ kind: "ready", items: [{ id: "task-1", title: "Alpha", notes: "", status: "doing", progress: 20, priority: "high", dueAt: null, completedAt: null, createdAt: "", updatedAt: "" }], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} onDelete={vi.fn()} onStatusChange={vi.fn()} />);
    expect(html).toContain("Alpha"); expect(html).toContain('aria-label="Status"'); expect(html).toContain('aria-label="Page 2"'); expect(html).not.toContain("Load more");
  });

  it("renders retryable initial and local failures", () => {
    expect(renderToStaticMarkup(<TasksPage filters={{}} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain("Try search again");
    expect(renderToStaticMarkup(<TasksPage filters={{}} state={{ kind: "ready", items: [], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 } }} localError="Unable" onRetry={vi.fn()} />)).toContain("Try search again");
  });
});
