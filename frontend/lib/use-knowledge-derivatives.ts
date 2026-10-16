import { useEffect, useRef, useState } from "react";
import { ApiRequestError, type Fetcher } from "./api";
import {
  MAX_DERIVATIVE_SOURCES,
  artifactIsEmpty,
  artifactMessageKey,
  createResearchSubmissionDraft,
  generateKnowledgeArtifact,
  recordResearchQuery,
  startItemResearchRun,
  transitionResearchRun,
  type KnowledgeArtifactKind,
  type KnowledgeDerivative,
  type ResearchDraftReceipt,
  type ResearchDraftTarget,
  type ResearchQueryReceipt,
  type ResearchRunPlanInput,
  type ResearchRunView,
} from "./knowledge-derivatives-data";
import type { RecentResearchItem } from "./knowledge-data";
import { loadRecentResearchPage } from "./knowledge-panels-data";
import { createIdempotencyKey } from "../components/submissions/submission-form-model";
import { createSubmissionIntent, saveSubmissionIntent, type SubmissionIntent } from "./submission-intent";
import { saveOfflineSubmissionDraft } from "./offline-submission-draft";
import {
  discardResearchDraftIntent,
  finishResearchDraftIntent,
  loadResearchDraftIntent,
  prepareResearchDraftIntent,
  type ResearchDraftIntent,
} from "./knowledge-derivative-draft-intent";

/** One derivative surface, as far as the reader renders it. */
export type DerivativeState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "ready"; artifact: KnowledgeDerivative }
  | { kind: "empty"; messageKey: string | null }
  | { kind: "blocked"; reason: "missing-sources" | "missing-run" }
  | { kind: "failed"; code: string; message: string; retryable: boolean }
  | { kind: "unavailable"; reason: "quota" | "degraded"; code: string; message: string; retryable: boolean };

export interface DerivativeFailure { code: string; message: string; retryable: boolean }

const QUOTA_CODES: Record<string, true> = { RESEARCH_QUOTA_DEFERRED: true, AI_QUOTA_EXHAUSTED: true, QUOTA_EXHAUSTED: true };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function failureOf(error: unknown): DerivativeFailure {
  if (error instanceof ApiRequestError) return { code: error.code, message: error.message, retryable: error.retryable };
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,}$/u.test(error.message) ? error.message : "KNOWLEDGE_ARTIFACT_FAILED";
  return { code, message: "", retryable: true };
}

/**
 * A quota deferral and a temporarily unavailable AI backend are answers from
 * the server, not failures of the request: they are shown as their own states
 * with their own text, and both stay retryable.
 */
function derivativeFailure(error: unknown): DerivativeState {
  const failure = failureOf(error);
  if (Object.hasOwn(QUOTA_CODES, failure.code)) return { kind: "unavailable", reason: "quota", ...failure };
  if (failure.code === "AI_UNAVAILABLE") return { kind: "unavailable", reason: "degraded", ...failure };
  return { kind: "failed", ...failure };
}

interface StoredDerivative {
  knowledgeItemId: string;
  revisionId: string;
  state: DerivativeState;
}

export interface KnowledgeDerivativesController {
  /** True when this revision exposes at least one citable chunk for the server window. */
  canGenerate: boolean;
  sourceCount: number;
  activeKind: KnowledgeArtifactKind | null;
  stateFor(kind: KnowledgeArtifactKind): DerivativeState;
  /** `researchRunId` is required by the server for the report surface only. */
  generate(kind: KnowledgeArtifactKind, researchRunId?: string): void;
  dismiss(): void;
}

/**
 * Generation state for one revision of one knowledge item.
 *
 * Every stored entry carries the item and revision it was produced for, and a
 * request only commits through the identity it started with, so a response for
 * a previously viewed item can never reach the current one even if the request
 * outlives the navigation. Dismissing an entry aborts its request and clears
 * only that artifact: the article itself is never touched.
 */
