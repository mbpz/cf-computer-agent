// @vitest-environment node
//
// The reader's sections are one beUI `collapsible` each. This case pins the two
// things a disclosure swap can silently break — the `data-*` hooks the suites and
// the deep links address, and the heading levels that keep the page's outline
// intact — plus the one panel that must stay out of a disclosure (the note editor).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    return undefined;
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom is loaded as a module boundary, after the `node:vm` stubs above, so the
// window it builds over the node globals below runs no scripts. A static import
// would be hoisted above those stubs and defeat them.
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const title = "Field guide";
const revision = {
  id: "revision-a",
  knowledgeItemId: "knowledge-a",
  title,
  markdown: `# ${title}`,
  publishedAt: "2026-10-04T00:00:00.000Z",
  isCurrent: true,
  sourceVersionId: "source-a",
  sourceVersionOrdinal: 2,
  parserSchemaVersion: "m2-v1",
  indexStatus: "indexed" as const,
  chunks: [
    { id: "chunk-a", startLine: 1, endLine: 3, text: "Body", ordinal: 0, headingPath: [title], citationId: "citation-a" },
  ],
};
const relatedItem = { id: "knowledge-2", title: "Related guide", publishedAt: "2026-08-26", reasonFields: ["title", "body"] };
const backlinkItem = { id: "knowledge-3", revisionId: "revision-3", chunkId: "chunk-3", title: "Citing guide", publishedAt: "2026-08-26", startLine: 4, endLine: 6 };

/** The reader sections the disclosure wraps, with the hook each one is addressed by. */
const SECTIONS = [
  { hook: "[data-reader-outline-card]", titleKey: "KNOWLEDGE_READER_OUTLINE" },
  { hook: "[data-source-panel]", titleKey: "KNOWLEDGE_READER_SOURCES" },
  { hook: "[data-related-knowledge]", titleKey: "KNOWLEDGE_RELATED_TITLE" },
  { hook: "[data-backlinks]", titleKey: "KNOWLEDGE_BACKLINKS_TITLE" },
] as const;

describe("knowledge reader section disclosure", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;

  beforeAll(() => {
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  });
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  afterAll(() => { browser.close(); vi.unstubAllGlobals(); });

  function stubFetch(timeline = false) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/note")) return Response.json({ note: null });
      if (url.endsWith("/shares")) return Response.json({ shares: [] });
      if (timeline && url.endsWith("/timeline")) {
        return Response.json({ sortStatus: "sorted", events: [{ date: "2026-10-04", title: "Shipped", description: "Event body", citations: [] }] });
      }
      return Response.json({ items: [] });
    });
  }

  async function settle() {
    await act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 10);
      await promise;
    });
  }

  async function mount(timeline = false) {
    stubFetch(timeline);
    await act(async () => root.render(<KnowledgeReaderPage
      memberId="member-a"
      locale={locale}
      revision={revision}
      renderMarkdown={(markdown) => <div className="markdown-content">{markdown}</div>}
      relatedState={{ kind: "ready", items: [relatedItem] }}
      backlinkState={{ kind: "ready", items: [backlinkItem] }}
    />));
    await settle();
  }

  it("carries every reader section's hook, heading and open state on one beUI collapsible", async () => {
    await mount();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    for (const section of SECTIONS) {
      const host = container.querySelector(section.hook);
      expect(host, `section ${section.hook}`).not.toBeNull();
      const title$ = host!.querySelector("h3");
      expect(title$?.textContent, `${section.hook} heading`).toBe(frontendText(locale, section.titleKey));

      const disclosure = host!.querySelector('[data-slot="collapsible"]');
      expect(disclosure, `${section.hook} collapsible`).not.toBeNull();
      expect(disclosure!.getAttribute("data-state")).toBe("open");
      const trigger = disclosure!.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]');
      const content = disclosure!.querySelector('[data-slot="collapsible-content"]');
      expect(trigger).not.toBeNull();
      expect(content).not.toBeNull();
      expect(trigger!.tagName).toBe("BUTTON");
      expect(trigger!.getAttribute("aria-expanded")).toBe("true");
      expect(trigger!.getAttribute("aria-controls")).toBe(content!.id);
      expect(content!.getAttribute("aria-labelledby")).toBe(trigger!.id);
      expect(trigger!.getAttribute("aria-label")).toBe(`${frontendText(locale, section.titleKey)} · ${frontendText(locale, "COMMON_COLLAPSE")}`);
    }
  });

  it("keeps the panel anchors the mobile tabs and the derivations link address", async () => {
    await mount();
    const targets = [...container.querySelectorAll<HTMLElement>('[role="tab"][aria-controls]')].map((tab) => tab.getAttribute("aria-controls"));
    expect(targets).toContain("reader-outline-panel");
    expect(targets).toContain("reader-sources-panel");
    for (const id of targets) expect(container.querySelector(`#${id}`), `anchor #${id}`).not.toBeNull();
    expect(container.querySelector("#reader-research-panel")).not.toBeNull();
  });

  it("collapses a section without dropping its content or its chunk navigation", async () => {
    await mount();
    const outline = container.querySelector("[data-reader-outline-card]")!;
    const trigger = outline.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')!;
    await act(async () => { trigger.click(); });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBe(`${frontendText(locale, "KNOWLEDGE_READER_OUTLINE")} · ${frontendText(locale, "COMMON_EXPAND")}`);
    const content = outline.querySelector('[data-slot="collapsible-content"]')!;
    expect(content.getAttribute("aria-hidden")).toBe("true");

    // The outline entry is still the chunk control it was: selecting it still marks
    // the source chunk, so a collapsed section never strands the reader's navigation.
    const entry = [...outline.querySelectorAll<HTMLButtonElement>("nav button")].find((button) => button.textContent === title)!;
    await act(async () => { entry.click(); });
    expect(entry.getAttribute("aria-current")).toBe("location");
    expect(container.querySelector('[data-source-selected="true"]')!.textContent).toContain(title);
  });

  it("leaves the note editor outside the disclosure, on its own explicit-save card", async () => {
    await mount();
    const note = container.querySelector("[data-reader-note]")!;
    expect(note.getAttribute("data-note-save")).toBe("explicit");
    expect(note.querySelector('[data-slot="collapsible"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>("#reader-note-title")).not.toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>("#reader-note-body")).not.toBeNull();
  });

  it("gives every timeline event the same disclosure once a timeline artifact lands", async () => {
    await mount(true);
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-derivative-action="timeline"]')!.click(); });
    await settle();
    const panel = container.querySelector('[data-derivative-artifact="timeline"]');
    expect(panel).not.toBeNull();
    const disclosures = [...panel!.querySelectorAll('[data-slot="collapsible"]')];
    expect(disclosures).toHaveLength(1);
    const trigger = disclosures[0].querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.textContent).toContain("Shipped");
    expect(panel!.textContent).toContain("Event body");
  });
});
