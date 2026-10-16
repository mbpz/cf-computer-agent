import { apiFetch, type Fetcher } from "./api";

/**
 * Typed client for the library's AI derivative surfaces.
 *
 * Every response is normalized before it reaches a component: a payload that
 * does not match the documented shape is rejected with `KNOWLEDGE_<SURFACE>_INVALID`
 * instead of being rendered partially. Nothing here caches or invents content,
 * and nothing here decides which item a result belongs to — callers receive a
 * plain value and must keep the request's own identity alongside it.
 */

export type KnowledgeArtifactKind =
  | "summary"
  | "faq"
  | "timeline"
  | "brief"
  | "comparison"
  | "mindmap"
  | "report"
  | "flashcards"
  | "quiz";

export const KNOWLEDGE_ARTIFACT_KINDS: readonly KnowledgeArtifactKind[] = Object.freeze([
  "summary",
  "faq",
  "timeline",
  "brief",
  "comparison",
  "mindmap",
  "report",
  "flashcards",
  "quiz",
]);

/** The server's bounded source window for one derivative request. */
export const MAX_DERIVATIVE_SOURCES = 8;

export interface DerivativeCitation {
  citationId: string;
  title: string;
  headingPath: readonly string[];
  startLine: number;
  endLine: number;
  revisionId?: string;
  chunkId?: string;
  publishedAt?: string;
}

export interface DerivativeStatement {
  text: string;
  citations: readonly DerivativeCitation[];
}

export interface FaqArtifactItem {
  question: string;
  answer: string | null;
  gap: boolean;
  citations: readonly DerivativeCitation[];
}

export interface TimelineArtifactEvent {
  date: string | null;
  title: string;
  description: string;
  citations: readonly DerivativeCitation[];
}

export interface BriefArtifact {
  kind: "brief";
  goal: DerivativeStatement | null;
  keyPoints: readonly DerivativeStatement[];
  risks: readonly DerivativeStatement[];
  openQuestions: readonly DerivativeStatement[];
  messageKey?: string;
}

export interface ComparisonArtifact {
  kind: "comparison";
  rows: readonly { topic: string; cells: readonly { sourceId: string; text: string; citations: readonly DerivativeCitation[] }[] }[];
  consensus: readonly DerivativeStatement[];
  conflicts: readonly DerivativeStatement[];
  messageKey?: string;
}

export interface MindmapArtifact {
  kind: "mindmap";
  nodes: readonly { id: string; label: string; citations: readonly DerivativeCitation[] }[];
  edges: readonly { from: string; to: string; relation: string; citations: readonly DerivativeCitation[] }[];
  messageKey?: string;
}

export interface ResearchReportArtifact {
  kind: "report";
  reportId?: string;
  researchRunId: string;
  version?: number;
  title: string;
  sections: readonly { heading: string; body: string; citations: readonly DerivativeCitation[] }[];
  sourceSnapshots: readonly DerivativeCitation[];
  messageKey?: string;
}

export interface FlashcardArtifact {
  kind: "flashcards";
  cards: readonly { question: string; answer: string; citations: readonly DerivativeCitation[] }[];
  messageKey?: string;
}

export interface QuizArtifact {
  kind: "quiz";
  questions: readonly {
    id: string;
    prompt: string;
    options: readonly string[];
    answerIndex: number | null;
    explanation: string;
    explanationCitations: readonly DerivativeCitation[];
  }[];
  messageKey?: string;
}

export type KnowledgeDerivative =
  | { kind: "summary"; summary: string; citations: readonly DerivativeCitation[]; messageKey?: string }
  | { kind: "faq"; items: readonly FaqArtifactItem[]; messageKey?: string }
  | { kind: "timeline"; events: readonly TimelineArtifactEvent[]; sortStatus: "sorted" | "unsorted"; messageKey?: string }
  | BriefArtifact
  | ComparisonArtifact
  | MindmapArtifact
  | ResearchReportArtifact
  | FlashcardArtifact
  | QuizArtifact;