export function useKnowledgeDerivatives(input: {
  knowledgeItemId: string;
  revisionId: string;
  citationIds: readonly string[];
  requester?: Fetcher;
}): KnowledgeDerivativesController {
  const { knowledgeItemId, revisionId } = input;
  const requester = input.requester ?? fetch;
  const citationIds = [...new Set(input.citationIds.filter((id) => typeof id === "string" && id.length > 0))].slice(0, MAX_DERIVATIVE_SOURCES);
  const identity = useRef({ knowledgeItemId, revisionId });
  identity.current = { knowledgeItemId, revisionId };
  const [stored, setStored] = useState<Partial<Record<KnowledgeArtifactKind, StoredDerivative>>>({});
  const [activeKind, setActiveKind] = useState<KnowledgeArtifactKind | null>(null);
  const controllers = useRef<Partial<Record<KnowledgeArtifactKind, AbortController>>>({});
  const tokens = useRef<Partial<Record<KnowledgeArtifactKind, number>>>({});
  const counter = useRef(0);
  useEffect(() => () => {
    for (const controller of Object.values(controllers.current)) controller?.abort();
    controllers.current = {};
    tokens.current = {};
  }, []);

  function commit(kind: KnowledgeArtifactKind, owner: { knowledgeItemId: string; revisionId: string }, state: DerivativeState) {
    setStored((previous) => ({ ...previous, [kind]: { knowledgeItemId: owner.knowledgeItemId, revisionId: owner.revisionId, state } }));
  }

  function stateFor(kind: KnowledgeArtifactKind): DerivativeState {
    const entry = stored[kind];
    if (!entry || entry.knowledgeItemId !== knowledgeItemId || entry.revisionId !== revisionId) return { kind: "idle" };
    return entry.state;
  }

  function generate(kind: KnowledgeArtifactKind, researchRunId?: string) {
    const owner = identity.current;
    setActiveKind(kind);
    if (kind === "report" && !researchRunId) {
      commit(kind, owner, { kind: "blocked", reason: "missing-run" });
      return;
    }
    if (citationIds.length === 0) {
      commit(kind, owner, { kind: "blocked", reason: "missing-sources" });
      return;
    }
    controllers.current[kind]?.abort();
    const controller = new AbortController();
    controllers.current[kind] = controller;
    const token = ++counter.current;
    tokens.current[kind] = token;
    const sources = [...citationIds];
    commit(kind, owner, { kind: "generating" });
    const live = () => tokens.current[kind] === token
      && identity.current.knowledgeItemId === owner.knowledgeItemId
      && identity.current.revisionId === owner.revisionId;
    void generateKnowledgeArtifact(kind, owner.knowledgeItemId, sources, {
      requester,
      signal: controller.signal,
      ...(researchRunId === undefined ? {} : { researchRunId }),
    }).then((artifact) => {
      if (!live()) return;
      commit(kind, owner, artifactIsEmpty(artifact) ? { kind: "empty", messageKey: artifactMessageKey(artifact) } : { kind: "ready", artifact });
    }).catch((error: unknown) => {
      if (!live() || isAbort(error)) return;
      commit(kind, owner, derivativeFailure(error));
    }).finally(() => {
      if (tokens.current[kind] === token) delete controllers.current[kind];
    });
  }

  function dismiss() {
    const kind = activeKind;
    if (!kind) return;
    controllers.current[kind]?.abort();
    delete controllers.current[kind];
    delete tokens.current[kind];
    setStored((previous) => {
      const next = { ...previous };
      delete next[kind];
      return next;
    });
    setActiveKind(null);
  }

  return { canGenerate: citationIds.length > 0, sourceCount: citationIds.length, activeKind, stateFor, generate, dismiss };
}

/** Runs are listed by the workspace-wide endpoint and narrowed to this item. */
export const ITEM_RESEARCH_RUN_LIMIT = 50;

export type ResearchRunListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; runs: readonly ResearchRunView[]; bounded: boolean }
  | { kind: "degraded"; code: string; message: string; retryable: boolean }
  | { kind: "failed"; code: string; message: string; retryable: boolean };

export type ResearchActionName = "start" | "approve" | "pause" | "cancel" | "query";

