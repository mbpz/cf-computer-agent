import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas } from "../components/graph/graph-canvas";
import { GraphEvidencePanel } from "../components/graph/graph-evidence-panel";
import { GraphInspector } from "../components/graph/graph-inspector";
import { ChartLine } from "@phosphor-icons/react";
import { AppliedFilters, type AppliedFilter } from "../components/ui/applied-filters";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { FilterSelect } from "../components/ui/filter-select";
import { FilterDisclosure } from "../components/ui/filter-disclosure";
import { Input } from "../components/ui/input";
import { PageHeader } from "../components/ui/page-header";
import { PageState } from "../components/ui/page-state";
import { SharedLayoutBg } from "../components/motion/shared-layout-bg";
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
  /** The node this projection is drilled into; null shows the whole scope. */
  rootId?: string | null;
  onQueryChange?: (query: string) => void;
  onLensChange?: (lens: GraphLens) => void;
  onTemporalRangeChange?: (range: GraphTemporalRange) => void;
  onChangeKindChange?: (changeKind: NonNullable<GraphPageProps["changeKind"]>) => void;
  onRootIdChange?: (rootId: string | null) => void;
  /** Continues a truncated projection with the cursor the server returned. */
  onLoadMore?: () => void;
  morePending?: boolean;
  moreError?: boolean;
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

