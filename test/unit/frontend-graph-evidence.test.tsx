// @vitest-environment node
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, type Fetcher } from "../../frontend/lib/api";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { GraphEvidencePanel } from "../../frontend/components/graph/graph-evidence-panel";
import { loadGraphCitation, type GraphCitation } from "../../frontend/lib/graph-evidence";

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) {
      context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));

const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });
const citation: GraphCitation = {
  citationId: "c1",
  knowledgeItemId: "k1",
  title: "Launch brief",
  revisionId: "r1",
  chunkId: "chunk-1",
  headingPath: ["Planning"],
  startLine: 12,
  endLine: 18,
  location: { kind: "pdf", page: 3 },
};

function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }

describe("graph evidence", () => {
  it("loads and strictly normalizes an authorized citation while ignoring body", async () => {
    const requester = vi.fn<Fetcher>(async () => response({ ...citation, body: "private excerpt", extra: true }));
    const controller = new AbortController();
    await expect(loadGraphCitation("c/1", requester, controller.signal)).resolves.toEqual({ ...citation, citationId: "c/1" });
    expect(requester).toHaveBeenCalledWith("/api/knowledge/citations/c%2F1", { credentials: "same-origin", signal: controller.signal });
  });

  it("renders idle and empty evidence-gap states without undefined", () => {
    expect(renderToStaticMarkup(<GraphEvidencePanel locale={locale} />)).toContain(frontendText(locale, "GRAPH_EVIDENCE_IDLE"));
    const html = renderToStaticMarkup(<GraphEvidencePanel locale={locale} citationIds={[]} />);
    expect(html).toContain(frontendText(locale, "GRAPH_EVIDENCE_GAP"));
    expect(html).not.toContain("undefined");
  });

  describe("async states", () => {
    let browser: InstanceType<typeof Window>;
    let host: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
      browser = new Window({ url: "https://app.test/graph" });
      for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event"] as const) {
        vi.stubGlobal(key, key === "window" ? browser : browser[key]);
      }
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    });
    afterEach(async () => { act(() => root.unmount()); host.remove(); await browser.happyDOM.close(); vi.unstubAllGlobals(); });

    it("shows loading then a reader deep link", async () => {
      const pending = deferred<GraphCitation>();
      act(() => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1"]} load={() => pending.promise} />));
      expect(host.querySelector("[data-graph-evidence-loading]")).not.toBeNull();
      await act(async () => { pending.resolve(citation); await pending.promise; await Promise.resolve(); });
      expect(host.textContent).toContain("Launch brief");
      expect(host.textContent).toContain("chunk-1");
      expect(host.textContent).toContain("r1");
      expect(host.textContent).toContain("3");
      expect(host.querySelector('a[href="/knowledge/k1#c1"]')).not.toBeNull();
    });

    it("turns an inaccessible citation into an evidence gap", async () => {
      act(() => root.render(<GraphEvidencePanel locale={locale} citationIds={["missing"]} load={async () => { throw new ApiRequestError("NOT_FOUND", "Not found", 404, false); }} />));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(host.querySelector("[data-graph-evidence-gap]")).not.toBeNull();
      expect(host.textContent).toContain(frontendText(locale, "GRAPH_EVIDENCE_GAP"));
    });
  });
});
