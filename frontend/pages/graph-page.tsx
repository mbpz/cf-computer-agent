import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas } from "../components/graph/graph-canvas";
import { GraphEvidencePanel } from "../components/graph/graph-evidence-panel";
import { GraphInspector } from "../components/graph/graph-inspector";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { loadGraph, type GraphQueryInput, type GraphSnapshot } from "../lib/graph-data";
import { loadGraphSuggestions, type GraphSuggestion, type GraphSuggestionResult } from "../lib/graph-suggestions";
import { createGraphActionClientKey, dispatchGraphAction, queryGraphAction } from "../lib/graph-actions";
import { clearGraphAction, discardBlockedGraphAction, loadGraphAction, saveGraphAction, type GraphActionIntent } from "../lib/graph-action-intent";
import { discardBlockedGraphView, loadGraphView, persistGraphView } from "../lib/graph-view";
import { ApiRequestError } from "../lib/api";
import { registerWorkspaceLeaveGuard } from "../lib/workspace-location";
import type { GraphNode } from "../lib/graph-data";
import type { GraphInspectorActionStatus } from "../components/graph/graph-inspector";

export type GraphPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "forbidden" }
  | { kind: "empty" }
  | { kind: "ready"; snapshot: GraphSnapshot }
  | { kind: "truncated"; snapshot: GraphSnapshot };

export type GraphLens = "workspace" | "knowledge" | "work";
export type GraphTemporalRange = "all" | "7d" | "30d" | "90d";
export type GraphSuggestionsState = { kind: "idle" | "loading" | "error"; result?: GraphSuggestionResult };

export interface GraphPageProps {
  locale: LocaleRuntime;
  state: GraphPageState;
  query?: string;
  lens?: GraphLens;
  temporalRange?: GraphTemporalRange;
  changeKind?: "all" | "added" | "updated" | "completed" | "archived";
  onQueryChange?: (query: string) => void;
  onLensChange?: (lens: GraphLens) => void;
  onTemporalRangeChange?: (range: GraphTemporalRange) => void;
  onChangeKindChange?: (changeKind: NonNullable<GraphPageProps["changeKind"]>) => void;
  suggestionsState?: GraphSuggestionsState;
  onGenerateSuggestions?: () => void;
  onRetry?: () => void;
  onDenied?: () => void;
  viewBlocked?: boolean;
  viewNotice?: string;
  onDiscardView?: () => void;
}

type GraphActionOwner = { node: GraphNode; clientKey: string; status: "running" | "checking" | "unconfirmed" };
type GraphActionOutcome = { nodeId: string; status: "success"; clientKey: string } | { status: "rejected" | "not_sent" | "not_recorded" };

export type GraphLoader = (query: GraphQueryInput, signal: AbortSignal) => Promise<GraphSnapshot>;

const WORK_LENS_KINDS = new Set(["task", "project", "goal", "meeting", "decision", "action_item", "inbox", "calendar", "focus"]);

