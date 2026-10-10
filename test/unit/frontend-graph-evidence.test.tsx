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
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

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
    async function settle(action: () => unknown) {
      await act(async () => { await action(); });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });
    }
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
      await settle(async () => { pending.resolve(citation); await pending.promise; await Promise.resolve(); });
      expect(host.textContent).toContain("Launch brief");
      expect(host.textContent).toContain("chunk-1");
      expect(host.textContent).toContain("r1");
      expect(host.textContent).toContain("3");
      expect(host.querySelector('a[href="/knowledge/k1#c1"]')).not.toBeNull();
    });

    it("keeps the unselected panel idle after effects run", async () => {
      const load = vi.fn(async () => citation);
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} load={load} />));
      expect(host.querySelector("[data-graph-evidence-idle]")).not.toBeNull();
      expect(load).not.toHaveBeenCalled();
    });

    it.each(["network", "server", "malformed"])("shows %s failure as retryable, not missing evidence", async kind => {
      const failure = () => kind === "malformed" ? loadGraphCitation("c1", async () => response({}))
        : Promise.reject(kind === "server" ? new ApiRequestError("UNAVAILABLE", "internal diagnostic", 503, true) : new TypeError("internal diagnostic"));
      const pending = deferred<GraphCitation>();
      const load = vi.fn().mockImplementationOnce(failure).mockReturnValueOnce(pending.promise);
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1"]} load={load} />));
      expect(host.querySelector("[data-graph-evidence-gap]")).toBeNull();
      expect(host.querySelector("[role=alert]")).not.toBeNull();
      expect(host.textContent).not.toContain("internal diagnostic");
      const retry = host.querySelector("button")!;
      expect(retry).not.toBeNull();
      await settle(async () => { retry.click(); retry.click(); });
      expect(load).toHaveBeenCalledTimes(2);
      expect(load.mock.calls[1][0]).toBe("c1");
      await settle(async () => pending.resolve(citation));
      expect(host.textContent).toContain("Launch brief");
      expect(host.querySelector("[role=alert]")).toBeNull();
    });

    it.each([401, 403])("propagates %i immediately and aborts sibling reads", async status => {
      const sibling = deferred<GraphCitation>();
      const denied = vi.fn();
      const signals: AbortSignal[] = [];
      const load = vi.fn((id: string, signal: AbortSignal) => {
        signals.push(signal);
        return id === "c1" ? Promise.reject(new ApiRequestError("FORBIDDEN", "denied", status, false)) : sibling.promise;
      });
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1", "c2"]} load={load} onDenied={denied} />));
      expect(denied).toHaveBeenCalledTimes(1);
      expect(signals.every(signal => signal.aborted)).toBe(true);
      await settle(async () => sibling.resolve(citation));
      expect(host.textContent).not.toContain("Launch brief");
      expect(host.querySelector("button")).toBeNull();
    });

    it("does not mask a denied sibling behind an earlier missing citation", async () => {
      const denied = vi.fn();
      const later = deferred<GraphCitation>();
      const load = vi.fn((id: string) => id === "c1"
        ? Promise.reject(new ApiRequestError("NOT_FOUND", "missing", 404, false)) : later.promise);
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1", "c2"]} load={load} onDenied={denied} />));
      await settle(async () => later.reject(new ApiRequestError("FORBIDDEN", "denied", 403, false)));
      expect(denied).toHaveBeenCalledTimes(1);
    });

    it.each(["success", "denied", "error"])("ignores stale %s after selection changes", async outcome => {
      const old = deferred<GraphCitation>();
      const denied = vi.fn();
      let signal: AbortSignal | undefined;
      const load = vi.fn((id: string, abort: AbortSignal) => {
        if (id === "c1") { signal = abort; return old.promise; }
        return Promise.resolve({ ...citation, citationId: id, title: "New citation" });
      });
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1"]} load={load} onDenied={denied} />));
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c2"]} load={load} onDenied={denied} />));
      expect(signal?.aborted).toBe(true);
      await settle(async () => { if (outcome === "success") old.resolve(citation); else old.reject(new ApiRequestError("ERROR", "late", outcome === "denied" ? 403 : 503, false)); });
      expect(host.textContent).toContain("New citation");
      expect(host.textContent).not.toContain("Launch brief");
      expect(denied).not.toHaveBeenCalled();
      expect(host.querySelector("[role=alert]")).toBeNull();
    });

    it("does not hide a server failure behind a simultaneous 404", async () => {
      const load = vi.fn(async (id: string) => { throw new ApiRequestError("ERROR", "unavailable", id === "c1" ? 404 : 503, false); });
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1", "c2"]} load={load} />));
      expect(host.querySelector("[data-graph-evidence-error]")).not.toBeNull();
      expect(host.querySelector("[data-graph-evidence-gap]")).toBeNull();
    });

    it("aborts on unmount and ignores a late denial", async () => {
      const pending = deferred<GraphCitation>();
      const denied = vi.fn();
      let signal: AbortSignal | undefined;
      const load = vi.fn((_id: string, abort: AbortSignal) => { signal = abort; return pending.promise; });
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1"]} load={load} onDenied={denied} />));
      await settle(async () => root.render(null));
      expect(signal?.aborted).toBe(true);
      await settle(async () => pending.reject(new ApiRequestError("FORBIDDEN", "late", 403, false)));
      expect(denied).not.toHaveBeenCalled();
    });

    it("deduplicates citations and clears their content when selection is removed", async () => {
      const load = vi.fn(async () => citation);
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} citationIds={["c1", "c1"]} load={load} />));
      expect(load).toHaveBeenCalledTimes(1);
      expect(host.textContent).toContain("Launch brief");
      await settle(async () => root.render(<GraphEvidencePanel locale={locale} load={load} />));
      expect(host.textContent).not.toContain("Launch brief");
      expect(host.querySelector("[data-graph-evidence-idle]")).not.toBeNull();
    });

    it("turns an inaccessible citation into an evidence gap", async () => {
      act(() => root.render(<GraphEvidencePanel locale={locale} citationIds={["missing"]} load={async () => { throw new ApiRequestError("NOT_FOUND", "Not found", 404, false); }} />));
      await settle(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(host.querySelector("[data-graph-evidence-gap]")).not.toBeNull();
      expect(host.textContent).toContain(frontendText(locale, "GRAPH_EVIDENCE_GAP"));
    });
  });
});
