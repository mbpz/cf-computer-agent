import { useEffect, useState } from "react";
import { GraphCanvas } from "../components/graph/graph-canvas";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { loadGraph, type GraphQueryInput, type GraphSnapshot } from "../lib/graph-data";

export type GraphPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ready"; snapshot: GraphSnapshot }
  | { kind: "truncated"; snapshot: GraphSnapshot };

export type GraphLens = "workspace" | "knowledge" | "work";

export interface GraphPageProps {
  locale: LocaleRuntime;
  state: GraphPageState;
  query?: string;
  lens?: GraphLens;
  onQueryChange?: (query: string) => void;
  onLensChange?: (lens: GraphLens) => void;
  onRetry?: () => void;
}

export type GraphLoader = (query: GraphQueryInput, signal: AbortSignal) => Promise<GraphSnapshot>;

const WORK_LENS_KINDS = new Set(["task", "project", "goal", "meeting", "decision", "action_item", "inbox", "calendar", "focus"]);

export function GraphPage({ locale, state, query = "", lens = "workspace", onQueryChange, onLensChange, onRetry }: GraphPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (state.kind === "loading") return <section data-graph-page-loading><p className="mb-3 text-sm text-muted-foreground">{frontendText(locale, "GRAPH_LOADING")}</p><PageState kind="loading" title={frontendText(locale, "GRAPH_LOADING")} /></section>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "GRAPH_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GRAPH_RETRY")}</Button></PageState>;
  if (state.kind === "empty") return <PageState kind="empty" title={frontendText(locale, "GRAPH_EMPTY")} description={frontendText(locale, "GRAPH_EMPTY_DESCRIPTION")} />;

  const snapshot = state.snapshot;
  const filteredSnapshot = filterSnapshot(snapshot, query, lens);
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
        <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Input data-graph-query aria-label={frontendText(locale, "GRAPH_QUERY_LABEL")} placeholder={frontendText(locale, "GRAPH_QUERY_PLACEHOLDER")} value={query} onChange={(event) => onQueryChange?.(event.currentTarget.value)} />
          <select data-graph-lens aria-label={frontendText(locale, "GRAPH_LENS_LABEL")} value={lens} onChange={(event) => onLensChange?.(event.currentTarget.value as GraphLens)} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="workspace">{frontendText(locale, "GRAPH_LENS_WORKSPACE")}</option>
            <option value="knowledge">{frontendText(locale, "GRAPH_LENS_KNOWLEDGE")}</option>
            <option value="work">{frontendText(locale, "GRAPH_LENS_WORK")}</option>
          </select>
        </CardContent>
      </Card>
      {state.kind === "truncated" && <div data-graph-truncated role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">{frontendText(locale, "GRAPH_TRUNCATED")}</div>}
      <GraphCanvas snapshot={filteredSnapshot} selectedId={selectedId} onSelect={setSelectedId} layout="concentric" fallbackLabel={frontendText(locale, "GRAPH_CANVAS_LABEL")} />
    </section>
  );
}

export function GraphRoute({ locale, load = defaultGraphLoader }: { locale: LocaleRuntime; load?: GraphLoader }) {
  const [state, setState] = useState<GraphPageState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState<GraphLens>("workspace");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ kind: "loading" });
    const input: GraphQueryInput = { scope: "workspace" };
    if (lens === "knowledge") input.scope = "knowledge";
    if (lens === "work") input.types = [...WORK_LENS_KINDS] as GraphQueryInput["types"];
    void load(input, controller.signal).then((snapshot) => {
      if (!active) return;
      setState(snapshot.nodes.length === 0 ? { kind: "empty" } : snapshot.truncated ? { kind: "truncated", snapshot } : { kind: "ready", snapshot });
    }).catch(() => {
      if (active && !controller.signal.aborted) setState({ kind: "error" });
    });
    return () => { active = false; controller.abort(); };
  }, [lens, load, retry]);
  return <GraphPage locale={locale} state={state} query={query} lens={lens} onQueryChange={setQuery} onLensChange={setLens} onRetry={() => { setState({ kind: "loading" }); setRetry((value) => value + 1); }} />;
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