export function GraphPage({ locale, state, memberId, query = "", lens = "workspace", temporalRange = "all", changeKind = "all", rootId = null, suggestionsState = { kind: "idle" }, onQueryChange, onLensChange, onTemporalRangeChange, onChangeKindChange, onRootIdChange, onLoadMore, morePending = false, moreError = false, onGenerateSuggestions, onRetry, onDenied, viewBlocked = false, viewNotice, onDiscardView }: GraphPageProps & { memberId?: string }) {
  const [stored] = useState(() => memberId ? loadGraphAction(memberId) : { kind: "empty" as const });
  const restored: GraphActionOwner | null = stored.kind === "ready"
    ? { node: stored.intent.node, clientKey: stored.intent.clientKey, status: "unconfirmed" } : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The running or unconfirmed action belongs to the page, not to the current selection:
  // changing node or lens must not drop its client key, and leaving waits for its result.
  // With a member, an unconfirmed action survives refresh in this tab.
  const [action, setAction] = useState<GraphActionOwner | null>(restored);
  // A stored intent is not current authorization. Keep its identity without
  // revealing private fields until this mount has completed an authorized read.
  const [recoveryAuthorized, setRecoveryAuthorized] = useState(false);
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
      setRecoveryAuthorized(false);
      // The graph read can revoke access independently of the recovery request.
      // Invalidate in-flight callbacks and release UI/leave guards, not storage.
      queryControllerRef.current?.abort();
      publish(null); setOutcome(null); setSelectedId(null);
      return;
    }
    // A successful explicit graph reload can restore recovery in this same mount.
    // After denial, loading/error/forbidden must not reveal or replay the intent.
    if (!["ready", "truncated", "empty"].includes(state.kind)) return;
    setRecoveryAuthorized(true);
    if (!memberId || actionRef.current) return;
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
  const actionRecovery = recoveryAuthorized ? <>
    {action && action.status !== "running" && <div data-graph-action-unconfirmed role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm" aria-busy={action.status === "checking"}>
      <p>{frontendText(locale, "GRAPH_ACTION_UNCONFIRMED").replace("{label}", action.node.label)}</p>
      <p>{frontendText(locale, "GRAPH_ACTION_OPERATION_ID")} <code data-graph-operation-id className="break-all">{action.clientKey}</code></p>
      <Button variant="outline" disabled={action.status === "checking"} onClick={checkGraphAction}>{frontendText(locale, "GRAPH_ACTION_CHECK_RESULT")}</Button>
      <Button variant="outline" disabled={action.status === "checking"} onClick={() => runGraphAction(action)}>{frontendText(locale, "GRAPH_ACTION_RETRY")}</Button>
      {queryUnconfirmed && <p role="status">{frontendText(locale, "GRAPH_ACTION_QUERY_UNCONFIRMED")}</p>}
    </div>}
    {outcome?.status === "success" && <p role="status">{frontendText(locale, "GRAPH_ACTION_CONFIRMED").replace("{id}", outcome.clientKey)}</p>}
  </> : null;
  const inspectorStatus: GraphInspectorActionStatus = !selectedNode ? "idle"
    : action?.node.id === selectedNode.id ? (action.status !== "unconfirmed" ? "running" : "error")
      : action ? "running"
        : outcome?.status === "success" && outcome.nodeId === selectedNode.id ? "success" : "idle";
  const lensOptions = [
    { value: "workspace", label: frontendText(locale, "GRAPH_LENS_WORKSPACE") },
    { value: "knowledge", label: frontendText(locale, "GRAPH_LENS_KNOWLEDGE") },
    { value: "work", label: frontendText(locale, "GRAPH_LENS_WORK") },
  ];
  const temporalRangeOptions = [
    { value: "all", label: frontendText(locale, "GRAPH_TIME_RANGE_ALL") },
    { value: "7d", label: frontendText(locale, "GRAPH_TIME_RANGE_7D") },
    { value: "30d", label: frontendText(locale, "GRAPH_TIME_RANGE_30D") },
    { value: "90d", label: frontendText(locale, "GRAPH_TIME_RANGE_90D") },
  ];
  const changeKindOptions = [
    { value: "all", label: frontendText(locale, "GRAPH_CHANGE_KIND_ALL") },
    { value: "added", label: frontendText(locale, "GRAPH_CHANGE_KIND_ADDED") },
    { value: "updated", label: frontendText(locale, "GRAPH_CHANGE_KIND_UPDATED") },
    { value: "completed", label: frontendText(locale, "GRAPH_CHANGE_KIND_COMPLETED") },
    { value: "archived", label: frontendText(locale, "GRAPH_CHANGE_KIND_ARCHIVED") },
  ];
  const clearFilters = () => { onQueryChange?.(""); onLensChange?.("workspace"); onTemporalRangeChange?.("all"); onChangeKindChange?.("all"); onRootIdChange?.(null); };
  // Every applied condition stays visible as removable text; the same handler the control uses applies it.
  const appliedFilters: AppliedFilter[] = [];
  if (query) appliedFilters.push({ id: "query", label: `${frontendText(locale, "GRAPH_QUERY_LABEL")}: ${query}`, onRemove: () => onQueryChange?.("") });
  if (lens !== "workspace") appliedFilters.push({ id: "lens", label: `${frontendText(locale, "GRAPH_LENS_LABEL")}: ${lensOptions.find((option) => option.value === lens)?.label ?? lens}`, onRemove: () => onLensChange?.("workspace") });
  if (temporalRange !== "all") appliedFilters.push({ id: "temporal-range", label: `${frontendText(locale, "GRAPH_TIME_RANGE_LABEL")}: ${temporalRangeOptions.find((option) => option.value === temporalRange)?.label ?? temporalRange}`, onRemove: () => onTemporalRangeChange?.("all") });
  if (changeKind !== "all") appliedFilters.push({ id: "change-kind", label: `${frontendText(locale, "GRAPH_CHANGE_KIND_LABEL")}: ${changeKindOptions.find((option) => option.value === changeKind)?.label ?? changeKind}`, onRemove: () => onChangeKindChange?.("all") });
  if (rootId) appliedFilters.push({ id: "root", label: `${frontendText(locale, "GRAPH_DRILL_DOWN_LABEL")}: ${filteredSnapshot?.nodes.find((node) => node.id === rootId)?.label ?? rootId}`, onRemove: () => onRootIdChange?.(null) });
  // The page shell (header + query row) renders for every state; only the content slot
  // branches, so a first load or a read failure never unmounts the toolbar (design §4.3).
  return (
    <section className="space-y-5" data-graph-page>
      <PageHeader
        icon={<ChartLine size={22} weight="duotone" className="text-primary" />}
        title={frontendText(locale, "GRAPH_TITLE")}
        description={frontendText(locale, "GRAPH_DESCRIPTION")}
        actions={filteredSnapshot && <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{frontendText(locale, "GRAPH_NODE_COUNT").replace("{count}", String(filteredSnapshot.nodes.length))}</span>}
      />
      <Card>
        <CardHeader><CardTitle>{frontendText(locale, "GRAPH_LENS_TITLE")}</CardTitle></CardHeader>
        <CardContent>
          <FilterDisclosure label={frontendText(locale, "COMMON_FILTERS")} appliedCount={appliedFilters.length} rowClassName="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem]">
            <Input data-graph-query aria-label={frontendText(locale, "GRAPH_QUERY_LABEL")} placeholder={frontendText(locale, "GRAPH_QUERY_PLACEHOLDER")} value={query} onChange={(event) => onQueryChange?.(event.currentTarget.value)} />
            <FilterSelect label={frontendText(locale, "GRAPH_LENS_LABEL")} ariaLabel={frontendText(locale, "GRAPH_LENS_LABEL")} value={lens} onChange={(value) => onLensChange?.(value as GraphLens)} options={lensOptions} />
            <FilterSelect label={frontendText(locale, "GRAPH_TIME_RANGE_LABEL")} ariaLabel={frontendText(locale, "GRAPH_TIME_RANGE_LABEL")} value={temporalRange} onChange={(value) => onTemporalRangeChange?.(value as GraphTemporalRange)} options={temporalRangeOptions} />
            <FilterSelect label={frontendText(locale, "GRAPH_CHANGE_KIND_LABEL")} ariaLabel={frontendText(locale, "GRAPH_CHANGE_KIND_LABEL")} value={changeKind} onChange={(value) => onChangeKindChange?.(value as NonNullable<GraphPageProps["changeKind"]>)} options={changeKindOptions} />
          </FilterDisclosure>
        </CardContent>
      </Card>
      {/* Applied conditions describe the result window; a revoked read has none to describe,
          so the persisted filter text is never surfaced as an applied chip. */}
      {state.kind !== "forbidden" && <AppliedFilters ariaLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")} clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")} filters={appliedFilters} onClear={clearFilters} />}
      {viewBlocked && <div data-graph-view-blocked role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm"><p>{frontendText(locale, "GRAPH_VIEW_RECORD_BLOCKED")}</p><Button variant="outline" onClick={onDiscardView}>{frontendText(locale, "GRAPH_VIEW_RECORD_DISCARD")}</Button></div>}
      {viewNotice && <p role="alert" className="text-sm text-destructive">{viewNotice}</p>}
      {recordBlocked && <div data-graph-action-record-blocked role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
        <p>{frontendText(locale, "GRAPH_ACTION_RECORD_BLOCKED")}</p>
        <Button variant="outline" onClick={() => { if (memberId && discardBlockedGraphAction(memberId)) setRecordBlocked(false); }}>{frontendText(locale, "GRAPH_ACTION_RECORD_DISCARD")}</Button>
      </div>}
      {state.kind !== "forbidden" && actionRecovery}
      {state.kind !== "forbidden" && outcome && outcome.status !== "success" && <p role="status" className="text-sm text-destructive">{frontendText(locale, outcome.status === "rejected" ? "GRAPH_ACTION_REJECTED" : outcome.status === "not_recorded" ? "GRAPH_ACTION_NOT_RECORDED" : "GRAPH_ACTION_NOT_SENT")}</p>}
      {state.kind === "loading" && <section data-graph-page-loading><p className="mb-3 text-sm text-muted-foreground">{frontendText(locale, "GRAPH_LOADING")}</p><PageState kind="loading" title={frontendText(locale, "GRAPH_LOADING")} /></section>}
      {state.kind === "error" && <PageState kind="error" title={frontendText(locale, "GRAPH_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GRAPH_RETRY")}</Button></PageState>}
      {state.kind === "forbidden" && <PageState kind="forbidden" title={frontendText(locale, "GRAPH_FORBIDDEN")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GRAPH_RETRY")}</Button></PageState>}
      {state.kind === "empty" && <PageState kind="empty" title={frontendText(locale, "GRAPH_EMPTY")} description={frontendText(locale, "GRAPH_EMPTY_DESCRIPTION")}>
        <Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GRAPH_RETRY")}</Button>
      </PageState>}
      {filteredSnapshot && state.kind !== "empty" && <>
        <GraphSuggestionsPanel locale={locale} state={suggestionsState} onGenerate={onGenerateSuggestions} />
        {snapshot && snapshot.truncated && <div data-graph-truncated role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span>{frontendText(locale, "GRAPH_TRUNCATED")}</span>
          {/* The continuation is honest about its bounds: the cursor continues this exact
              window, and a window with no cursor left is the end of what can be shown. */}
          {snapshot.nextCursor
            ? onLoadMore && <Button type="button" variant="outline" size="sm" data-graph-more disabled={morePending} onClick={onLoadMore}>{frontendText(locale, "GRAPH_MORE")}</Button>
            : <span data-graph-more-end>{frontendText(locale, "GRAPH_MORE_END")}</span>}
        </div>}
        {moreError && <div role="alert" data-graph-more-error className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          <span>{frontendText(locale, "COMMON_UNABLE_TO_LOAD")}</span>
          {onLoadMore && <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>{frontendText(locale, "COMMON_RETRY")}</Button>}
        </div>}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <GraphCanvas snapshot={filteredSnapshot} selectedId={selectedId} onSelect={setSelectedId} onClearSelection={() => setSelectedId(null)} layout="concentric" fallbackLabel={frontendText(locale, "GRAPH_CANVAS_LABEL")} />
          <div className="grid gap-5 self-start">
            {/* The drill-down entry point is explicit and reversible: it names the node it
                focuses, and an active drill-down is also a removable applied filter. */}
            <div data-graph-drill-down className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              {rootId
                ? <><span className="min-w-0 flex-1 truncate">{frontendText(locale, "GRAPH_DRILL_DOWN_ACTIVE")}: {filteredSnapshot.nodes.find((node) => node.id === rootId)?.label ?? rootId}</span><Button type="button" variant="outline" size="sm" data-graph-drill-down-exit onClick={() => onRootIdChange?.(null)}>{frontendText(locale, "GRAPH_DRILL_DOWN_EXIT")}</Button></>
                : selectedNode
                  ? <><span className="min-w-0 flex-1 truncate">{selectedNode.label}</span><Button type="button" variant="outline" size="sm" data-graph-drill-down-enter onClick={() => onRootIdChange?.(selectedNode.id)}>{frontendText(locale, "GRAPH_DRILL_DOWN_ENTER")}</Button></>
                  : <span className="text-muted-foreground">{frontendText(locale, "GRAPH_DRILL_DOWN_HINT")}</span>}
            </div>
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
      </>}
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
  const [rootId, setRootId] = useState<string | null>(restored?.rootId ?? null);
  const [morePending, setMorePending] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const moreController = useRef<AbortController | null>(null);
  const morePendingRef = useRef(false);
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
    moreController.current?.abort(); moreController.current = null; morePendingRef.current = false;
    cancelSuggestions();
    setSuggestionsState({ kind: "idle" });
    setMorePending(false); setMoreError(false);
    setState({ kind: "forbidden" });
  }, [cancelSuggestions]);
  useEffect(() => {
    const controller = new AbortController();
    readController.current = controller;
    const generation = ++readGeneration.current;
    const live = () => generation === readGeneration.current && !controller.signal.aborted;
    cancelSuggestions();
    setSuggestionsState({ kind: "idle" });
    // A new projection replaces the window: an earlier window's cursor no longer applies.
    moreController.current?.abort(); moreController.current = null; morePendingRef.current = false;
    setMorePending(false); setMoreError(false);
    setState({ kind: "loading" });
    void load(graphQueryInput({ lens, temporalRange, changeKind, rootId }), controller.signal).then((snapshot) => {
      if (!live()) return;
      setState(graphPageStateFor(snapshot));
    }).catch((error: unknown) => {
      if (!live()) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) denyRead();
      else setState({ kind: "error" });
    });
    return () => {
      controller.abort();
      moreController.current?.abort(); moreController.current = null; morePendingRef.current = false;
      cancelSuggestions();
      if (readController.current === controller) readController.current = null;
    };
  }, [cancelSuggestions, changeKind, denyRead, lens, load, retry, rootId, temporalRange]);
  useEffect(() => {
    if (!memberId || viewBlocked) return;
    const saved = persistGraphView(memberId, { query, lens, temporalRange, changeKind, rootId });
    setViewNotice(saved ? undefined : frontendText(locale, "GRAPH_VIEW_NOT_RECORDED"));
  }, [query, lens, temporalRange, changeKind, rootId, memberId, viewBlocked, locale]);
  const discardView = () => { if (!memberId || !viewBlocked || !discardBlockedGraphView(memberId)) return; setViewBlocked(false); setViewNotice(undefined); };
  // A truncated projection continues with the cursor the server bound to this exact
  // query; appending keeps every node already read, even when the append fails.
  const loadMore = () => {
    const current = state.kind === "ready" || state.kind === "truncated" ? state.snapshot : null;
    if (!current?.nextCursor || morePendingRef.current || !readController.current || readController.current.signal.aborted) return;
    const cursor = current.nextCursor;
    const generation = readGeneration.current;
    const controller = new AbortController();
    moreController.current = controller; morePendingRef.current = true;
    setMorePending(true); setMoreError(false);
    const live = () => moreController.current === controller && generation === readGeneration.current && !controller.signal.aborted;
    void load({ ...graphQueryInput({ lens, temporalRange, changeKind, rootId }), cursor }, controller.signal).then((page) => {
      if (!live()) return;
      setState(graphPageStateFor(mergeGraphPages(current, page)));
    }).catch((error: unknown) => {
      if (!live()) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) denyRead();
      else setMoreError(true);
    }).finally(() => {
      if (moreController.current === controller) { moreController.current = null; morePendingRef.current = false; setMorePending(false); }
    });
  };
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
  return <GraphPage memberId={memberId} locale={locale} state={state} onDenied={denyRead} query={query} lens={lens} temporalRange={temporalRange} changeKind={changeKind} rootId={rootId} onRootIdChange={setRootId} onLoadMore={loadMore} morePending={morePending} moreError={moreError} suggestionsState={suggestionsState} onGenerateSuggestions={generateSuggestions} onQueryChange={setQuery} onLensChange={setLens} onTemporalRangeChange={setTemporalRange} onChangeKindChange={setChangeKind} onRetry={() => { setState({ kind: "loading" }); setRetry((value) => value + 1); }} viewBlocked={viewBlocked} viewNotice={viewNotice} onDiscardView={discardView} />;
}

