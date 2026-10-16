import { describe, expect, it, vi } from "vitest";
import {
  artifactIsEmpty,
  createResearchSubmissionDraft,
  generateKnowledgeArtifact,
  recordResearchQuery,
  startItemResearchRun,
  transitionResearchRun,
} from "../../frontend/lib/knowledge-derivatives-data";

const citation = { citationId: "citation-1", title: "Doc", headingPath: ["H"], startLine: 1, endLine: 2 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("knowledge derivative boundary", () => {
  it("sends the citation window to the surface's own route and returns the normalized artifact", async () => {
    const requester = vi.fn().mockResolvedValue(json({ summary: "Grounded summary", citations: [citation] }));
    await expect(generateKnowledgeArtifact("summary", "knowledge-1", ["citation-1"], { requester })).resolves.toEqual({
      kind: "summary",
      summary: "Grounded summary",
      citations: [citation],
    });
    expect(requester).toHaveBeenCalledWith("/api/knowledge/knowledge-1/summary", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ citationIds: ["citation-1"] }),
    }));
  });

  it("rejects a malformed derivation payload instead of rendering part of it", async () => {
    const badCitations = vi.fn().mockResolvedValue(json({ items: [{ question: "Q", answer: "A", citations: "not-a-list", gap: false }] }));
    await expect(generateKnowledgeArtifact("faq", "knowledge-1", ["citation-1"], { requester: badCitations }))
      .rejects.toThrow("KNOWLEDGE_FAQ_INVALID");

    const badAnswerIndex = vi.fn().mockResolvedValue(json({
      questions: [{ id: "q1", prompt: "P", options: ["a", "b"], answerIndex: 7, explanation: "E", explanationCitations: [citation] }],
    }));
    await expect(generateKnowledgeArtifact("quiz", "knowledge-1", ["citation-1"], { requester: badAnswerIndex }))
      .rejects.toThrow("KNOWLEDGE_QUIZ_INVALID");

    const badSummaryType = vi.fn().mockResolvedValue(json({ summary: 42, citations: [] }));
    await expect(generateKnowledgeArtifact("summary", "knowledge-1", ["citation-1"], { requester: badSummaryType }))
      .rejects.toThrow("KNOWLEDGE_SOURCE_SUMMARY_INVALID");

    const badEdge = vi.fn().mockResolvedValue(json({ nodes: [{ id: "n1", label: "L", citations: [citation] }], edges: [{ from: "n1", to: "n2", citations: [] }] }));
    await expect(generateKnowledgeArtifact("mindmap", "knowledge-1", ["citation-1"], { requester: badEdge }))
      .rejects.toThrow("KNOWLEDGE_MINDMAP_INVALID");
  });

  it("refuses a citation window the server would refuse, and requires a run for the report surface", async () => {
    const requester = vi.fn();
    await expect(generateKnowledgeArtifact("brief", "knowledge-1", [], { requester })).rejects.toThrow("KNOWLEDGE_ARTIFACT_SOURCES_INVALID");
    await expect(generateKnowledgeArtifact("brief", "knowledge-1", ["a", "a"], { requester })).rejects.toThrow("KNOWLEDGE_ARTIFACT_SOURCES_INVALID");
    await expect(generateKnowledgeArtifact("report", "knowledge-1", ["citation-1"], { requester })).rejects.toThrow("RESEARCH_RUN_ID_INVALID");
    expect(requester).not.toHaveBeenCalled();
  });

  it("carries the run id on the report request and keeps the stored report identity", async () => {
    const requester = vi.fn().mockResolvedValue(json({
      reportId: "report-1",
      researchRunId: "run-1",
      version: 3,
      title: "Report",
      sections: [{ heading: "S", body: "B", citations: [{ ...citation, revisionId: "revision-1", chunkId: "chunk-1", publishedAt: "2026-01-01T00:00:00.000Z" }] }],
      sourceSnapshots: [citation],
    }));
    await expect(generateKnowledgeArtifact("report", "knowledge-1", ["citation-1"], { requester, researchRunId: "run-1" })).resolves.toEqual({
      kind: "report",
      reportId: "report-1",
      researchRunId: "run-1",
      version: 3,
      title: "Report",
      sections: [{ heading: "S", body: "B", citations: [{ ...citation, revisionId: "revision-1", chunkId: "chunk-1", publishedAt: "2026-01-01T00:00:00.000Z" }] }],
      sourceSnapshots: [citation],
    });
    expect(requester).toHaveBeenCalledWith("/api/knowledge/knowledge-1/report", expect.objectContaining({
      body: JSON.stringify({ researchRunId: "run-1", citationIds: ["citation-1"] }),
    }));
  });

  it("surfaces the server's own error code and never invents content for an empty artifact", async () => {
    const quota = vi.fn().mockResolvedValue(json({ error: { code: "RESEARCH_QUOTA_DEFERRED", message: "Research quota deferred until 2026-10-17T00:00:00.000Z", retryable: true } }, 429));
    await expect(generateKnowledgeArtifact("summary", "knowledge-1", ["citation-1"], { requester: quota }))
      .rejects.toMatchObject({ code: "RESEARCH_QUOTA_DEFERRED", status: 429, retryable: true });

    const insufficient = vi.fn().mockResolvedValue(json({ questions: [], messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT" }));
    const artifact = await generateKnowledgeArtifact("quiz", "knowledge-1", ["citation-1"], { requester: insufficient });
    expect(artifactIsEmpty(artifact)).toBe(true);
    expect(artifact).toEqual({ kind: "quiz", questions: [], messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT" });
  });

  it("starts a run scoped to this entry only", async () => {
    const requester = vi.fn().mockResolvedValue(json({ researchRun: runPayload() }, 201));
    await expect(startItemResearchRun("knowledge-1", { goal: "  Goal  ", completion: ["done"], steps: ["step"], subquestions: ["why"] }, { requester }))
      .resolves.toEqual({ id: "run-1", knowledgeItemId: "knowledge-1", goal: "Goal", status: "draft", quotaState: "available", quotaDeferredUntil: null, subquestions: [{ id: "sq-1", question: "why", status: "pending" }] });
    const body = JSON.parse((requester.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toEqual({
      goal: "Goal",
      scope: { spaceIds: [], collectionIds: [], knowledgeItemIds: ["knowledge-1"] },
      completion: ["done"],
      steps: ["step"],
      subquestions: [{ id: "sq-1", question: "why", scope: { spaceIds: [], collectionIds: [], knowledgeItemIds: ["knowledge-1"] }, status: "pending" }],
    });
    await expect(startItemResearchRun("knowledge-1", { goal: "", completion: ["done"], steps: ["s"], subquestions: ["q"] }, { requester }))
      .rejects.toThrow("RESEARCH_RUN_INPUT_INVALID");
    await expect(startItemResearchRun("knowledge-1", { goal: "g", completion: [], steps: ["s"], subquestions: ["q"] }, { requester }))
      .rejects.toThrow("RESEARCH_RUN_INPUT_INVALID");
  });

  it("validates run transitions, recorded queries, and the created draft", async () => {
    const approve = vi.fn().mockResolvedValue(json({ researchRun: runPayload("running") }));
    await expect(transitionResearchRun("knowledge-1", "run-1", "approve", { requester: approve })).resolves.toMatchObject({ id: "run-1", status: "running" });
    expect(approve).toHaveBeenCalledWith("/api/knowledge/knowledge-1/research-runs/run-1/approve", expect.objectContaining({ method: "POST" }));

    const query = vi.fn().mockResolvedValue(json({ query: { id: "query-1", researchRunId: "run-1", subquestionId: "sq-1", query: "q", rationale: "r", resultIds: [], createdAt: "2026-10-16T00:00:00.000Z" } }, 201));
    await expect(recordResearchQuery("knowledge-1", "run-1", { subquestionId: "sq-1", query: "q", rationale: "r" }, { requester: query }))
      .resolves.toMatchObject({ id: "query-1", researchRunId: "run-1", subquestionId: "sq-1" });
    await expect(recordResearchQuery("knowledge-1", "run-1", { subquestionId: "sq-1", query: "q", rationale: "" }, { requester: query }))
      .rejects.toThrow("RESEARCH_QUERY_INPUT_INVALID");

    const draft = vi.fn().mockResolvedValue(json({ draft: draftPayload() }, 201));
    await expect(createResearchSubmissionDraft("knowledge-1", "run-1", { reportId: "report-1", target: { requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" } }, { requester: draft }))
      .resolves.toEqual({
        id: "submission-1",
        title: "Report",
        content: "# Report",
        kind: "markdown",
        status: "draft",
        target: { requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" },
        createdAt: "2026-10-16T00:00:00.000Z",
      });
    expect(draft).toHaveBeenCalledWith("/api/knowledge/knowledge-1/research-runs/run-1/draft", expect.objectContaining({
      body: JSON.stringify({ reportId: "report-1", requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" }),
    }));

    const wrongStatus = vi.fn().mockResolvedValue(json({ draft: { ...draftPayload(), status: "review_pending" } }, 201));
    await expect(createResearchSubmissionDraft("knowledge-1", "run-1", { reportId: "report-1", target: { requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" } }, { requester: wrongStatus }))
      .rejects.toThrow("KNOWLEDGE_RESEARCH_DRAFT_INVALID");
  });
});

function runPayload(status = "draft"): Record<string, unknown> {
  return {
    id: "run-1",
    ownerMemberId: "member-a",
    knowledgeItemId: "knowledge-1",
    goal: "Goal",
    status,
    quotaState: "available",
    quotaDeferredUntil: null,
    plan: {
      spaceIds: [],
      collectionIds: [],
      knowledgeItemIds: ["knowledge-1"],
      completion: ["done"],
      steps: ["step"],
      subquestions: [{ id: "sq-1", question: "why", scope: { spaceIds: [], collectionIds: [], knowledgeItemIds: ["knowledge-1"] }, status: "pending" }],
    },
    checkpoint: { nextStep: 0, completedSubquestionIds: [] },
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
    title: "Report",
    content: "# Report",
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
}