/** The server answered, but the authorized sources do not support the artifact. */
export const EVIDENCE_INSUFFICIENT_MESSAGE_KEY = "KNOWLEDGE_EVIDENCE_INSUFFICIENT";

export function artifactMessageKey(artifact: KnowledgeDerivative): string | null {
  return typeof artifact.messageKey === "string" && artifact.messageKey ? artifact.messageKey : null;
}

/** True when the server returned no content at all: rendered as its own state, never as an empty artifact. */
export function artifactIsEmpty(artifact: KnowledgeDerivative): boolean {
  switch (artifact.kind) {
    case "summary": return artifact.summary.trim().length === 0;
    case "faq": return artifact.items.length === 0;
    case "timeline": return artifact.events.length === 0;
    case "brief": return artifact.goal === null && artifact.keyPoints.length === 0 && artifact.risks.length === 0 && artifact.openQuestions.length === 0;
    case "comparison": return artifact.rows.length === 0 && artifact.consensus.length === 0 && artifact.conflicts.length === 0;
    case "mindmap": return artifact.nodes.length === 0 && artifact.edges.length === 0;
    case "report": return artifact.sections.length === 0;
    case "flashcards": return artifact.cards.length === 0;
    case "quiz": return artifact.questions.length === 0;
  }
}

export interface DerivativeRequestOptions {
  requester?: Fetcher;
  signal?: AbortSignal;
}

/**
 * `report` is the one surface that is bound to a research run: the server
 * refuses it for a run that is not running or is not the caller's own, and it
 * persists the generated report so a submission draft can be created from it.
 * Every surface has one literal call site, so the probe paths stay resolvable
 * to exactly one library route (`/api/knowledge/:id/<surface>`).
 */
export async function generateKnowledgeArtifact(
  kind: KnowledgeArtifactKind,
  knowledgeItemId: string,
  citationIds: readonly string[],
  options: DerivativeRequestOptions & { researchRunId?: string } = {},
): Promise<KnowledgeDerivative> {
  assertKnowledgeId(knowledgeItemId);
  assertDerivativeCitationIds(citationIds);
  const id = encodeURIComponent(knowledgeItemId);
  const requester = options.requester ?? fetch;
  const signal = options.signal;
  const headers = { "content-type": "application/json" };
  const citations = [...citationIds];
  const sources = JSON.stringify({ citationIds: citations });
  switch (kind) {
    case "summary":
      return normalizeSummary(await apiFetch<unknown>(`/api/knowledge/${id}/summary`, { requester, signal, method: "POST", headers, body: sources }));
    case "faq":
      return normalizeFaq(await apiFetch<unknown>(`/api/knowledge/${id}/faq`, { requester, signal, method: "POST", headers, body: sources }));
    case "timeline":
      return normalizeTimeline(await apiFetch<unknown>(`/api/knowledge/${id}/timeline`, { requester, signal, method: "POST", headers, body: sources }));
    case "brief":
      return normalizeBrief(await apiFetch<unknown>(`/api/knowledge/${id}/brief`, { requester, signal, method: "POST", headers, body: sources }));
    case "comparison":
      return normalizeComparison(await apiFetch<unknown>(`/api/knowledge/${id}/comparison`, { requester, signal, method: "POST", headers, body: sources }));
    case "mindmap":
      return normalizeMindmap(await apiFetch<unknown>(`/api/knowledge/${id}/mindmap`, { requester, signal, method: "POST", headers, body: sources }));
    case "report":
      assertResearchRunId(options.researchRunId ?? "");
      return normalizeReport(await apiFetch<unknown>(`/api/knowledge/${id}/report`, {
        requester,
        signal,
        method: "POST",
        headers,
        body: JSON.stringify({ researchRunId: options.researchRunId as string, citationIds: citations }),
      }));
    case "flashcards":
      return normalizeFlashcards(await apiFetch<unknown>(`/api/knowledge/${id}/flashcards`, { requester, signal, method: "POST", headers, body: sources }));
    case "quiz":
      return normalizeQuiz(await apiFetch<unknown>(`/api/knowledge/${id}/quiz`, { requester, signal, method: "POST", headers, body: sources }));
  }
}