function GraphSuggestionsPanel({ locale, state, onGenerate }: { locale: LocaleRuntime; state: GraphSuggestionsState; onGenerate?: () => void }) {
  const suggestions = state.result?.suggestions ?? [];
  return <Card data-graph-suggestions>
    <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>{frontendText(locale, "GRAPH_SUGGESTIONS_TITLE")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "GRAPH_SUGGESTIONS_DESCRIPTION")}</p></div><Button variant="outline" onClick={onGenerate} disabled={state.kind === "loading"}>{frontendText(locale, state.kind === "loading" ? "GRAPH_SUGGESTIONS_LOADING" : "GRAPH_SUGGESTIONS_GENERATE")}</Button></CardHeader>
    <CardContent>
      {state.kind === "error" && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "GRAPH_SUGGESTIONS_ERROR")}</p>}
      {state.kind !== "error" && suggestions.length === 0 && <p className="text-sm text-muted-foreground">{frontendText(locale, state.result?.messageKey === "GRAPH_SUGGESTIONS_EVIDENCE_INSUFFICIENT" ? "GRAPH_SUGGESTIONS_EVIDENCE_GAP" : "GRAPH_SUGGESTIONS_EMPTY")}</p>}
      {suggestions.length > 0 && <SharedLayoutBg className="grid gap-3 md:grid-cols-2" inset={6} pillClassName="rounded-lg bg-muted/60">{suggestions.map((suggestion) => <GraphSuggestionCard key={suggestion.id} locale={locale} suggestion={suggestion} />)}</SharedLayoutBg>}
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

