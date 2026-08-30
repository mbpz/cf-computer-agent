// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import {
  contextDiscussionHref,
  mentionIdsFromBody,
  parseDiscussionSearch,
  threadDiscussionHref,
  writeDiscussionSearch,
} from "../../frontend/pages/messages/discussion-model";
import { MessagesPage } from "../../frontend/pages/messages/messages-page";
import { ThreadPage } from "../../frontend/pages/messages/thread-page";

describe("discussion route model", () => {
  it("round-trips stable cursor history and fails closed on malformed context", () => {
    expect(parseDiscussionSearch("?page=2&limit=50&cursor=cursor_2&contextKind=task&contextId=task-1")).toEqual({
      page: 2,
      limit: 50,
      cursor: "cursor_2",
      context: { kind: "task", id: "task-1" },
    });
    expect(parseDiscussionSearch("?page=2&page=3&cursor=bad%2Fcursor&contextKind=task&contextId=bad%2Fid")).toEqual({ page: 1, limit: 20 });
    expect(parseDiscussionSearch("?page=2")).toEqual({ page: 1, limit: 20 });
    expect(parseDiscussionSearch("?cursor=cursor_2")).toEqual({ page: 1, limit: 20 });
    expect(() => writeDiscussionSearch("", { page: 2, limit: 20 })).toThrow("DISCUSSION_SEARCH_INVALID");
    expect(writeDiscussionSearch("?unknown=kept&page=9", { page: 2, limit: 50, cursor: "cursor_2" }))
      .toBe("?unknown=kept&page=2&limit=50&cursor=cursor_2");
    expect(contextDiscussionHref({ kind: "knowledge", id: "knowledge-1" })).toBe("/messages?contextKind=knowledge&contextId=knowledge-1");
    expect(threadDiscussionHref("thread-1")).toBe("/messages/thread-1");
  });

  it("derives bounded unique mention ids from message text", () => {
    expect(mentionIdsFromBody("Hello @member-2 and @member-2, cc @admin_1.")).toEqual(["member-2", "admin_1"]);
    expect(mentionIdsFromBody("@bad/id @ member @-bad")).toEqual([]);
  });
});

describe("messages pages", () => {
  it("renders localized loading, error, empty and contextual thread list states", () => {
    for (const language of ["en", "zh-CN"] as const) {
      const locale = createLocaleRuntime({ navigatorLanguage: language });
      const base = { locale, page: 1, limit: 20 as const, pending: false, onRetry: vi.fn(), onNext: vi.fn(), onPrevious: vi.fn(), onLimitChange: vi.fn() };
      expect(renderToStaticMarkup(<MessagesPage {...base} state={{ kind: "loading" }} />)).toContain(frontendText(locale, "MESSAGES_LOADING"));
      const error = renderToStaticMarkup(<MessagesPage {...base} state={{ kind: "error" }} />);
      expect(error).toContain(frontendText(locale, "MESSAGES_ERROR"));
      expect(error).toContain(frontendText(locale, "MESSAGES_RETRY"));
      expect(renderToStaticMarkup(<MessagesPage {...base} state={{ kind: "ready", items: [] }} />)).toContain(frontendText(locale, "MESSAGES_EMPTY"));
    }

    const locale = createLocaleRuntime();
    const html = renderToStaticMarkup(<MessagesPage
      locale={locale}
      state={{ kind: "ready", items: [thread()] , nextCursor: "cursor_2" }}
      page={2}
      limit={20}
      pending={false}
      onRetry={vi.fn()}
      onNext={vi.fn()}
      onPrevious={vi.fn()}
      onLimitChange={vi.fn()}
    />);
    expect(html).toContain('href="/messages/thread-1"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain(frontendText(locale, "PAGINATION_PREVIOUS_PAGE"));
    expect(html).toContain(frontendText(locale, "PAGINATION_NEXT_PAGE"));
    expect(html).toContain('data-messages-scroll="true"');
  });

  it("shows reply and mention context with a bounded keyboard-accessible composer", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<ThreadPage
      locale={locale}
      state={{ kind: "ready", thread: thread(), messages: [message({ replyToMessageId: "message-0" })] }}
      page={1}
      limit={20}
      pending={false}
      onRetry={vi.fn()}
      onRefresh={vi.fn()}
      onNext={vi.fn()}
      onPrevious={vi.fn()}
      onLimitChange={vi.fn()}
      onSend={vi.fn(async () => undefined)}
    />);
    expect(html).toContain(frontendText(locale, "MESSAGES_REPLYING_TO"));
    expect(html).toContain("@member-2");
    expect(html).toContain('maxLength="5000"');
    expect(html).toContain(frontendText(locale, "MESSAGES_SEND"));
    expect(html).toContain('data-thread-scroll="true"');
    expect(html).not.toContain("WebSocket");
  });
});

function thread(overrides: Record<string, unknown> = {}) {
  return { id: "thread-1", contextKind: "task" as const, contextId: "task-1", creatorMemberId: "member-1", lastSequence: 1, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:01:00.000Z", ...overrides };
}
function message(overrides: Record<string, unknown> = {}) {
  return { id: "message-1", threadId: "thread-1", sequence: 1, authorMemberId: "member-1", body: "Hello @member-2", replyToMessageId: null, mentionMemberIds: ["member-2"], clientKey: "client-1", createdAt: "2026-08-30T00:01:00.000Z", ...overrides };
}