export function GraphPage({ locale, state, memberId, query = "", lens = "workspace", temporalRange = "all", changeKind = "all", suggestionsState = { kind: "idle" }, onQueryChange, onLensChange, onTemporalRangeChange, onChangeKindChange, onGenerateSuggestions, onRetry, onDenied, viewBlocked = false, viewNotice, onDiscardView }: GraphPageProps & { memberId?: string }) {
  const [stored] = useState(() => memberId ? loadGraphAction(memberId) : { kind: "empty" as const });
  const restored: GraphActionOwner | null = stored.kind === "ready"
    ? { node: stored.intent.node, clientKey: stored.intent.clientKey, status: "unconfirmed" } : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The running or unconfirmed action belongs to the page, not to the current selection:
  // changing node or lens must not drop its client key, and leaving waits for its result.
  // With a member, an unconfirmed action survives refresh in this tab.
  const [action, setAction] = useState<GraphActionOwner | null>(restored);
  const [recordBlocked, setRecordBlocked] = useState(stored.kind === "blocked");
  const [outcome, setOutcome] = useState<GraphActionOutcome | null>(null);
  const actionRef = useRef<GraphActionOwner | null>(restored);
  const aliveRef = useRef(true);
  const queryControllerRef = useRef<AbortController | null>(null);
  const [queryUnconfirmed, setQueryUnconfirmed] = useState(false);
  const leaveGuardRef = useRef<(() => void) | null>(null);
  const syncLeaveGuard = useCallback(() => {
    if (actionRef.current && !leaveGuardRef.current) leaveGuardRef.current = registerWorkspaceLeaveGuard(() => ({ kind: actionRef.current ? "block" : "allow" }));
    else if (!actionRef.current && leaveGuardRef.current) { leaveGuardRef.current(); leaveGuardRef.current = null; }
  }, []);
  const publish = useCallback((next: GraphActionOwner | null) => { actionRef.current = next; syncLeaveGuard(); setAction(next); }, [syncLeaveGuard]);
  useEffect(() => {
    aliveRef.current = true;
    syncLeaveGuard();
    const warn = (event: BeforeUnloadEvent) => { if (actionRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { aliveRef.current = false; queryControllerRef.current?.abort(); actionRef.current = null; syncLeaveGuard(); window.removeEventListener("beforeunload", warn); };
  }, [syncLeaveGuard]);
  const snapshot = state.kind === "ready" || state.kind === "truncated" ? state.snapshot : null;
  const filteredSnapshot = useMemo(() => snapshot ? filterSnapshot(snapshot, query, lens) : null, [lens, query, snapshot]);
  const selectedNode = filteredSnapshot?.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedCitationIds = filteredSnapshot?.edges
    .filter((edge) => edge.source === selectedId || edge.target === selectedId)
    .flatMap((edge) => edge.citationIds) ?? [];
  useEffect(() => {
    if (selectedId && !selectedNode) setSelectedId(null);
  }, [selectedId, selectedNode]);
  useEffect(() => {
    if (!selectedId || typeof document !== "object" || document === null) return;
    const focusInspector = () => document.querySelector<HTMLElement>("[data-graph-inspector]")?.focus();
    if (typeof globalThis.requestAnimationFrame === "function") {
      const frame = globalThis.requestAnimationFrame(focusInspector);
      return () => globalThis.cancelAnimationFrame?.(frame);
    }
    focusInspector();
  }, [selectedId]);
  const graphIntent = (owner: GraphActionOwner): GraphActionIntent => ({
    clientKey: owner.clientKey,
    node: { id: owner.node.id, kind: owner.node.kind, label: owner.node.label, status: owner.node.status, href: owner.node.href, metadata: {} },
  });
  const releaseAction = (owner: GraphActionOwner, next: GraphActionOwner | null, nextOutcome: GraphActionOutcome | null) => {
    if (next === null && memberId && !clearGraphAction(memberId, graphIntent(owner))) {
      publish({ ...owner, status: "unconfirmed" });
      setOutcome(null);
      return;
    }
    publish(next);
    setOutcome(nextOutcome);
  };
  // Revoking the view is not a receipt for an earlier, uncertain mutation.
  // Release navigation without deleting that mutation's persisted retry identity.
  const denyAction = (owner: GraphActionOwner, preserveIntent: boolean) => {
    if (!preserveIntent && memberId) clearGraphAction(memberId, graphIntent(owner));
    publish(null); setOutcome(null); setQueryUnconfirmed(false);
    onDenied?.();
  };
  useEffect(() => {
    if (state.kind === "forbidden") {
      // The graph read can revoke access independently of the recovery request.
      // Invalidate in-flight callbacks and release UI/leave guards, not storage.
      queryControllerRef.current?.abort();
      publish(null); setOutcome(null); setSelectedId(null);
      return;
    }
    // A successful explicit graph reload can restore recovery in this same mount.
    // After denial, loading/error/forbidden must not reveal or replay the intent.
    if (!memberId || actionRef.current || !["ready", "truncated", "empty"].includes(state.kind)) return;
    const pending = loadGraphAction(memberId);
    setRecordBlocked(pending.kind === "blocked");
    if (pending.kind === "ready") publish({ ...pending.intent, status: "unconfirmed" });
  }, [memberId, state.kind, publish]);
  const runGraphAction = (retry?: GraphActionOwner) => {
    if (recordBlocked) return;
    const current = actionRef.current;
    if (current && current.status !== "unconfirmed") return;
    if (current && current !== retry) return;
    const node = retry?.node ?? selectedNode;
    if (!node) return;
    const owner: GraphActionOwner = { node, clientKey: retry?.clientKey ?? createGraphActionClientKey(node), status: "running" };
    if (memberId && !retry && !saveGraphAction(memberId, graphIntent(owner))) {
      setOutcome({ status: "not_recorded" });
      return;
    }
    setQueryUnconfirmed(false); setOutcome(null); publish(owner);
    const live = () => aliveRef.current && actionRef.current === owner;
    void dispatchGraphAction({ node, clientKey: owner.clientKey }).then((result) => {
      if (!live()) return;
      releaseAction(owner, null, result.status === "completed" ? { nodeId: node.id, status: "success", clientKey: owner.clientKey } : { status: "not_sent" });
    }).catch((error: unknown) => {
      if (!live()) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) { denyAction(owner, !!retry); return; }
      // A replay rejection describes this attempt, not the outcome of the earlier write.
      if (!retry && isDefiniteGraphActionRejection(error)) { releaseAction(owner, null, { status: "rejected" }); return; }
      publish({ ...owner, status: "unconfirmed" });
    });
  };
  const checkGraphAction = () => {
    const current = actionRef.current;
    if (!current || current.status !== "unconfirmed" || recordBlocked) return;
    const owner: GraphActionOwner = { ...current, status: "checking" };
    const controller = new AbortController();
    queryControllerRef.current = controller;
    setQueryUnconfirmed(false); setOutcome(null); publish(owner);
    const live = () => aliveRef.current && actionRef.current === owner && !controller.signal.aborted;
    void queryGraphAction(graphIntent(owner), fetch, controller.signal).then((result) => {
      if (!live()) return;
      if (result.status === "completed") {
        releaseAction(owner, null, { nodeId: owner.node.id, status: "success", clientKey: owner.clientKey });
      } else { publish({ ...owner, status: "unconfirmed" }); setQueryUnconfirmed(true); }
    }).catch((error: unknown) => {
      if (!live()) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        denyAction(owner, true); return;
      }
      // A 404 may mean a hidden/deleted target or an earlier write still in flight.
      // It is not proof that it is safe to forget this ID or submit a new operation.
      publish({ ...owner, status: "unconfirmed" }); setQueryUnconfirmed(true);
    }).finally(() => { if (queryControllerRef.current === controller) queryControllerRef.current = null; });
  };
  const actionRecovery = <>
    {action && action.status !== "running" && <div data-graph-action-unconfirmed role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm" aria-busy={action.status === "checking"}>
      <p>{frontendText(locale, "GRAPH_ACTION_UNCONFIRMED").replace("{label}", action.node.label)}</p>
      <p>{frontendText(locale, "GRAPH_ACTION_OPERATION_ID")} <code data-graph-operation-id className="break-all">{action.clientKey}</code></p>
      <Button variant="outline" disabled={action.status === "checking"} onClick={checkGraphAction}>{frontendText(locale, "GRAPH_ACTION_CHECK_RESULT")}</Button>
      <Button variant="outline" disabled={action.status === "checking"} onClick={() => runGraphAction(action)}>{frontendText(locale, "GRAPH_ACTION_RETRY")}</Button>
      {queryUnconfirmed && <p role="status">{frontendText(locale, "GRAPH_ACTION_QUERY_UNCONFIRMED")}</p>}
    </div>}
    {outcome?.status === "success" && <p role="status">{frontendText(locale, "GRAPH_ACTION_CONFIRMED").replace("{id}", outcome.clientKey)}</p>}
  </>;
  const inspectorStatus: GraphInspectorActionStatus = !selectedNode ? "idle"
    : action?.node.id === selectedNode.id ? (action.status !== "unconfirmed" ? "running" : "error")
      : action ? "running"
        : outcome?.status === "success" && outcome.nodeId === selectedNode.id ? "success" : "idle";
  if (state.kind === "loading") return <>{actionRecovery}<section data-graph-page-loading><p className="mb-3 text-sm text-muted-foreground">{frontendText(locale, "GRAPH_LOADING")}</p><PageState kind="loading" title={frontendText(locale, "GRAPH_LOADING")} /></section></>;
  if (state.kind === "error") return <>{actionRecovery}<PageState kind="error" title={frontendText(locale, "GRAPH_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GRAPH_RETRY")}</Button></PageState></>;
  if (state.kind === "forbidden") return <PageState kind="forbidden" title={frontendText(locale, "GRAPH_FORBIDDEN")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GRAPH_RETRY")}</Button></PageState>;
  if (state.kind === "empty") return <>{actionRecovery}<PageState kind="empty" title={frontendText(locale, "GRAPH_EMPTY")} description={frontendText(locale, "GRAPH_EMPTY_DESCRIPTION")} /></>;

  if (!filteredSnapshot) return null;
  return (
    <section className="space-y-5" data-graph-page>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{frontendText(locale, "GRAPH_TITLE")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "GRAPH_DESCRIPTION")}</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{frontendText(locale, "GRAPH_NODE_COUNT").replace("{count}", String(filteredSnapshot.nodes.length))}</span>
      </div>
      <Card>
        <CardHeader><CardTitle>{frontendText(locale, "GRAPH_LENS_TITLE")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem]">
          <Input data-graph-query aria-label={frontendText(locale, "GRAPH_QUERY_LABEL")} placeholder={frontendText(locale, "GRAPH_QUERY_PLACEHOLDER")} value={query} onChange={(event) => onQueryChange?.(event.currentTarget.value)} />
          <select data-graph-lens aria-label={frontendText(locale, "GRAPH_LENS_LABEL")} value={lens} onChange={(event) => onLensChange?.(event.currentTarget.value as GraphLens)} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="workspace">{frontendText(locale, "GRAPH_LENS_WORKSPACE")}</option>
            <option value="knowledge">{frontendText(locale, "GRAPH_LENS_KNOWLEDGE")}</option>
            <option value="work">{frontendText(locale, "GRAPH_LENS_WORK")}</option>
          </select>
          <select data-graph-time-range aria-label={frontendText(locale, "GRAPH_TIME_RANGE_LABEL")} value={temporalRange} onChange={(event) => onTemporalRangeChange?.(event.currentTarget.value as GraphTemporalRange)} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="all">{frontendText(locale, "GRAPH_TIME_RANGE_ALL")}</option>
            <option value="7d">{frontendText(locale, "GRAPH_TIME_RANGE_7D")}</option>
            <option value="30d">{frontendText(locale, "GRAPH_TIME_RANGE_30D")}</option>
            <option value="90d">{frontendText(locale, "GRAPH_TIME_RANGE_90D")}</option>
          </select>
          <select data-graph-change-kind aria-label={frontendText(locale, "GRAPH_CHANGE_KIND_LABEL")} value={changeKind} onChange={(event) => onChangeKindChange?.(event.currentTarget.value as NonNullable<GraphPageProps["changeKind"]>)} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="all">{frontendText(locale, "GRAPH_CHANGE_KIND_ALL")}</option>
            <option value="added">{frontendText(locale, "GRAPH_CHANGE_KIND_ADDED")}</option>
            <option value="updated">{frontendText(locale, "GRAPH_CHANGE_KIND_UPDATED")}</option>
            <option value="completed">{frontendText(locale, "GRAPH_CHANGE_KIND_COMPLETED")}</option>
            <option value="archived">{frontendText(locale, "GRAPH_CHANGE_KIND_ARCHIVED")}</option>
          </select>
        </CardContent>
      </Card>
      {viewBlocked && <div data-graph-view-blocked role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm"><p>{frontendText(locale, "GRAPH_VIEW_RECORD_BLOCKED")}</p><Button variant="outline" onClick={onDiscardView}>{frontendText(locale, "GRAPH_VIEW_RECORD_DISCARD")}</Button></div>}
      {viewNotice && <p role="alert" className="text-sm text-destructive">{viewNotice}</p>}
      {recordBlocked && <div data-graph-action-record-blocked role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
        <p>{frontendText(locale, "GRAPH_ACTION_RECORD_BLOCKED")}</p>
        <Button variant="outline" onClick={() => { if (memberId && discardBlockedGraphAction(memberId)) setRecordBlocked(false); }}>{frontendText(locale, "GRAPH_ACTION_RECORD_DISCARD")}</Button>
      </div>}
      {actionRecovery}
      {outcome && outcome.status !== "success" && <p role="status" className="text-sm text-destructive">{frontendText(locale, outcome.status === "rejected" ? "GRAPH_ACTION_REJECTED" : outcome.status === "not_recorded" ? "GRAPH_ACTION_NOT_RECORDED" : "GRAPH_ACTION_NOT_SENT")}</p>}
      <GraphSuggestionsPanel locale={locale} state={suggestionsState} onGenerate={onGenerateSuggestions} />
      {state.kind === "truncated" && <div data-graph-truncated role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">{frontendText(locale, "GRAPH_TRUNCATED")}</div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GraphCanvas snapshot={filteredSnapshot} selectedId={selectedId} onSelect={setSelectedId} onClearSelection={() => setSelectedId(null)} layout="concentric" fallbackLabel={frontendText(locale, "GRAPH_CANVAS_LABEL")} />
        <div className="grid gap-5 self-start">
          <GraphInspector
            locale={locale}
            node={selectedNode}
            onClose={() => setSelectedId(null)}
            onAction={selectedNode && (!action || action.node.id === selectedNode.id) ? () => runGraphAction(action ?? undefined) : undefined}
            actionsDisabled={recordBlocked}
            actionStatus={inspectorStatus}
          />
          <GraphEvidencePanel locale={locale} citationIds={selectedNode ? selectedCitationIds : undefined} onDenied={onDenied} />
        </div>
      </div>
    </section>
  );
}

export function GraphRoute({ locale, memberId, load = defaultGraphLoader }: { locale: LocaleRuntime; memberId?: string; load?: GraphLoader }) {
  const [storedView] = useState(() => memberId ? loadGraphView(memberId) : { kind: "empty" as const });
  const restored = storedView.kind === "ready" ? storedView.view : null;
  const [viewBlocked, setViewBlocked] = useState(storedView.kind === "blocked");
  const [viewNotice, setViewNotice] = useState<string>();
  const [state, setState] = useState<GraphPageState>({ kind: "loading" });
  const [query, setQuery] = useState(restored?.query ?? "");
  const [lens, setLens] = useState<GraphLens>(restored?.lens ?? "workspace");
  const [temporalRange, setTemporalRange] = useState<GraphTemporalRange>(restored?.temporalRange ?? "all");
  const [changeKind, setChangeKind] = useState<NonNullable<GraphPageProps["changeKind"]>>(restored?.changeKind ?? "all");
  const [suggestionsState, setSuggestionsState] = useState<GraphSuggestionsState>({ kind: "idle" });
  const [retry, setRetry] = useState(0);
  const readGeneration = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const suggestionController = useRef<AbortController | null>(null);
  const cancelSuggestions = useCallback(() => {
    suggestionController.current?.abort();
    suggestionController.current = null;
  }, []);
  const denyRead = useCallback(() => {
    readGeneration.current++;
    readController.current?.abort();
    cancelSuggestions();
    setSuggestionsState({ kind: "idle" });
    setState({ kind: "forbidden" });
  }, [cancelSuggestions]);
  useEffect(() => {
    const controller = new AbortController();
    readController.current = controller;
    const generation = ++readGeneration.current;
    const live = () => generation === readGeneration.current && !controller.signal.aborted;
    cancelSuggestions();
    setSuggestionsState({ kind: "idle" });
    setState({ kind: "loading" });
    const input: GraphQueryInput = { scope: "workspace" };
    if (lens === "knowledge") input.scope = "knowledge";
    if (lens === "work") input.types = [...WORK_LENS_KINDS] as GraphQueryInput["types"];
    if (temporalRange !== "all") {
      const days = temporalRange === "7d" ? 7 : temporalRange === "30d" ? 30 : 90;
      input.from = new Date(Date.now() - days * 86_400_000).toISOString();
      input.to = new Date().toISOString();
    }
    if (changeKind !== "all") input.changeKind = changeKind;
    void load(input, controller.signal).then((snapshot) => {
      if (!live()) return;
      setState(snapshot.nodes.length === 0 ? { kind: "empty" } : snapshot.truncated ? { kind: "truncated", snapshot } : { kind: "ready", snapshot });
    }).catch((error: unknown) => {
      if (!live()) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) denyRead();
      else setState({ kind: "error" });
    });
    return () => {
      controller.abort();
      cancelSuggestions();
      if (readController.current === controller) readController.current = null;
    };
  }, [cancelSuggestions, changeKind, denyRead, lens, load, retry, temporalRange]);
  useEffect(() => {
    if (!memberId || viewBlocked) return;
    const saved = persistGraphView(memberId, { query, lens, temporalRange, changeKind });
    setViewNotice(saved ? undefined : frontendText(locale, "GRAPH_VIEW_NOT_RECORDED"));
  }, [query, lens, temporalRange, changeKind, memberId, viewBlocked, locale]);
  const discardView = () => { if (!memberId || !viewBlocked || !discardBlockedGraphView(memberId)) return; setViewBlocked(false); setViewNotice(undefined); };
  const generateSuggestions = () => {
    if ((state.kind !== "ready" && state.kind !== "truncated") || !readController.current
      || readController.current.signal.aborted || suggestionController.current) return;
    const controller = new AbortController();
    const generation = readGeneration.current;
    // Reserve synchronously; disabled button state alone cannot stop same-event clicks.
    suggestionController.current = controller;
    const live = () => suggestionController.current === controller
      && generation === readGeneration.current && !controller.signal.aborted;
    setSuggestionsState({ kind: "loading" });
    void loadGraphSuggestions(fetch, controller.signal).then((result) => {
      if (live()) setSuggestionsState({ kind: "idle", result });
    }).catch((error: unknown) => {
      if (!live()) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) denyRead();
      else setSuggestionsState({ kind: "error" });
    }).finally(() => {
      if (suggestionController.current === controller) suggestionController.current = null;
    });
  };
  return <GraphPage memberId={memberId} locale={locale} state={state} onDenied={denyRead} query={query} lens={lens} temporalRange={temporalRange} changeKind={changeKind} suggestionsState={suggestionsState} onGenerateSuggestions={generateSuggestions} onQueryChange={setQuery} onLensChange={setLens} onTemporalRangeChange={setTemporalRange} onChangeKindChange={setChangeKind} onRetry={() => { setState({ kind: "loading" }); setRetry((value) => value + 1); }} viewBlocked={viewBlocked} viewNotice={viewNotice} onDiscardView={discardView} />;
}