/** The bounded query the toolbar states, shared by the first read and its continuation. */
function graphQueryInput({ lens, temporalRange, changeKind, rootId }: { lens: GraphLens; temporalRange: GraphTemporalRange; changeKind: NonNullable<GraphPageProps["changeKind"]>; rootId: string | null }): GraphQueryInput {
  const input: GraphQueryInput = { scope: "workspace" };
  if (lens === "knowledge") input.scope = "knowledge";
  if (lens === "work") input.types = [...WORK_LENS_KINDS] as GraphQueryInput["types"];
  if (temporalRange !== "all") {
    const days = temporalRange === "7d" ? 7 : temporalRange === "30d" ? 30 : 90;
    input.from = new Date(Date.now() - days * 86_400_000).toISOString();
    input.to = new Date().toISOString();
  }
  if (changeKind !== "all") input.changeKind = changeKind;
  if (rootId) input.rootId = rootId;
  return input;
}

function graphPageStateFor(snapshot: GraphSnapshot): GraphPageState {
  return snapshot.nodes.length === 0 ? { kind: "empty" } : snapshot.truncated ? { kind: "truncated", snapshot } : { kind: "ready", snapshot };
}

/**
 * A continuation appends to the window it continues: the nodes and edges already read
 * stay, a repeated id is kept once, and only the continuation state comes from the page.
 */
function mergeGraphPages(current: GraphSnapshot, page: GraphSnapshot): GraphSnapshot {
  return {
    nodes: mergeGraphRecords(current.nodes, page.nodes),
    edges: mergeGraphRecords(current.edges, page.edges),
    rootId: page.rootId,
    depth: page.depth,
    truncated: page.truncated,
    nextCursor: page.nextCursor,
  };
}

function mergeGraphRecords<T extends { id: string }>(current: readonly T[], added: readonly T[]): T[] {
  const seen = new Set(current.map((record) => record.id));
  return [...current, ...added.filter((record) => !seen.has(record.id))];
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