export type ResearchDraftState =
  | { kind: "idle" }
  | { kind: "blocked"; reason: "capability" }
  | { kind: "storage-blocked"; runId: string; code: string; stage: "reserve" | "settle" }
  | { kind: "pending"; runId: string }
  | { kind: "unconfirmed"; runId: string; reportId: string; reportTitle: string }
  | { kind: "ready"; runId: string; receipt: ResearchDraftReceipt; composer: "loaded" | { blocked: string } }
  | { kind: "failed"; runId: string; reportId: string; reportTitle: string; failure: DerivativeFailure };

export interface ItemResearchRunsController {
  list: ResearchRunListState;
  load(): void;
  action: { name: ResearchActionName; runId: string | null } | null;
  actionError: DerivativeFailure | null;
  selectedRunId: string | null;
  selectRun(runId: string | null): void;
  runningRunId: string | null;
  start(form: ResearchRunPlanInput): void;
  transition(runId: string, action: "approve" | "pause" | "cancel"): void;
  appendQuery(runId: string, input: { subquestionId: string; query: string; rationale: string; resultIds?: readonly string[] }): void;
  queriesFor(runId: string): readonly ResearchQueryReceipt[];
  draft: ResearchDraftState;
  createDraft(runId: string, report: { reportId: string; title: string }, target: ResearchDraftTarget): void;
  retryDraft(): void;
  discardDraft(): void;
  retryComposerHandOff(): void;
}

function toRunView(item: RecentResearchItem): ResearchRunView {
  return {
    id: item.id,
    knowledgeItemId: item.knowledgeItemId,
    goal: item.goal,
    status: item.status,
    quotaState: item.quotaState,
    quotaDeferredUntil: item.quotaDeferredUntil,
    subquestions: item.subquestions,
  };
}

/**
 * Loads the composer with the draft's own text through the existing submission
 * intent: the intent (with its idempotency key) and the offline body are the
 * same records `/submit` reads, so nothing about submissions is re-invented
 * here. A refusal from that machinery is reported, never worked around.
 */
function openDraftInComposer(memberId: string, receipt: ResearchDraftReceipt): "loaded" | { blocked: string } {
  let intent: SubmissionIntent;
  try {
    intent = createSubmissionIntent({ mode: receipt.kind, title: receipt.title, content: receipt.content });
  } catch {
    return { blocked: "SUBMISSION_DRAFT_INVALID" };
  }
  if (!saveSubmissionIntent(memberId, intent)) return { blocked: "SUBMISSION_INTENT_BLOCKED" };
  saveOfflineSubmissionDraft(memberId, intent.draft);
  return "loaded";
}

/**
 * Research-run lifecycle for one knowledge item. The list is loaded on demand
 * (never while the reader is opening), and the one write that has no
 * idempotency key — turning a report into a submission draft — is journalled
 * before it is sent and never replayed on its own.
 */
