// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeResearchRunPanel, type DraftableReport } from "../../frontend/components/knowledge/knowledge-research-panel";
import { defaultSubmissionTarget } from "../../frontend/lib/submission-data";
import { loadSubmissionIntent } from "../../frontend/lib/submission-intent";
import { loadOfflineSubmissionDraft } from "../../frontend/lib/offline-submission-draft";
import { loadResearchDraftIntent } from "../../frontend/lib/knowledge-derivative-draft-intent";
import { useItemResearchRuns } from "../../frontend/lib/use-knowledge-derivatives";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

type Call = { url: string; method: string; body: unknown };

function runPayload(id: string, status: string): Record<string, unknown> {
  return {
    id,
    knowledgeItemId: "knowledge-a",
    goal: `Goal ${id}`,
    status,
    quotaState: "available",
    quotaDeferredUntil: null,
    plan: {
      spaceIds: [],
      collectionIds: [],
      knowledgeItemIds: ["knowledge-a"],
      completion: ["done"],
      steps: ["step"],
      subquestions: [{ id: "sq-1", question: "Why?", scope: { spaceIds: [], collectionIds: [], knowledgeItemIds: ["knowledge-a"] }, status: "pending" }],
    },
    checkpoint: { nextStep: 0, completedSubquestionIds: [] },
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
}

function draftPayload(): Record<string, unknown> {
  return {
    id: "submission-1",
    submitterId: "member-a",
    requestedSpaceId: "default",
    requestedCollectionId: null,
    requestedVisibility: "shared",
    kind: "markdown",
    status: "draft",
    title: "Report title",
    content: "# Report title\n\nbody",
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
}

const selectedReport: DraftableReport = { runId: "run-1", reportId: "report-1", title: "Report title" };

function Harness({ canCreateSubmission = true, report = selectedReport }: { canCreateSubmission?: boolean; report?: DraftableReport | null }) {
  const research = useItemResearchRuns({ memberId: "member-a", knowledgeItemId: "knowledge-a", canCreateSubmission });
  return <KnowledgeResearchRunPanel knowledgeItemId="knowledge-a" research={research} canCreateSubmission={canCreateSubmission} report={report} draftTarget={defaultSubmissionTarget} />;
}

describe("knowledge reader research run lifecycle", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;
  let calls: Call[];
  beforeEach(() => {
    calls = [];
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history);
    vi.stubGlobal("location", browser.location);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
  });
  async function settle() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  async function click(selector: string) {
    await act(async () => { (container.querySelector(selector) as HTMLButtonElement).click(); });
    await settle();
  }
  async function type(selector: string, value: string) {
    const field = container.querySelector(selector)!;
    const key = Object.keys(field).find((candidate) => candidate.startsWith("__reactProps$"));
    if (!key) throw new Error("React props not found");
    const handlers = (field as unknown as Record<string, { onChange: (event: unknown) => void }>)[key]!;
    await act(async () => { handlers.onChange({ target: { value }, currentTarget: { value } }); });
  }
  function stub(handler: (call: Call) => Response | Promise<Response>) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = { url: String(input), method: init?.method ?? "GET", body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) };
      calls.push(call);
      return handler(call);
    });
  }
  async function render(handler: (call: Call) => Response | Promise<Response>) {
    stub(handler);
    await act(async () => root.render(<Harness />));
    await settle();
  }
  function draftCalls(): Call[] {
    return calls.filter((call) => call.url.endsWith("/draft"));
  }

  it("reads runs only on demand, then moves a run through approve, pause and cancel", async () => {
    await render((call) => {
      if (call.url === "/api/knowledge/research-runs?limit=50") return Response.json({ items: [runPayload("run-1", "running"), runPayload("run-2", "draft")] });
      if (call.url.endsWith("/run-2/approve")) return Response.json({ researchRun: runPayload("run-2", "running") });
      if (call.url.endsWith("/run-2/pause")) return Response.json({ researchRun: runPayload("run-2", "paused") });
      if (call.url.endsWith("/run-2/cancel")) return Response.json({ researchRun: runPayload("run-2", "cancelled") });
      return Response.json({});
    });
    // Opening the reader requests nothing at all.
    expect(calls).toHaveLength(0);
    expect(container.querySelector("[data-research-unloaded]")).not.toBeNull();
    await click("[data-research-load]");
    expect(container.querySelector("[data-research-run='run-1']")?.getAttribute("data-research-status")).toBe("running");
    // The newest running run is preselected, so a report target exists without a click.
    expect(container.querySelector("[data-research-selected='run-1']")).not.toBeNull();
    await click("[data-research-approve='run-2']");
    expect(container.querySelector("[data-research-run='run-2']")?.getAttribute("data-research-status")).toBe("running");
    expect(container.querySelector("[data-research-selected='run-2']")).not.toBeNull();
    await click("[data-research-pause='run-2']");
    expect(container.querySelector("[data-research-run='run-2']")?.getAttribute("data-research-status")).toBe("paused");
    await click("[data-research-cancel='run-2']");
    expect(container.querySelector("[data-research-run='run-2']")?.getAttribute("data-research-status")).toBe("cancelled");
    expect(container.querySelector("[data-research-cancel='run-2']")).toBeNull();
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /api/knowledge/research-runs?limit=50",
      "POST /api/knowledge/knowledge-a/research-runs/run-2/approve",
      "POST /api/knowledge/knowledge-a/research-runs/run-2/pause",
      "POST /api/knowledge/knowledge-a/research-runs/run-2/cancel",
    ]);
  });

  it("reports an unreadable list as unread, not as empty", async () => {
    await render((call) => call.url.startsWith("/api/knowledge/research-runs")
      ? Response.json({ error: { code: "RESEARCH_RUN_UNAVAILABLE", message: "Research runs are unavailable", retryable: true } }, { status: 503 })
      : Response.json({}));
    await click("[data-research-load]");
    expect(container.querySelector("[data-research-unread='degraded']")).not.toBeNull();
    expect(container.querySelector("[data-research-empty]")).toBeNull();
    expect(container.querySelector("[data-research-code='RESEARCH_RUN_UNAVAILABLE']")).not.toBeNull();
    await click("[data-research-retry]");
    expect(calls.filter((call) => call.url.startsWith("/api/knowledge/research-runs"))).toHaveLength(2);
  });

  it("starts a run scoped to this entry and records a query on the selected run", async () => {
    await render((call) => {
      if (call.url === "/api/knowledge/research-runs?limit=50") return Response.json({ items: [runPayload("run-1", "running")] });
      if (call.url === "/api/knowledge/knowledge-a/research-runs") return Response.json({ researchRun: runPayload("run-9", "draft") }, { status: 201 });
      if (call.url.endsWith("/queries")) return Response.json({ query: { id: "query-1", researchRunId: "run-9", subquestionId: "sq-1", query: "q", rationale: "r", resultIds: [], createdAt: "2026-10-16T00:00:00.000Z" } }, { status: 201 });
      return Response.json({});
    });
    await click("[data-research-load]");
    await click("[data-research-start-submit]");
    expect(container.querySelector("[data-research-start-error]")).not.toBeNull();
    expect(calls.filter((call) => call.url === "/api/knowledge/knowledge-a/research-runs")).toHaveLength(0);
    await type("[data-research-goal]", "Investigate X");
    await type("[data-research-completion]", "Evidence collected");
    await type("[data-research-steps]", "Search\nthen summarise");
    await type("[data-research-subquestions]", "Which sources?");
    await click("[data-research-start-submit]");
    const start = calls.find((call) => call.url === "/api/knowledge/knowledge-a/research-runs");
    expect(start?.body).toEqual({
      goal: "Investigate X",
      scope: { spaceIds: [], collectionIds: [], knowledgeItemIds: ["knowledge-a"] },
      completion: ["Evidence collected"],
      steps: ["Search", "then summarise"],
      subquestions: [{ id: "sq-1", question: "Which sources?", scope: { spaceIds: [], collectionIds: [], knowledgeItemIds: ["knowledge-a"] }, status: "pending" }],
    });
    expect(container.querySelector("[data-research-run='run-9']")).not.toBeNull();
    await click("[data-research-query-submit]");
    expect(container.querySelector("[data-research-query-error]")).not.toBeNull();
    await type("[data-research-query-text]", "quoted phrase");
    await type("[data-research-query-rationale]", "covers the subquestion");
    await click("[data-research-query-submit]");
    const query = calls.find((call) => call.url.endsWith("/queries"));
    expect(query?.body).toEqual({ subquestionId: "sq-1", query: "quoted phrase", rationale: "covers the subquestion", resultIds: [] });
    expect(container.querySelector("[data-research-query='query-1']")).not.toBeNull();
  });

  it("turns a stored report into a draft through the submission intent, not a second draft flow", async () => {
    await render((call) => {
      if (call.url === "/api/knowledge/research-runs?limit=50") return Response.json({ items: [runPayload("run-1", "running")] });
      if (call.url.endsWith("/draft")) return Response.json({ draft: draftPayload() }, { status: 201 });
      return Response.json({});
    });
    await click("[data-research-load]");
    await click("[data-research-draft='run-1']");
    expect(draftCalls()).toHaveLength(1);
    expect(draftCalls()[0]!.body).toEqual({ reportId: "report-1", requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" });
    expect(container.querySelector("[data-research-draft-status='ready']")?.getAttribute("data-research-draft-id")).toBe("submission-1");
    expect(container.querySelector("[data-research-draft-open='true']")?.getAttribute("href")).toBe("/submit");
    // The draft's own text goes through the composer's intent record and body cache.
    const intent = loadSubmissionIntent("member-a");
    expect(intent.kind).toBe("ready");
    if (intent.kind !== "ready") throw new Error("intent missing");
    expect(intent.intent.draft).toEqual({ mode: "markdown", title: "Report title", content: "# Report title\n\nbody" });
    expect(intent.intent.key).toMatch(/^[A-Za-z0-9_-]{16,128}$/u);
    expect(loadOfflineSubmissionDraft("member-a")).toEqual({ mode: "markdown", title: "Report title", content: "# Report title\n\nbody" });
    // A confirmed write leaves no unresolved recovery record behind.
    expect(loadResearchDraftIntent("member-a", "knowledge-a", "run-1")).toEqual({ kind: "empty" });
  });

  it("keeps an unconfirmed draft request, never replays it on its own, and resends the same request only when asked", async () => {
    let drafts = 0;
    const outcome = { fail: true };
    await render((call) => {
      if (call.url === "/api/knowledge/research-runs?limit=50") return Response.json({ items: [runPayload("run-1", "running")] });
      if (call.url.endsWith("/draft")) {
        drafts += 1;
        if (outcome.fail) throw new Error("lost response");
        return Response.json({ draft: draftPayload() }, { status: 201 });
      }
      return Response.json({});
    });
    await click("[data-research-load]");
    await click("[data-research-draft='run-1']");
    expect(drafts).toBe(1);
    expect(container.querySelector("[data-research-draft-status='unconfirmed']")).not.toBeNull();
    expect(container.querySelector("[data-research-draft-warning]")).not.toBeNull();
    const recorded = loadResearchDraftIntent("member-a", "knowledge-a", "run-1");
    expect(recorded.kind).toBe("ready");
    expect(container.querySelector("[data-research-draft-status='ready']")).toBeNull();
    // A fresh panel keeps the record and reports it instead of composing a second request.
    await act(async () => root.render(<Harness key="fresh" />));
    await settle();
    await click("[data-research-load]");
    await click("[data-research-draft='run-1']");
    expect(drafts).toBe(1);
    expect(container.querySelector("[data-research-draft-status='unconfirmed']")).not.toBeNull();
    outcome.fail = false;
    await click("[data-research-draft-retry]");
    expect(drafts).toBe(2);
    expect(draftCalls()[1]!.body).toEqual(draftCalls()[0]!.body);
    expect(container.querySelector("[data-research-draft-status='ready']")).not.toBeNull();
    expect(loadResearchDraftIntent("member-a", "knowledge-a", "run-1")).toEqual({ kind: "empty" });
  });

  it("discards an unresolved record without sending anything, and refuses a server-side rejection with its code", async () => {
    let drafts = 0;
    await render((call) => {
      if (call.url === "/api/knowledge/research-runs?limit=50") return Response.json({ items: [runPayload("run-1", "running")] });
      if (call.url.endsWith("/draft")) { drafts += 1; throw new Error("lost response"); }
      return Response.json({});
    });
    await click("[data-research-load]");
    await click("[data-research-draft='run-1']");
    await click("[data-research-draft-discard]");
    expect(loadResearchDraftIntent("member-a", "knowledge-a", "run-1")).toEqual({ kind: "empty" });
    expect(container.querySelector("[data-research-draft-status]")).toBeNull();
    expect(drafts).toBe(1);

    calls = [];
    await act(async () => root.render(<Harness key="rejected" />));
    await settle();
    await render((call) => {
      if (call.url === "/api/knowledge/research-runs?limit=50") return Response.json({ items: [runPayload("run-1", "running")] });
      if (call.url.endsWith("/draft")) return Response.json({ error: { code: "SUBMISSION_INVALID", message: "Submission fields are invalid", retryable: false } }, { status: 400 });
      return Response.json({});
    });
    await click("[data-research-load]");
    await click("[data-research-draft='run-1']");
    expect(container.querySelector("[data-research-draft-status='failed']")).not.toBeNull();
    expect(container.textContent).toContain("SUBMISSION_INVALID");
    expect(container.querySelector("[data-research-draft-retry]")).not.toBeNull();
    expect(container.textContent).not.toContain("Draft created");
  });

  it("sends nothing when the recovery record cannot be written", async () => {
    await render((call) => call.url === "/api/knowledge/research-runs?limit=50"
      ? Response.json({ items: [runPayload("run-1", "running")] })
      : Response.json({}));
    vi.spyOn(browser.localStorage, "setItem").mockImplementation(() => { throw new Error("storage denied"); });
    await click("[data-research-load]");
    await click("[data-research-draft='run-1']");
    expect(container.querySelector("[data-research-draft-status='storage-blocked']")).not.toBeNull();
    expect(container.textContent).toContain("RESEARCH_DRAFT_INTENT_STORAGE_FAILED");
    expect(draftCalls()).toHaveLength(0);
  });

  it("offers no draft action without the submission:create capability", async () => {
    stub((call) => call.url === "/api/knowledge/research-runs?limit=50" ? Response.json({ items: [runPayload("run-1", "running")] }) : Response.json({}));
    await act(async () => root.render(<Harness canCreateSubmission={false} />));
    await settle();
    await click("[data-research-load]");
    expect(container.querySelector("[data-research-draft='run-1']")).toBeNull();
    expect(container.querySelector("[data-research-draft-blocked='capability']")).not.toBeNull();
    expect(draftCalls()).toHaveLength(0);
  });
});