function invalid(surface: string): Error {
  return new Error(`KNOWLEDGE_${surface}_INVALID`);
}

function normalizeSummary(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "SOURCE_SUMMARY");
  const summary = record.summary;
  const citations = requireCitations(record.citations, "SOURCE_SUMMARY");
  if (typeof summary !== "string") throw invalid("SOURCE_SUMMARY");
  return { kind: "summary", summary, citations, ...messageKey(record) };
}

function normalizeFaq(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "FAQ");
  const items = array(record.items, "FAQ").map((entry) => {
    const item = asRecord(entry, "FAQ");
    if (typeof item.question !== "string" || typeof item.gap !== "boolean") throw invalid("FAQ");
    if (item.answer !== null && typeof item.answer !== "string") throw invalid("FAQ");
    return { question: item.question, answer: item.answer, gap: item.gap, citations: requireCitations(item.citations, "FAQ") };
  });
  return { kind: "faq", items, ...messageKey(record) };
}

function normalizeTimeline(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "TIMELINE");
  const events = array(record.events, "TIMELINE").map((entry) => {
    const event = asRecord(entry, "TIMELINE");
    if (event.date !== null && typeof event.date !== "string") throw invalid("TIMELINE");
    if (typeof event.title !== "string" || typeof event.description !== "string") throw invalid("TIMELINE");
    return { date: event.date, title: event.title, description: event.description, citations: requireCitations(event.citations, "TIMELINE") };
  });
  const sortStatus = record.sortStatus === "sorted" || record.sortStatus === "unsorted" ? record.sortStatus : null;
  if (!sortStatus) throw invalid("TIMELINE");
  return { kind: "timeline", events, sortStatus, ...messageKey(record) };
}

function normalizeBrief(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "BRIEF");
  const goal = record.goal === null ? null : statement(record.goal, "BRIEF");
  return {
    kind: "brief",
    goal,
    keyPoints: statements(record.keyPoints, "BRIEF"),
    risks: statements(record.risks, "BRIEF"),
    openQuestions: statements(record.openQuestions, "BRIEF"),
    ...messageKey(record),
  };
}

function normalizeComparison(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "COMPARISON");
  const rows = array(record.rows, "COMPARISON").map((entry) => {
    const row = asRecord(entry, "COMPARISON");
    if (typeof row.topic !== "string") throw invalid("COMPARISON");
    const cells = array(row.cells, "COMPARISON").map((cellEntry) => {
      const cell = asRecord(cellEntry, "COMPARISON");
      if (typeof cell.sourceId !== "string" || typeof cell.text !== "string") throw invalid("COMPARISON");
      return { sourceId: cell.sourceId, text: cell.text, citations: requireCitations(cell.citations, "COMPARISON") };
    });
    return { topic: row.topic, cells };
  });
  return {
    kind: "comparison",
    rows,
    consensus: statements(record.consensus, "COMPARISON"),
    conflicts: statements(record.conflicts, "COMPARISON"),
    ...messageKey(record),
  };
}

function normalizeMindmap(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "MINDMAP");
  const nodes = array(record.nodes, "MINDMAP").map((entry) => {
    const node = asRecord(entry, "MINDMAP");
    if (typeof node.id !== "string" || !node.id || typeof node.label !== "string") throw invalid("MINDMAP");
    return { id: node.id, label: node.label, citations: requireCitations(node.citations, "MINDMAP") };
  });
  const edges = array(record.edges, "MINDMAP").map((entry) => {
    const edge = asRecord(entry, "MINDMAP");
    if (typeof edge.from !== "string" || typeof edge.to !== "string" || typeof edge.relation !== "string") throw invalid("MINDMAP");
    return { from: edge.from, to: edge.to, relation: edge.relation, citations: requireCitations(edge.citations, "MINDMAP") };
  });
  return { kind: "mindmap", nodes, edges, ...messageKey(record) };
}

