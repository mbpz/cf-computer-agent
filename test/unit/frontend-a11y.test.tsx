// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createFocusRestorer } from "../../frontend/lib/focus";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../frontend/components/ui/dropdown-menu";
import { SubmitPage } from "../../frontend/pages/submit-page";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { renderSafeMarkdown } from "../../frontend/lib/markdown-renderer";

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
    expect(sidebar).toContain("scroll-p-1");
    expect(sidebar).toContain("p-1");
    expect(content).toContain("scroll-p-1");
    expect(shell).toContain("max-w-[1440px] p-4");
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

  it("keeps menu visibility and WAI-ARIA semantics in sync", () => {
    const closedMenu = renderToStaticMarkup(<DropdownMenu><DropdownMenuTrigger>Language</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>English</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    const openMenu = renderToStaticMarkup(<DropdownMenu defaultOpen><DropdownMenuTrigger>Language</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>English</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    expect(closedMenu).toContain('aria-haspopup="menu"');
    expect(closedMenu).toContain('aria-expanded="false"');
    expect(closedMenu).not.toContain('role="menu"');
    expect(openMenu).toContain('aria-expanded="true"');
    expect(openMenu).toContain('role="menu"');
    expect(openMenu).toContain('role="menuitem"');
  });

  it("keeps account actions out of all closed shell account triggers", () => {
    const shell = renderToStaticMarkup(<AppShell session={session} pathname="/" locale={createLocaleRuntime()}><div /></AppShell>);
    expect(shell).toContain('data-account-trigger="true"');
    expect(shell).not.toContain('data-account-menu="true"');
    expect(shell).not.toContain('data-account-settings="true"');
    expect(shell).not.toContain('data-theme-option="true"');
    expect(shell).not.toContain('data-account-logout="true"');
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

  it("gives the reader exactly one titled h1 and a sticky desktop outline", () => {
    const html = renderToStaticMarkup(<KnowledgeReaderPage
      locale={createLocaleRuntime({ navigatorLanguage: "en" })}
      revision={{
        id: "revision-1", knowledgeItemId: "knowledge-1", title: "Guide", markdown: "# Guide\n\n## Deployment\n\nBody",
        isCurrent: false, previousRevisionId: "revision-0", sourceVersionId: "source-version-1", sourceVersionOrdinal: 2,
        parserSchemaVersion: "m2-v1", indexStatus: "indexed", chunks: [{ id: "chunk-1", ordinal: 0, text: "Body", headingPath: ["Guide"], startLine: 3, endLine: 4 }],
      }}
      renderMarkdown={renderSafeMarkdown}
    />);
    // The revision's own level-1 heading is content below the title, so the page's only
    // h1 stays the header's: the body starts at h2 and keeps its depth from there.
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Guide<\/h1>/u);
    expect(html).toContain('<div class="markdown-content"><h2>Guide</h2>');
    expect(html).toContain("<h3>Deployment</h3>");
    expect(html).toContain("Historical revision");
    const outlineAside = html.match(/<aside[^>]*data-reader-outline[^>]*class="([^"]*)"/u)?.[1] ?? "";
    expect(outlineAside).toContain("lg:sticky");
    expect(outlineAside).toContain("lg:top-6");
    expect(outlineAside).toContain("lg:self-start");
    expect(html).toContain('data-reader-layout="true"');
    expect(html).not.toMatch(/>\s*(undefined|null)\s*</u);
  });

  it("keeps the reader header mounted while the content area carries loading and error", () => {
    const revision = { id: "revision-1", markdown: "" };
    const loading = renderToStaticMarkup(<KnowledgeReaderPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} revision={revision} renderMarkdown={(markdown) => markdown} state={{ kind: "loading" }} />);
    expect((loading.match(/<h1/g) ?? []).length).toBe(1);
    expect(loading).toContain('data-page-state="loading"');
    expect(loading).not.toContain("data-reader-layout");
    const failure = renderToStaticMarkup(<KnowledgeReaderPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} revision={revision} renderMarkdown={(markdown) => markdown} state={{ kind: "error", message: "Unable to load this knowledge entry." }} />);
    expect((failure.match(/<h1/g) ?? []).length).toBe(1);
    expect(failure).toContain("Unable to load this knowledge entry.");
    expect(failure).not.toContain("data-reader-layout");
  });
});