function GraphSuggestionsPanel({ locale, state, onGenerate }: { locale: LocaleRuntime; state: GraphSuggestionsState; onGenerate?: () => void }) {
  const suggestions = state.result?.suggestions ?? [];
  return <Card data-graph-suggestions>
    <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>{frontendText(locale, "GRAPH_SUGGESTIONS_TITLE")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "GRAPH_SUGGESTIONS_DESCRIPTION")}</p></div><Button variant="outline" onClick={onGenerate} disabled={state.kind === "loading"}>{frontendText(locale, state.kind === "loading" ? "GRAPH_SUGGESTIONS_LOADING" : "GRAPH_SUGGESTIONS_GENERATE")}</Button></CardHeader>
    <CardContent>
      {state.kind === "error" && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "GRAPH_SUGGESTIONS_ERROR")}</p>}
      {state.kind !== "error" && suggestions.length === 0 && <p className="text-sm text-muted-foreground">{frontendText(locale, state.result?.messageKey === "GRAPH_SUGGESTIONS_EVIDENCE_INSUFFICIENT" ? "GRAPH_SUGGESTIONS_EVIDENCE_GAP" : "GRAPH_SUGGESTIONS_EMPTY")}</p>}
      {suggestions.length > 0 && <div className="grid gap-3 md:grid-cols-2">{suggestions.map((suggestion) => <GraphSuggestionCard key={suggestion.id} locale={locale} suggestion={suggestion} />)}</div>}
    </CardContent>
  </Card>;
}