function normalizeReport(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "RESEARCH_REPORT");
  if (typeof record.researchRunId !== "string" || !record.researchRunId || typeof record.title !== "string") throw invalid("RESEARCH_REPORT");
  if (record.reportId !== undefined && (typeof record.reportId !== "string" || !record.reportId)) throw invalid("RESEARCH_REPORT");
  if (record.version !== undefined && (!Number.isSafeInteger(record.version) || (record.version as number) < 1)) throw invalid("RESEARCH_REPORT");
  const sections = array(record.sections, "RESEARCH_REPORT").map((entry) => {
    const section = asRecord(entry, "RESEARCH_REPORT");
    if (typeof section.heading !== "string" || typeof section.body !== "string") throw invalid("RESEARCH_REPORT");
    return { heading: section.heading, body: section.body, citations: requireCitations(section.citations, "RESEARCH_REPORT") };
  });
  return {
    kind: "report",
    ...(record.reportId === undefined ? {} : { reportId: record.reportId as string }),
    researchRunId: record.researchRunId,
    ...(record.version === undefined ? {} : { version: record.version as number }),
    title: record.title,
    sections,
    sourceSnapshots: requireCitations(record.sourceSnapshots, "RESEARCH_REPORT"),
    ...messageKey(record),
  };
}

function normalizeFlashcards(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "FLASHCARD");
  const cards = array(record.cards, "FLASHCARD").map((entry) => {
    const card = asRecord(entry, "FLASHCARD");
    if (typeof card.question !== "string" || typeof card.answer !== "string") throw invalid("FLASHCARD");
    return { question: card.question, answer: card.answer, citations: requireCitations(card.citations, "FLASHCARD") };
  });
  return { kind: "flashcards", cards, ...messageKey(record) };
}

function normalizeQuiz(value: unknown): KnowledgeDerivative {
  const record = asRecord(value, "QUIZ");
  const questions = array(record.questions, "QUIZ").map((entry) => {
    const question = asRecord(entry, "QUIZ");
    if (typeof question.id !== "string" || !question.id || typeof question.prompt !== "string" || typeof question.explanation !== "string") throw invalid("QUIZ");
    const options = array(question.options, "QUIZ");
    if (options.length < 2 || !options.every((option): option is string => typeof option === "string")) throw invalid("QUIZ");
    const answerIndex = question.answerIndex;
    if (answerIndex !== null && (!Number.isSafeInteger(answerIndex) || (answerIndex as number) < 0 || (answerIndex as number) >= options.length)) throw invalid("QUIZ");
    return {
      id: question.id,
      prompt: question.prompt,
      options,
      answerIndex: answerIndex as number | null,
      explanation: question.explanation,
      explanationCitations: requireCitations(question.explanationCitations, "QUIZ"),
    };
  });
  return { kind: "quiz", questions, ...messageKey(record) };
}

function statements(value: unknown, surface: string): readonly DerivativeStatement[] {
  return array(value, surface).map((entry) => statement(entry, surface));
}

function statement(value: unknown, surface: string): DerivativeStatement {
  const record = asRecord(value, surface);
  if (typeof record.text !== "string") throw invalid(surface);
  return { text: record.text, citations: requireCitations(record.citations, surface) };
}

function asRecord(value: unknown, surface: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(surface);
  return value as Record<string, unknown>;
}

function array(value: unknown, surface: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalid(surface);
  return value;
}

function messageKey(record: Record<string, unknown>): { messageKey?: string } {
  const value = record.messageKey;
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length === 0) throw invalid("MESSAGE_KEY");
  return { messageKey: value };
}

function requireCitations(value: unknown, surface: string): readonly DerivativeCitation[] {
  return array(value, surface).map((entry) => {
    const citation = asRecord(entry, surface);
    if (typeof citation.citationId !== "string" || !citation.citationId || typeof citation.title !== "string") throw invalid(surface);
    if (!Array.isArray(citation.headingPath) || !citation.headingPath.every((part) => typeof part === "string")) throw invalid(surface);
    const startLine = citation.startLine;
    const endLine = citation.endLine;
    if (!Number.isSafeInteger(startLine) || (startLine as number) < 1) throw invalid(surface);
    if (!Number.isSafeInteger(endLine) || (endLine as number) < (startLine as number)) throw invalid(surface);
    return {
      citationId: citation.citationId,
      title: citation.title,
      headingPath: citation.headingPath as string[],
      startLine: startLine as number,
      endLine: endLine as number,
      ...(typeof citation.revisionId === "string" && citation.revisionId ? { revisionId: citation.revisionId } : {}),
      ...(typeof citation.chunkId === "string" && citation.chunkId ? { chunkId: citation.chunkId } : {}),
      ...(typeof citation.publishedAt === "string" && citation.publishedAt ? { publishedAt: citation.publishedAt } : {}),
    };
  });
}

