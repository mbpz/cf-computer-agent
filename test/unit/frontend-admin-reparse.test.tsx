// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewSourcePanel } from "../../frontend/components/review/review-source-panel";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { Fetcher } from "../../frontend/lib/api";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// `happy-dom` and `react-dom/client` capture DOM globals when first evaluated, so
// they must be imported after the stub below rather than statically at the top.
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });

const promotion = { submissionId: "job-1:submission", sourceId: "job-1:source", sourceVersionId: "job-1:source-version" };

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    sourceId: "source-1",
    baseSourceVersionId: "sv-1",
    submissionId: "submission-1",
    status: "indexed",
    attempts: 1,
    lastErrorCode: null,
    candidate: { content: "# Candidate\n", lineCount: 1, contentSha256: "a".repeat(64) },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const rebuildReport = { revisionId: "rev-1", sourceVersionId: "job-1:source-version", contentSha256: "b".repeat(64), chunkCount: 1, unchanged: true, mappings: [{ ordinal: 0, expectedId: "chunk-1", existingId: "chunk-1", parentExpectedId: null, existingStatus: "active" }] };
const chunk = { id: "chunk-1", status: "active", ordinal: 0, headingPath: ["Intro"], startLine: 1, endLine: 4, body: "# Candidate", tokenEstimate: 3, keywords: [], questionHints: [] };