export function useItemResearchRuns(input: {
  memberId: string;
  knowledgeItemId: string;
  canCreateSubmission: boolean;
  requester?: Fetcher;
}): ItemResearchRunsController {
  const { memberId, knowledgeItemId, canCreateSubmission } = input;
  const requester = input.requester ?? fetch;
  const [list, setList] = useState<ResearchRunListState>({ kind: "idle" });
  const [action, setAction] = useState<{ name: ResearchActionName; runId: string | null } | null>(null);
  const [actionError, setActionError] = useState<DerivativeFailure | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [queries, setQueries] = useState<Partial<Record<string, ResearchQueryReceipt[]>>>({});
  const [draft, setDraft] = useState<ResearchDraftState>({ kind: "idle" });
  const listController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const draftController = useRef<AbortController | null>(null);
  const receipt = useRef<ResearchDraftReceipt | null>(null);
  const actionsAlive = useRef(true);
  useEffect(() => () => {
    actionsAlive.current = false;
    listController.current?.abort();
    actionController.current?.abort();
    draftController.current?.abort();
  }, []);

  const runs = list.kind === "ready" ? list.runs : [];
  const selected = runs.find((run) => run.id === selectedRunId) ?? null;

  function load() {
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    setList({ kind: "loading" });
    void loadRecentResearchPage({ requester, signal: controller.signal, limit: ITEM_RESEARCH_RUN_LIMIT }).then(({ items }) => {
      if (listController.current !== controller) return;
      const owned = items.map(toRunView).filter((run) => run.knowledgeItemId === knowledgeItemId);
      setList({ kind: "ready", runs: owned, bounded: items.length >= ITEM_RESEARCH_RUN_LIMIT });
      setSelectedRunId((current) => current && owned.some((run) => run.id === current && run.status === "running")
        ? current
        : owned.filter((run) => run.status === "running")[0]?.id ?? null);
    }).catch((error: unknown) => {
      if (listController.current !== controller || isAbort(error)) return;
      const failure = failureOf(error);
      const degraded = failure.code === "AI_UNAVAILABLE" || failure.code === "RESEARCH_RUN_UNAVAILABLE"
        || (error instanceof ApiRequestError && error.status === 503);
      setList(degraded ? { kind: "degraded", ...failure } : { kind: "failed", ...failure });
    });
  }

  function beginAction(name: ResearchActionName, runId: string | null) {
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    setAction({ name, runId });
    setActionError(null);
    return controller;
  }

  function failAction(error: unknown, controller: AbortController) {
    if (actionController.current !== controller || isAbort(error)) return;
    setActionError(failureOf(error));
    setAction(null);
  }

  function replaceRun(run: ResearchRunView) {
    setList((current) => current.kind === "ready"
      ? { ...current, runs: current.runs.map((entry) => entry.id === run.id ? run : entry) }
      : current);
  }

  function start(form: ResearchRunPlanInput) {
    const controller = beginAction("start", null);
    const alive = () => actionsAlive.current && actionController.current === controller;
    void startItemResearchRun(knowledgeItemId, form, { requester, signal: controller.signal }).then((run) => {
      if (!alive()) return;
      setList((current) => current.kind === "ready"
        ? { ...current, runs: [run, ...current.runs] }
        : { kind: "ready", runs: [run], bounded: false });
      // The started run becomes the selected one, so its subquestions and its
      // approve step are reachable without hunting for the new row.
      setSelectedRunId(run.id);
      setAction(null);
    }).catch((error: unknown) => failAction(error, controller));
  }

  function transition(runId: string, name: "approve" | "pause" | "cancel") {
    const controller = beginAction(name, runId);
    const alive = () => actionsAlive.current && actionController.current === controller;
    void transitionResearchRun(knowledgeItemId, runId, name, { requester, signal: controller.signal }).then((run) => {
      if (!alive()) return;
      replaceRun(run);
      setSelectedRunId((current) => run.status === "running" ? run.id : current === run.id ? null : current);
      setAction(null);
    }).catch((error: unknown) => failAction(error, controller));
  }

  function appendQuery(runId: string, input: { subquestionId: string; query: string; rationale: string; resultIds?: readonly string[] }) {
    const controller = beginAction("query", runId);
    const alive = () => actionsAlive.current && actionController.current === controller;
    void recordResearchQuery(knowledgeItemId, runId, input, { requester, signal: controller.signal }).then((recorded) => {
      if (!alive()) return;
      setQueries((current) => ({ ...current, [runId]: [...(current[runId] ?? []), recorded] }));
      setAction(null);
    }).catch((error: unknown) => failAction(error, controller));
  }

  function sendDraft(intent: ResearchDraftIntent, target: ResearchDraftTarget) {
    const { researchRunId: runId, reportId, reportTitle } = intent;
    const controller = new AbortController();
    draftController.current?.abort();
    draftController.current = controller;
    setDraft({ kind: "pending", runId });
    void createResearchSubmissionDraft(knowledgeItemId, runId, { reportId, target }, { requester, signal: controller.signal }).then((created) => {
      if (draftController.current !== controller) return;
      receipt.current = created;
      try {
        finishResearchDraftIntent(memberId, knowledgeItemId, runId, intent);
      } catch {
        // A receipt confirms the write, not removal of the record: keep the
        // record and say the tab is not clean instead of dropping it silently.
        setDraft({ kind: "storage-blocked", runId, code: "RESEARCH_DRAFT_INTENT_SETTLE_FAILED", stage: "settle" });
        return;
      }
      setDraft({ kind: "ready", runId, receipt: created, composer: openDraftInComposer(memberId, created) });
    }).catch((error: unknown) => {
      if (draftController.current !== controller || isAbort(error)) return;
      // An answered error means the server did not create a draft. Anything
      // else (transport failure) leaves the outcome unknown: the endpoint has
      // no idempotency key, so it is reported and never replayed on its own.
      setDraft(error instanceof ApiRequestError
        ? { kind: "failed", runId, reportId, reportTitle, failure: failureOf(error) }
        : { kind: "unconfirmed", runId, reportId, reportTitle });
    });
  }

  function createDraft(runId: string, report: { reportId: string; title: string }, target: ResearchDraftTarget) {
    if (draft.kind === "pending") return;
    if (!canCreateSubmission) { setDraft({ kind: "blocked", reason: "capability" }); return; }
    const existing = loadResearchDraftIntent(memberId, knowledgeItemId, runId);
    if (existing.kind === "blocked") {
      setDraft({ kind: "storage-blocked", runId, code: "RESEARCH_DRAFT_INTENT_STORAGE_FAILED", stage: "reserve" });
      return;
    }
    if (existing.kind === "ready") {
      // An earlier request for this run is still unresolved: report it and let
      // the reader decide, never silently compose a second one.
      setDraft({ kind: "unconfirmed", runId, reportId: existing.intent.reportId, reportTitle: existing.intent.reportTitle });
      return;
    }
    const intent: ResearchDraftIntent = {
      id: createIdempotencyKey(),
      knowledgeItemId,
      researchRunId: runId,
      reportId: report.reportId,
      reportTitle: report.title,
      requestedSpaceId: target.requestedSpaceId,
      requestedCollectionId: target.requestedCollectionId,
      requestedVisibility: target.requestedVisibility,
    };
    try {
      prepareResearchDraftIntent(memberId, knowledgeItemId, runId, intent);
    } catch {
      setDraft({ kind: "storage-blocked", runId, code: "RESEARCH_DRAFT_INTENT_STORAGE_FAILED", stage: "reserve" });
      return;
    }
    sendDraft(intent, target);
  }

  function retryDraft() {
    if (draft.kind !== "failed" && draft.kind !== "unconfirmed") return;
    const { runId } = draft;
    const stored = loadResearchDraftIntent(memberId, knowledgeItemId, runId);
    if (stored.kind !== "ready") {
      setDraft({ kind: "storage-blocked", runId, code: "RESEARCH_DRAFT_INTENT_STORAGE_FAILED", stage: "reserve" });
      return;
    }
    sendDraft(stored.intent, {
      requestedSpaceId: stored.intent.requestedSpaceId,
      requestedCollectionId: stored.intent.requestedCollectionId,
      requestedVisibility: stored.intent.requestedVisibility,
    });
  }

  function discardDraft() {
    if (draft.kind !== "failed" && draft.kind !== "unconfirmed" && draft.kind !== "storage-blocked") return;
    const { runId } = draft;
    try {
      discardResearchDraftIntent(memberId, knowledgeItemId, runId);
    } catch {
      setDraft({ kind: "storage-blocked", runId, code: "RESEARCH_DRAFT_INTENT_STORAGE_FAILED", stage: "reserve" });
      return;
    }
    setDraft({ kind: "idle" });
  }

  function retryComposerHandOff() {
    if (draft.kind !== "ready" || draft.composer === "loaded" || !receipt.current) return;
    setDraft({ kind: "ready", runId: draft.runId, receipt: receipt.current, composer: openDraftInComposer(memberId, receipt.current) });
  }

  return {
    list,
    load,
    action,
    actionError,
    selectedRunId,
    selectRun: setSelectedRunId,
    runningRunId: selected && selected.status === "running" ? selected.id : null,
    start,
    transition,
    appendQuery,
    queriesFor: (runId: string) => queries[runId] ?? [],
    draft,
    createDraft,
    retryDraft,
    discardDraft,
    retryComposerHandOff,
  };
}