function assertKnowledgeId(knowledgeItemId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(knowledgeItemId)) throw new Error("KNOWLEDGE_ID_INVALID");
}

function assertDerivativeCitationIds(citationIds: readonly string[]): void {
  if (citationIds.length < 1 || citationIds.length > MAX_DERIVATIVE_SOURCES) throw new Error("KNOWLEDGE_ARTIFACT_SOURCES_INVALID");
  const seen = new Set<string>();
  for (const citationId of citationIds) {
    if (typeof citationId !== "string" || !citationId || citationId.length > 2048 || seen.has(citationId)) throw new Error("KNOWLEDGE_ARTIFACT_SOURCES_INVALID");
    seen.add(citationId);
  }
}

function assertResearchRunId(researchRunId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(researchRunId)) throw new Error("RESEARCH_RUN_ID_INVALID");
}

/** One run, reduced to what the reader panel acts on. */
export interface ResearchRunView {
  id: string;
  knowledgeItemId: string;
  goal: string;
  status: "draft" | "running" | "paused" | "completed" | "cancelled";
  quotaState: "available" | "deferred_quota";
  quotaDeferredUntil: string | null;
  subquestions: readonly { id: string; question: string; status: "pending" | "completed" | "blocked" }[];
}

export interface ResearchQueryReceipt {
  id: string;
  researchRunId: string;
  subquestionId: string;
  query: string;
  rationale: string;
  resultIds: readonly string[];
  createdAt: string;
}

export interface ResearchRunPlanInput {
  goal: string;
  /** What "done" means for this run; the server requires at least one entry. */
  completion: readonly string[];
  steps: readonly string[];
  subquestions: readonly string[];
}

const MAX_RESEARCH_RUN_PLAN_ENTRIES = 8;

/**
 * Starts a run for this knowledge item. The plan scope is exactly this entry:
 * the panel does not know the item's space or collection, and guessing one
 * would search sources the reader never showed.
 */
