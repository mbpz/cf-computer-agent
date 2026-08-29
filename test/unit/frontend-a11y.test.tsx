// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createFocusRestorer } from "../../frontend/lib/focus";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { SubmitPage } from "../../frontend/pages/submit-page";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const session = { member: { id: "m1", email: "a@example.com", role: "contributor" as const }, capabilities: ["submission:create", "knowledge:read"], logoutUrl: "/auth/logout" };

describe("frontend accessibility gates", () => {
  it("keeps skip navigation, landmarks, names, and form associations", () => {
    const shell = renderToStaticMarkup(<AppShell session={session} pathname="/submit" locale={createLocaleRuntime()}><SubmitPage draft={{ mode: "text", title: "Guide", content: "Body" }} state={{ kind: "idle" }} /></AppShell>);
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain('aria-label="Primary navigation"');
    expect(shell).toContain('aria-label="Language"');
    expect(shell).toContain('for="submission-title"');
    expect(shell).not.toMatch(/>\s*(undefined|null)\s*</u);
  });

  it("keeps focus rings inside desktop scroll edges and the mobile sheet viewport", () => {
    const shell = renderToStaticMarkup(<AppShell session={session} pathname="/knowledge" locale={createLocaleRuntime()}><button type="button">Edge action</button></AppShell>);
    const sidebar = shell.match(/<nav data-shell-sidebar-scroll[^>]*class="([^"]+)"/u)?.[1] ?? "";
    const content = shell.match(/<main[^>]*data-shell-content-scroll[^>]*class="([^"]+)"/u)?.[1] ?? "";
    expect(sidebar).toContain("scroll-py-2");
    expect(sidebar).toContain("px-0.5");
    expect(content).toContain("scroll-py-2");
    expect(shell).toContain("focus-visible:ring-2");
    expect(shell).toContain("data-shell-mobile-scroll");
    expect(shell).toContain("overscroll-contain");
  });

  it("restores focus ownership when a transient navigation surface closes", () => {
    const focus = createFocusRestorer();
    const owner = { focus: () => { owner.focused = true; }, focused: false };
    focus.capture(owner);
    expect(focus.release()).toBe(true);
    expect(owner.focused).toBe(true);
    expect(focus.release()).toBe(false);
  });

  it("renders bounded source metadata and an explicit unselected source control", () => {
    const html = renderToStaticMarkup(<KnowledgeReaderPage
      locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })}
      revision={{
        id: "revision-1", knowledgeItemId: "knowledge-1", title: "指南", markdown: "# 指南",
        isCurrent: true, previousRevisionId: null, sourceVersionId: "source-version-1", sourceVersionOrdinal: 2,
        parserSchemaVersion: "m2-v1", indexStatus: "indexed", chunks: [{ id: "chunk-1", ordinal: 0, text: "正文", headingPath: ["指南"], startLine: 3, endLine: 4, location: { kind: "spreadsheet", sheet: "Sheet1", range: "A1:B2" } }],
      }}
      renderMarkdown={(markdown) => markdown}
      relatedState={{ kind: "ready", items: [{ id: "knowledge-2", title: "关联指南", publishedAt: "2026-08-26", reasonFields: ["title", "body"] }] }}
      backlinkState={{ kind: "ready", items: [{ id: "knowledge-3", revisionId: "revision-3", chunkId: "chunk-3", title: "引用指南", publishedAt: "2026-08-26", startLine: 4, endLine: 6 }] }}
    />);
    expect(html).toContain("来源");
    expect(html).toContain('data-reader-layout="true"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain("来源与链接");
    expect(html).toContain('data-reader-outline="true"');
    expect(html).toContain('data-reader-note="true"');
    expect(html).toContain('data-note-visibility="private"');
    expect(html).toContain('data-note-save="explicit"');
    expect(html).toContain("保存笔记");
    expect(html).toContain("source-version-1");
    expect(html).toContain("Sheet1 · A1:B2");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('href="/api/knowledge/knowledge-1/revisions/revision-1/download"');
    expect(html).toContain('href="/agent?scope=items&amp;knowledgeItemId=knowledge-1"');
    expect(html).toContain("相关知识");
    expect(html).toContain("反向链接");
    expect(html).toContain("引用行 4–6");
    expect(html).toContain("匹配字段 标题, 正文");
    expect(html).not.toMatch(/>\s*(undefined|null)\s*</u);
  });
});