function GraphSuggestionCard({ locale, suggestion }: { locale: LocaleRuntime; suggestion: GraphSuggestion }) {
  const kindKey = suggestion.kind === "meeting_to_decision" ? "GRAPH_SUGGESTION_MEETING_DECISION" : suggestion.kind === "decision_to_action_item" ? "GRAPH_SUGGESTION_DECISION_ACTION" : "GRAPH_SUGGESTION_TASK_KNOWLEDGE";
  return <article className="rounded-lg border bg-muted/20 p-4" data-graph-suggestion={suggestion.id}>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{frontendText(locale, kindKey)}</span><span className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">{frontendText(locale, "GRAPH_SUGGESTIONS_PROMOTION_REQUIRED")}</span></div>
    <h3 className="mt-2 font-medium">{suggestion.title}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{suggestion.rationale}</p>
    <div className="mt-3 flex flex-wrap gap-2 text-xs">{suggestion.evidenceGap && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">{frontendText(locale, "GRAPH_SUGGESTIONS_EVIDENCE_GAP")}</span>}<span className="rounded-full border px-2 py-1 text-muted-foreground">{suggestion.citationIds.length} {frontendText(locale, suggestion.citationIds.length === 1 ? "GRAPH_SUGGESTIONS_CITATION_ONE" : "GRAPH_SUGGESTIONS_CITATION_MANY")}</span></div>
  </article>;
}

function defaultGraphLoader(query: GraphQueryInput, signal: AbortSignal): Promise<GraphSnapshot> {
  return loadGraph(query, fetch, signal);
}

function filterSnapshot(snapshot: GraphSnapshot, query: string, lens: GraphLens): GraphSnapshot {
  const normalized = query.trim().toLowerCase();
  const nodes = snapshot.nodes.filter((node) => {
    const inLens = lens === "workspace" || lens === "knowledge" && node.kind === "knowledge" || lens === "work" && WORK_LENS_KINDS.has(node.kind);
    return inLens && (!normalized || node.label.toLowerCase().includes(normalized) || node.id.toLowerCase().includes(normalized));
  });
  const ids = new Set(nodes.map((node) => node.id));
  return { ...snapshot, nodes, edges: snapshot.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
}

// Used only for the first attempt: a replay rejection cannot settle an earlier write.
// Most 404/409 responses may hide an existing result. These precise capacity/busy
// codes are exceptions: the first attempt is rejected before inserting any row.
function isDefiniteGraphActionRejection(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  if (error.status === 409 && (error.code === "FOCUS_ALREADY_OPEN" || error.code === "TASK_LIMIT_REACHED")) return true;
  return error.status >= 400 && error.status < 500 && error.status !== 404 && error.status !== 408 && error.status !== 409 && error.status !== 429;
}
