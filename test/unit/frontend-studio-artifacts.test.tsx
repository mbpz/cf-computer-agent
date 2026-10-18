// @vitest-environment node
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDerivativesPanel } from "../../frontend/components/knowledge/knowledge-derivatives-panel";
import { useKnowledgeDerivatives } from "../../frontend/lib/use-knowledge-derivatives";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const citation = { citationId: "citation-a", title: "Doc", headingPath: ["H"], startLine: 1, endLine: 2 };
const summary = {
  id: "artifact-a",
  kind: "flashcards" as const,
  revisionId: "revision-a",
  createdAt: "2026-10-18T00:00:00.000Z",
};
const payload = { cards: [{ question: "What is retained?", answer: "The saved cards.", citations: [citation] }] };

function Harness() {
  const derivatives = useKnowledgeDerivatives({
    knowledgeItemId: "knowledge-a",
    revisionId: "revision-a",
    citationIds: ["citation-a"],
  });
  return <KnowledgeDerivativesPanel knowledgeItemId="knowledge-a" derivatives={derivatives} runningRunId={null} renderMarkdown={(text) => <div>{text}</div>} />;
}

describe("saved Studio artifacts", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history);
    vi.stubGlobal("location", browser.location);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = browser.document.createElement("div");
    browser.document.body.append(element);
    container = element as unknown as HTMLElement;
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
  });
  async function settle() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  async function click(selector: string) {
    const found = container.querySelector(selector) as HTMLButtonElement | null;
    expect(found, selector).toBeTruthy();
    await act(async () => found!.click());
    await settle();
  }

  it("lists retained artifacts, reopens one through the same normalizer, and deletes it", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/artifacts")) return Response.json({ artifacts: [summary] });
      if (url.endsWith("/artifacts/artifact-a") && init?.method === "DELETE") return Response.json({ deleted: true });
      if (url.endsWith("/artifacts/artifact-a")) {
        return Response.json({ artifact: { ...summary, citationIds: ["citation-a"], payload } });
      }
      return Response.json({});
    });
    await act(async () => root.render(<Harness />));
    await settle();

    expect(container.querySelector('[data-saved-artifact="artifact-a"]')).toBeTruthy();
    expect(container.querySelector('[data-saved-artifact-open="artifact-a"]')?.getAttribute("aria-label")).toContain("Open saved");
    expect(container.querySelector('[data-saved-artifact-delete="artifact-a"]')?.getAttribute("aria-label")).toContain("Delete saved content");
    await click('[data-saved-artifact-open="artifact-a"]');
    expect(container.textContent).toContain("What is retained?");
    expect(container.textContent).toContain("The saved cards.");
    expect(calls.some((call) => call === "GET /api/knowledge/knowledge-a/artifacts/artifact-a")).toBe(true);

    await click('[data-saved-artifact-delete="artifact-a"]');
    expect(container.querySelector('[data-saved-artifact="artifact-a"]')).toBeNull();
    expect(container.querySelector("[data-saved-artifacts-empty]")).toBeTruthy();
    expect(calls.some((call) => call === "DELETE /api/knowledge/knowledge-a/artifacts/artifact-a")).toBe(true);
  });
});
