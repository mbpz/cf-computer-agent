import { useEffect, useMemo, useState } from "react";
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
import { createGraphActionClientKey, dispatchGraphAction } from "../lib/graph-actions";
import type { GraphInspectorActionStatus } from "../components/graph/graph-inspector";

export type GraphPageState =
  | { kind: "loading" }
  | { kind: "error" }
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
}

export type GraphLoader = (query: GraphQueryInput, signal: AbortSignal) => Promise<GraphSnapshot>;

const WORK_LENS_KINDS = new Set(["task", "project", "goal", "meeting", "decision", "action_item", "inbox", "calendar", "focus"]);

export function GraphPage({ locale, state, query = "", lens = "workspace", temporalRange = "all", changeKind = "all", suggestionsState = { kind: "idle" }, onQueryChange, onLensChange, onTemporalRangeChange, onChangeKindChange, onGenerateSuggestions, onRetry }: GraphPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{ nodeId: string | null; clientKey: string | null; status: GraphInspectorActionStatus }>({ nodeId: null, clientKey: null, status: "idle" });
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
  useEffect(() => {
    setActionState((current) => current.nodeId === selectedNode?.id ? current : { nodeId: selectedNode?.id ?? null, clientKey: null, status: "idle" });
  }, [selectedNode?.id]);
  if (state.kind === "loading") return <section data-graph-page-loading><p className="mb-3 text-sm text-muted-foreground">{frontendText(locale, "GRAPH_LOADING")}</p><PageState kind="loading" title={frontendText(locale, "GRAPH_LOADING")} /></section>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "GRAPH_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GRAPH_RETRY")}</Button></PageState>;
  if (state.kind === "empty") return <PageState kind="empty" title={frontendText(locale, "GRAPH_EMPTY")} description={frontendText(locale, "GRAPH_EMPTY_DESCRIPTION")} />;

  if (!filteredSnapshot) return null;
  const runGraphAction = () => {
    if (!selectedNode) return;
    const clientKey = actionState.nodeId === selectedNode.id && actionState.clientKey
      ? actionState.clientKey
      : createGraphActionClientKey(selectedNode);
    setActionState({ nodeId: selectedNode.id, clientKey, status: "running" });
    void dispatchGraphAction({ node: selectedNode, clientKey }).then((result) => {
      setActionState((current) => ({ ...current, status: result.status === "completed" ? "success" : "error" }));
    }).catch(() => {
      setActionState((current) => ({ ...current, status: "error" }));
    });
  };
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
      <GraphSuggestionsPanel locale={locale} state={suggestionsState} onGenerate={onGenerateSuggestions} />
      {state.kind === "truncated" && <div data-graph-truncated role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">{frontendText(locale, "GRAPH_TRUNCATED")}</div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GraphCanvas snapshot={filteredSnapshot} selectedId={selectedId} onSelect={setSelectedId} onClearSelection={() => setSelectedId(null)} layout="concentric" fallbackLabel={frontendText(locale, "GRAPH_CANVAS_LABEL")} />
        <div className="grid gap-5 self-start">
          <GraphInspector
            locale={locale}
            node={selectedNode}
            onClose={() => setSelectedId(null)}
            onAction={selectedNode ? runGraphAction : undefined}
            actionStatus={selectedNode && actionState.nodeId === selectedNode.id ? actionState.status : "idle"}
          />
          <GraphEvidencePanel locale={locale} citationIds={selectedNode ? selectedCitationIds : undefined} />
        </div>
      </div>
    </section>
  );
}

export function GraphRoute({ locale, load = defaultGraphLoader }: { locale: LocaleRuntime; load?: GraphLoader }) {
  const [state, setState] = useState<GraphPageState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState<GraphLens>("workspace");
  const [temporalRange, setTemporalRange] = useState<GraphTemporalRange>("all");
  const [changeKind, setChangeKind] = useState<NonNullable<GraphPageProps["changeKind"]>>("all");
  const [suggestionsState, setSuggestionsState] = useState<GraphSuggestionsState>({ kind: "idle" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
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
      if (!active) return;
      setState(snapshot.nodes.length === 0 ? { kind: "empty" } : snapshot.truncated ? { kind: "truncated", snapshot } : { kind: "ready", snapshot });
    }).catch(() => {
      if (active && !controller.signal.aborted) setState({ kind: "error" });
    });
    return () => { active = false; controller.abort(); };
  }, [changeKind, lens, load, retry, temporalRange]);
  const generateSuggestions = () => {
    setSuggestionsState({ kind: "loading" });
    void loadGraphSuggestions(fetch).then((result) => setSuggestionsState({ kind: "idle", result })).catch(() => setSuggestionsState({ kind: "error" }));
  };
  return <GraphPage locale={locale} state={state} query={query} lens={lens} temporalRange={temporalRange} changeKind={changeKind} suggestionsState={suggestionsState} onGenerateSuggestions={generateSuggestions} onQueryChange={setQuery} onLensChange={setLens} onTemporalRangeChange={setTemporalRange} onChangeKindChange={setChangeKind} onRetry={() => { setState({ kind: "loading" }); setRetry((value) => value + 1); }} />;
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
