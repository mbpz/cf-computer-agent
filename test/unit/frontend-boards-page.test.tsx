// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import {
  BOARD_STATUSES,
  boardStatusTargets,
  parseBoardSearch,
  writeBoardColumnSearch,
  type BoardColumnStates,
} from "../../frontend/pages/boards/board-model";
import { BoardsPage } from "../../frontend/pages/boards/boards-page";
import type { TaskItem } from "../../frontend/lib/tasks-data";

describe("task-backed board model", () => {
  it("uses the four canonical non-canceled columns and legal task transitions", () => {
    expect(BOARD_STATUSES).toEqual(["todo", "doing", "blocked", "done"]);
    expect(boardStatusTargets("todo")).toEqual(["doing", "done"]);
    expect(boardStatusTargets("doing")).toEqual(["todo", "blocked", "done"]);
    expect(boardStatusTargets("blocked")).toEqual(["todo", "doing", "done"]);
    expect(boardStatusTargets("done")).toEqual(["todo"]);
  });

  it("parses and writes independent bounded pagination for each column", () => {
    const parsed = parseBoardSearch("?todoPage=2&todoPageSize=50&doingPage=3&doingPageSize=100&canceledPage=9");
    expect(parsed).toEqual({
      todo: { page: 2, pageSize: 50 },
      doing: { page: 3, pageSize: 100 },
      blocked: { page: 1, pageSize: 20 },
      done: { page: 1, pageSize: 20 },
    });
    expect(writeBoardColumnSearch("?doingPage=3&doingPageSize=100", "todo", { page: 2, pageSize: 50 }))
      .toBe("?doingPage=3&doingPageSize=100&todoPage=2&todoPageSize=50");
    expect(writeBoardColumnSearch("?todoPage=2&todoPageSize=50&doingPage=3", "todo", { page: 1, pageSize: 20 }))
      .toBe("?doingPage=3");
  });
});

describe("task-backed boards page", () => {
  it("renders four localized columns, independent pagination, and excludes canceled tasks", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const columns = readyColumns();
    columns.todo = ready([task("todo", "待办任务", "todo-1"), task("canceled", "不应出现", "canceled-1")], 21);
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(BOARD_STATUSES.every((status) => html.includes(`data-board-column="${status}"`))).toBe(true);
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_TODO"));
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_DOING"));
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_BLOCKED"));
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_DONE"));
    expect(html).toContain("待办任务");
    expect(html).not.toContain("不应出现");
    expect((html.match(/aria-label="第 2 页"/gu) ?? [])).toHaveLength(1);
  });

  it("renders locale-backed loading, error, and empty states per column", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const columns: BoardColumnStates = {
      todo: { kind: "loading" },
      doing: { kind: "error" },
      blocked: ready([]),
      done: ready([task("done", "完成项", "done-1")]),
    };
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(html).toContain(frontendText(locale, "BOARDS_COLUMN_LOADING"));
    expect(html).toContain(frontendText(locale, "BOARDS_COLUMN_ERROR"));
    expect(html).toContain(frontendText(locale, "BOARDS_COLUMN_EMPTY"));
    expect(html).toContain(frontendText(locale, "BOARDS_RETRY"));
    expect(html).not.toContain("BOARDS_COLUMN_");
  });

  it("exposes keyboard-operable legal status actions without drag and drop", () => {
    const locale = createLocaleRuntime();
    const columns = readyColumns();
    columns.doing = ready([task("doing", "Alpha", "task-alpha")]);
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} actionPendingId="task-alpha" onPageChange={vi.fn()} onPageSizeChange={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(html).toContain('aria-label="Move Alpha from Doing"');
    expect(html).toContain('<option value="todo">To do</option>');
    expect(html).toContain('<option value="blocked">Blocked</option>');
    expect(html).toContain('<option value="done">Done</option>');
    expect(html).not.toContain('<option value="canceled">');
    expect(html).toContain("disabled");
    expect(html).not.toContain("draggable=");
  });
});

function readyColumns(): BoardColumnStates {
  return { todo: ready([]), doing: ready([]), blocked: ready([]), done: ready([]) };
}

function ready(items: TaskItem[], total = items.length): BoardColumnStates["todo"] {
  return { kind: "ready", items, pagination: { page: 1, pageSize: 20, total, totalPages: total === 0 ? 0 : Math.ceil(total / 20) }, pending: false };
}

function task(status: TaskItem["status"], title: string, id: string): TaskItem {
  return { id, title, notes: "", status, progress: status === "done" ? 100 : 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
}