export async function startItemResearchRun(
  knowledgeItemId: string,
  plan: ResearchRunPlanInput,
  options: DerivativeRequestOptions = {},
): Promise<ResearchRunView> {
  assertKnowledgeId(knowledgeItemId);
  const goal = plan.goal.trim();
  if (!goal || [...goal].length > 1_000) throw new Error("RESEARCH_RUN_INPUT_INVALID");
  const completion = boundedEntries(plan.completion, 8);
  const steps = boundedEntries(plan.steps, MAX_RESEARCH_RUN_PLAN_ENTRIES);
  const subquestions = boundedEntries(plan.subquestions, MAX_RESEARCH_RUN_PLAN_ENTRIES);
  const scope = { spaceIds: [], collectionIds: [], knowledgeItemIds: [knowledgeItemId] };
  const data = await apiFetch<unknown>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/research-runs`, {
    requester: options.requester ?? fetch,
    signal: options.signal,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal,
      scope,
      completion,
      steps,
      subquestions: subquestions.map((question, index) => ({ id: `sq-${index + 1}`, question, scope, status: "pending" })),
    }),
  });
  return normalizeRunEnvelope(data, "RESEARCH_RUN");
}

function boundedEntries(values: readonly string[], max: number): string[] {
  const entries = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (entries.length < 1 || entries.length > max) throw new Error("RESEARCH_RUN_INPUT_INVALID");
  if (!entries.every((entry) => [...entry].length <= 512)) throw new Error("RESEARCH_RUN_INPUT_INVALID");
  return entries;
}

export async function transitionResearchRun(
  knowledgeItemId: string,
  researchRunId: string,
  action: "approve" | "pause" | "cancel",
  options: DerivativeRequestOptions = {},
): Promise<ResearchRunView> {
  assertKnowledgeId(knowledgeItemId);
  assertResearchRunId(researchRunId);
  const id = encodeURIComponent(knowledgeItemId);
  const runId = encodeURIComponent(researchRunId);
  const requester = options.requester ?? fetch;
  const signal = options.signal;
  switch (action) {
    case "approve":
      return normalizeRunEnvelope(await apiFetch<unknown>(`/api/knowledge/${id}/research-runs/${runId}/approve`, { requester, signal, method: "POST" }), "RESEARCH_RUN");
    case "pause":
      return normalizeRunEnvelope(await apiFetch<unknown>(`/api/knowledge/${id}/research-runs/${runId}/pause`, { requester, signal, method: "POST" }), "RESEARCH_RUN");
    case "cancel":
      return normalizeRunEnvelope(await apiFetch<unknown>(`/api/knowledge/${id}/research-runs/${runId}/cancel`, { requester, signal, method: "POST" }), "RESEARCH_RUN");
  }
}

export async function recordResearchQuery(
  knowledgeItemId: string,
  researchRunId: string,
  input: { subquestionId: string; query: string; rationale: string; resultIds?: readonly string[] },
  options: DerivativeRequestOptions = {},
): Promise<ResearchQueryReceipt> {
  assertKnowledgeId(knowledgeItemId);
  assertResearchRunId(researchRunId);
  const query = input.query.trim();
  const rationale = input.rationale.trim();
  if (!input.subquestionId.trim() || !query || [...query].length > 512 || !rationale || [...rationale].length > 1_000) {
    throw new Error("RESEARCH_QUERY_INPUT_INVALID");
  }
  const resultIds = [...(input.resultIds ?? [])];
  if (resultIds.length > 20 || !resultIds.every((id) => /^[A-Za-z0-9][A-Za-z0-9_:-]{0,255}$/u.test(id))) throw new Error("RESEARCH_QUERY_INPUT_INVALID");
  const data = await apiFetch<unknown>(
    `/api/knowledge/${encodeURIComponent(knowledgeItemId)}/research-runs/${encodeURIComponent(researchRunId)}/queries`,
    {
      requester: options.requester ?? fetch,
      signal: options.signal,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subquestionId: input.subquestionId, query, rationale, resultIds }),
    },
  );
  const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
  const queryRecord = record ? asRecord(record.query, "RESEARCH_QUERY") : null;
  if (!queryRecord) throw invalid("RESEARCH_QUERY");
  if (typeof queryRecord.id !== "string" || !queryRecord.id
    || queryRecord.researchRunId !== researchRunId
    || queryRecord.subquestionId !== input.subquestionId
    || typeof queryRecord.query !== "string" || typeof queryRecord.rationale !== "string"
    || typeof queryRecord.createdAt !== "string" || !Array.isArray(queryRecord.resultIds)
    || !queryRecord.resultIds.every((id: unknown) => typeof id === "string")) throw invalid("RESEARCH_QUERY");
  return {
    id: queryRecord.id,
    researchRunId,
    subquestionId: input.subquestionId,
    query: queryRecord.query,
    rationale: queryRecord.rationale,
    resultIds: queryRecord.resultIds as string[],
    createdAt: queryRecord.createdAt,
  };
}

export interface ResearchDraftTarget {
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  requestedVisibility: "shared" | "admin_only";
}

/** The server's created draft submission, as far as the reader needs to hand it to the composer. */
export interface ResearchDraftReceipt {
  id: string;
  title: string;
  content: string;
  kind: "text" | "markdown" | "code";
  status: "draft";
  target: ResearchDraftTarget;
  createdAt: string;
}

/**
 * Turns a persisted research report into a submission draft. The endpoint takes
 * no idempotency key: the caller records the exact request before sending it, so
 * an unconfirmed outcome is retried as the same request and never as a new one.
 */
export async function createResearchSubmissionDraft(
  knowledgeItemId: string,
  researchRunId: string,
  input: { reportId: string; target: ResearchDraftTarget },
  options: DerivativeRequestOptions = {},
): Promise<ResearchDraftReceipt> {
  assertKnowledgeId(knowledgeItemId);
  assertResearchRunId(researchRunId);
  if (!input.reportId || typeof input.reportId !== "string") throw new Error("RESEARCH_DRAFT_INPUT_INVALID");
  const target = input.target;
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(target.requestedSpaceId)
    || (target.requestedCollectionId !== null && !/^[A-Za-z0-9_-]{1,200}$/u.test(target.requestedCollectionId))
    || (target.requestedVisibility !== "shared" && target.requestedVisibility !== "admin_only")) {
    throw new Error("RESEARCH_DRAFT_INPUT_INVALID");
  }
  const data = await apiFetch<unknown>(
    `/api/knowledge/${encodeURIComponent(knowledgeItemId)}/research-runs/${encodeURIComponent(researchRunId)}/draft`,
    {
      requester: options.requester ?? fetch,
      signal: options.signal,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportId: input.reportId,
        requestedSpaceId: target.requestedSpaceId,
        requestedCollectionId: target.requestedCollectionId,
        requestedVisibility: target.requestedVisibility,
      }),
    },
  );
  const envelope = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
  const draft = envelope ? asRecord(envelope.draft, "RESEARCH_DRAFT") : null;
  if (!draft) throw invalid("RESEARCH_DRAFT");
  if (typeof draft.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(draft.id) || draft.status !== "draft"
    || typeof draft.title !== "string" || typeof draft.content !== "string"
    || (draft.kind !== "text" && draft.kind !== "markdown" && draft.kind !== "code")
    || typeof draft.requestedSpaceId !== "string"
    || (draft.requestedCollectionId !== null && typeof draft.requestedCollectionId !== "string")
    || (draft.requestedVisibility !== "shared" && draft.requestedVisibility !== "admin_only")
    || typeof draft.createdAt !== "string") throw invalid("RESEARCH_DRAFT");
  return {
    id: draft.id,
    title: draft.title,
    content: draft.content,
    kind: draft.kind,
    status: "draft",
    target: {
      requestedSpaceId: draft.requestedSpaceId,
      requestedCollectionId: draft.requestedCollectionId as string | null,
      requestedVisibility: draft.requestedVisibility,
    },
    createdAt: draft.createdAt,
  };
}

function normalizeRunEnvelope(value: unknown, surface: string): ResearchRunView {
  const envelope = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const run = envelope ? asRecord(envelope.researchRun, surface) : null;
  if (!run) throw invalid(surface);
  if (typeof run.id !== "string" || !run.id || typeof run.knowledgeItemId !== "string" || !run.knowledgeItemId || typeof run.goal !== "string") throw invalid(surface);
  if (run.status !== "draft" && run.status !== "running" && run.status !== "paused" && run.status !== "completed" && run.status !== "cancelled") throw invalid(surface);
  if (run.quotaState !== "available" && run.quotaState !== "deferred_quota") throw invalid(surface);
  if (run.quotaDeferredUntil !== null && typeof run.quotaDeferredUntil !== "string") throw invalid(surface);
  const plan = asRecord(run.plan, surface);
  const subquestions = array(plan.subquestions, surface).map((entry) => {
    const item = asRecord(entry, surface);
    const status = item.status;
    if (typeof item.id !== "string" || !item.id || typeof item.question !== "string") throw invalid(surface);
    if (status !== "pending" && status !== "completed" && status !== "blocked") throw invalid(surface);
    return { id: item.id, question: item.question, status: status as "pending" | "completed" | "blocked" };
  });
  if (subquestions.length < 1) throw invalid(surface);
  return {
    id: run.id,
    knowledgeItemId: run.knowledgeItemId,
    goal: run.goal,
    status: run.status,
    quotaState: run.quotaState,
    quotaDeferredUntil: run.quotaDeferredUntil,
    subquestions,
  };
}