interface Call { readonly path: string; readonly method: string; readonly body: Record<string, unknown> | null }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("admin source reparse panel", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/submissions/submission-1" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function flush() {
    await act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 0);
      await promise;
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  }

  function requesterFor(handlers: { publish?: () => Response } = {}): { requester: Fetcher; calls: Call[] } {
    const calls: Call[] = [];
    const requester: Fetcher = async (input, init) => {
      const path = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      calls.push({ path, method, body });
      if (path === "/api/admin/submissions/submission-1") return json({ preview: { submissionId: "submission-1", title: "Source title", sourceVersion: { id: "sv-1", kind: "markdown", content: "# Candidate\n" } } });
      if (path === "/api/admin/source-versions/sv-1/reparse") return json({ job: job() });
      if (path === "/api/admin/reparse-jobs/job-1" && method === "GET") return json({ job: job() });
      if (path === "/api/admin/reparse-jobs/job-1/candidate") return json({ job: job({ candidate: { content: "# Corrected\n", lineCount: 1, contentSha256: "c".repeat(64) } }) });
      if (path === "/api/admin/reparse-jobs/job-1/promote") return json({ promotion });
      if (path === "/api/admin/reparse-jobs/job-1/publish") return handlers.publish ? handlers.publish() : json({ promotion, revision: { id: "rev-1", knowledgeItemId: "k-1", searchStatus: "pending" } });
      if (path.includes("/chunks/rebuild-report")) return json(rebuildReport);
      if (path.includes("/chunks/chunk-1/status")) return json({ chunk: { id: "chunk-1", status: "disabled" } });
      if (path.includes("/chunks?")) return json({ items: [chunk], nextCursor: null });
      return json({ error: { code: "NOT_FOUND", message: "NOT_FOUND", retryable: false } }, 404);
    };
    return { requester, calls };
  }

  async function mount(requester: Fetcher) {
    await act(async () => root.render(<ReviewSourcePanel submissionId="submission-1" locale={locale} requester={requester} />));
    await flush();
  }

  function button(label: string): HTMLButtonElement {
    const element = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
    expect(element, label).toBeTruthy();
    return element as HTMLButtonElement;
  }

  const attr = (selector: string, name: string) => container.querySelector(selector)?.getAttribute(name);

  async function runLifecycle(requester: Fetcher) {
    await mount(requester);
    await act(async () => { button("Inspect the source version").click(); });
    await flush();
    await act(async () => { button("Run reparse").click(); });
    await flush();
    await act(async () => { button("Save corrected candidate").click(); });
    await flush();
    await act(async () => { button("Promote to submission").click(); });
    await flush();
  }

  it("reads nothing on mount and sends nothing until asked", async () => {
    const { requester, calls } = requesterFor();
    await mount(requester);
    // The decision surface already read this submission; a second read of the same
    // URL on mount would be a duplicate, so the panel reads only when opened.
    expect(calls.filter((call) => call.path === "/api/admin/submissions/submission-1")).toHaveLength(0);
    expect(calls.filter((call) => call.method !== "GET")).toHaveLength(0);
    await act(async () => { button("Inspect the source version").click(); });
    await flush();
    expect(calls.filter((call) => call.path === "/api/admin/submissions/submission-1")).toHaveLength(1);
    expect(attr("[data-review-source-version]", "data-review-source-version")).toBe("sv-1");
    expect(calls.filter((call) => call.method === "POST" || call.method === "PATCH")).toHaveLength(0);
    // No job exists yet, so no promote/publish control is drawn at all.
    expect(container.querySelector("[data-review-reparse-job]")).toBeNull();
    expect(container.querySelector("[data-review-reparse-publish]")).toBeNull();
  });

  it("never reads the submission when the review surface hands the source version down", async () => {
    const { requester, calls } = requesterFor();
    await act(async () => root.render(<ReviewSourcePanel submissionId="submission-1" sourceVersion={{ sourceVersionId: "sv-1", title: "Source title" }} locale={locale} requester={requester} />));
    await flush();
    await act(async () => { button("Inspect the source version").click(); });
    await flush();
    expect(calls).toHaveLength(0);
    expect(attr("[data-review-source-version]", "data-review-source-version")).toBe("sv-1");
  });

  it("shows the job's own status and reports one outcome per step", async () => {
    const { requester, calls } = requesterFor();
    await runLifecycle(requester);
    expect(attr("[data-review-reparse-status]", "data-review-reparse-status")).toBe("indexed");
    expect(attr("[data-review-reparse-attempts]", "data-review-reparse-attempts")).toBe("1");
    expect(attr("[data-review-reparse-error]", "data-review-reparse-error")).toBe("none");
    expect(container.textContent).toContain("# Corrected");
    const steps = container.querySelector("[data-review-reparse-steps]");
    expect(steps?.getAttribute("data-review-reparse-steps")).toBe("3");
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ normalizedMarkdown: "# Candidate\n" });
    expect(attr("[data-review-reparse-promotion]", "data-review-reparse-promotion")).toBe(promotion.submissionId);
    expect(button("Publish as revision").disabled).toBe(false);
  });

  it("publishes under one operation number, mounts the chunk report, and replays the same number on retry", async () => {
    let publishAttempt = 0;
    const { requester, calls } = requesterFor({
      publish: () => {
        publishAttempt += 1;
        return publishAttempt === 1
          ? json({ error: { code: "PUBLICATION_FAILED", message: "Publication failed", retryable: true } }, 503)
          : json({ promotion, revision: { id: "rev-1", knowledgeItemId: "k-1", searchStatus: "pending" } });
      },
    });
    await runLifecycle(requester);
    await act(async () => { button("Publish as revision").click(); });
    await flush();

    const first = calls.find((call) => call.path.endsWith("/publish"))!;
    expect(typeof first.body?.operationId).toBe("string");
    expect(container.textContent).toContain("publish outcome is unknown");

    await act(async () => { button("Publish as revision").click(); });
    await flush();
    await flush();
    const publishes = calls.filter((call) => call.path.endsWith("/publish"));
    expect(publishes).toHaveLength(2);
    // The retry must carry the same operation number so the server replays the
    // recorded revision instead of publishing the candidate twice.
    expect(publishes[1]!.body?.operationId).toBe(first.body?.operationId);

    expect(attr("[data-review-reparse-published]", "data-review-reparse-published")).toBe("rev-1");
    expect(attr("[data-review-reparse-search-status]", "data-review-reparse-search-status")).toBe("pending");
    // The chunk surface is read-only until a per-chunk status is changed.
    expect(attr("[data-review-chunk-report]", "data-review-chunk-report")).toBe("1:unchanged");
    expect(attr("[data-review-chunk]", "data-review-chunk")).toBe("chunk-1");
    expect(attr("[data-review-chunk-status]", "data-review-chunk-status")).toBe("active");
    await act(async () => { (container.querySelector("[data-review-chunk-toggle]") as HTMLButtonElement).click(); });
    await flush();
    const statusCall = calls.find((call) => call.path.includes("/chunks/chunk-1/status"))!;
    expect(statusCall.method).toBe("PATCH");
    expect(statusCall.body).toEqual({ status: "disabled" });
    expect(attr("[data-review-chunk-status]", "data-review-chunk-status")).toBe("disabled");
  });
});
