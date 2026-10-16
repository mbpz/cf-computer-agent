// @vitest-environment node
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { renderSafeMarkdown } from "../../frontend/lib/markdown-renderer";

// happy-dom's DOMPurify drops the tag of the first element of everything it sanitizes,
// which would erase the very heading this case asserts on. The sanitizing pass is not
// what this slice touches — its call, allowlist, escaping and forbidlists are unchanged —
// so it is passed through here and left to test/unit/markdown-renderer.test.ts, which
// runs the real pass against a real window.
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    return undefined;
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom is loaded as a module boundary, after the `node:vm` stubs above, so the window
// it builds over the node globals below runs no scripts.
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const title = "Field guide";
/** A production revision whose own Markdown opens with a level-1 heading, plus the
 * raw-HTML and unsafe-link shapes the safe renderer has to keep inert. */
const markdown = [
  `# ${title}`,
  "",
  "Opening paragraph with <script>alert(1)</script> and [unsafe](javascript:alert(1)).",
  "",
  "## Deployment",
  "",
  "```",
  "# not a heading",
  "```",
  "",
].join("\n");
const revision = {
  id: "revision-a",
  knowledgeItemId: "knowledge-a",
  title,
  markdown,
  publishedAt: "2026-10-04T00:00:00.000Z",
  isCurrent: true,
  sourceVersionId: "source-a",
  indexStatus: "indexed" as const,
  chunks: [
    { id: "chunk-a", startLine: 1, endLine: 3, text: `Field guide\n\nOpening paragraph with <script>alert(1)</script>.`, ordinal: 0, headingPath: [title] },
    { id: "chunk-b", startLine: 5, endLine: 9, text: "## Deployment\n\nSteps.", ordinal: 1, headingPath: ["Deployment"] },
  ],
};

describe("knowledge reader content heading levels", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;

  beforeAll(() => {
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    // The note and research panels own their own reads; this case is about the article
    // and its outline, so those reads stay pending instead of answering with fixtures.
    const pendingRead = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", () => pendingRead.promise);
  });
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  afterAll(() => { browser.close(); vi.unstubAllGlobals(); });

  function outlineButton(label: string) {
    const target = [...container.querySelectorAll<HTMLButtonElement>("[data-reader-outline] button")].find((item) => item.textContent === label);
    expect(target, `outline entry ${label}`).toBeDefined();
    return target!;
  }
  async function mount() {
    await act(async () => root.render(<KnowledgeReaderPage memberId="member-a" locale={locale} revision={revision} renderMarkdown={renderSafeMarkdown} />));
  }

  it("keeps the page's single h1 as the title and puts the article's h1 below it", async () => {
    await mount();
    const pageTitle = [...container.querySelectorAll("h1")];
    expect(pageTitle).toHaveLength(1);
    expect(pageTitle[0].textContent).toBe(title);
    expect(pageTitle[0].closest("header")).not.toBeNull();

    const content = container.querySelector(".markdown-content");
    expect(content).not.toBeNull();
    expect(content!.querySelector("h1")).toBeNull();
    expect([...content!.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading) => `${heading.tagName}:${heading.textContent}`)).toEqual([`H2:${title}`, "H3:Deployment"]);
    expect(content!.querySelector("pre")!.textContent).toContain("# not a heading");
  });

  it("keeps the article's raw HTML inert and its unsafe links unlinked", async () => {
    await mount();
    const content = container.querySelector(".markdown-content")!;
    expect(content.querySelector("script")).toBeNull();
    expect(content.innerHTML).not.toContain("<script");
    expect(content.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("a[href^=\"javascript:\"]")).toBeNull();
    expect(content.textContent).toContain("[unsafe](javascript:alert(1))");
  });

  it("keeps the outline navigating by chunk through the revision's heading paths", async () => {
    await mount();
    const outline = container.querySelector("[data-reader-outline]")!;
    expect(outline.querySelector("nav")!.getAttribute("aria-label")).toBe(frontendText(locale, "KNOWLEDGE_READER_OUTLINE"));
    const chapter = outlineButton(title);
    const section = outlineButton("Deployment");
    expect(chapter.getAttribute("aria-current")).toBeNull();

    await act(async () => { section.click(); });
    expect(section.getAttribute("aria-current")).toBe("location");
    expect(chapter.getAttribute("aria-current")).toBeNull();
    expect(container.querySelector("[data-source-selected=\"true\"]")!.textContent).toContain("Deployment");
  });
});
