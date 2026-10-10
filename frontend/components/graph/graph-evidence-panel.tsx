import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../../lib/api";
import { Button } from "../ui/button";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { loadGraphCitation, type GraphCitation } from "../../lib/graph-evidence";

type EvidenceState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "gap" }
  | { kind: "ready"; citations: GraphCitation[] }
  | { kind: "error" }
  | { kind: "forbidden" };

export interface GraphEvidencePanelProps {
  locale: LocaleRuntime;
  citationIds?: readonly string[];
  onDenied?: () => void;
  load?: (citationId: string, signal: AbortSignal) => Promise<GraphCitation>;
}

const defaultGraphCitationLoader = (id: string, signal: AbortSignal) => loadGraphCitation(id, fetch, signal);

export function GraphEvidencePanel({ locale, citationIds, onDenied, load = defaultGraphCitationLoader }: GraphEvidencePanelProps) {
  const ids = [...new Set((citationIds ?? []).filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
  const scope = JSON.stringify(citationIds === undefined ? null : ids);
  const [state, setState] = useState<EvidenceState>(citationIds === undefined ? { kind: "idle" } : ids.length ? { kind: "loading" } : { kind: "gap" });
  const controllerRef = useRef<AbortController | null>(null);

  const read = useCallback(() => {
    if (controllerRef.current) return;
    const currentIds = JSON.parse(scope) as string[] | null;
    if (!currentIds?.length) {
      setState({ kind: currentIds === null ? "idle" : "gap" });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const live = () => controllerRef.current === controller && !controller.signal.aborted;
    setState({ kind: "loading" });
    const reads = currentIds.map(id => Promise.resolve().then(() => load(id, controller.signal)).catch((error: unknown) => {
      // Observe each denial immediately, even if another citation already returned 404.
      if (live() && error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        controller.abort();
        setState({ kind: "forbidden" });
        onDenied?.();
      }
      throw error;
    }));
    void Promise.allSettled(reads).then(results => {
      if (!live()) return;
      controllerRef.current = null;
      const failed = results.filter(result => result.status === "rejected");
      if (failed.length) {
        const missingOnly = failed.every(result => result.reason instanceof ApiRequestError && result.reason.status === 404);
        setState({ kind: missingOnly ? "gap" : "error" });
      } else {
        setState({ kind: "ready", citations: results.flatMap(result => result.status === "fulfilled" ? [result.value] : []) });
      }
    });
  }, [scope, load, onDenied]);

  useEffect(() => {
    read();
    return () => { controllerRef.current?.abort(); controllerRef.current = null; };
  }, [read]);

  const title = frontendText(locale, "GRAPH_EVIDENCE_TITLE");
  if (state.kind === "idle") return <aside data-graph-evidence-idle className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" aria-label={title}><p className="font-medium text-foreground">{title}</p><p className="mt-2">{frontendText(locale, "GRAPH_EVIDENCE_IDLE")}</p></aside>;
  if (state.kind === "loading") return <aside data-graph-evidence-loading className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" aria-label={title}><p className="font-medium text-foreground">{title}</p><p className="mt-2">{frontendText(locale, "GRAPH_EVIDENCE_LOADING")}</p></aside>;
  if (state.kind === "forbidden") return <aside data-graph-evidence-forbidden role="alert" className="rounded-lg border bg-card p-5 text-sm" aria-label={title}>{frontendText(locale, "GRAPH_FORBIDDEN")}</aside>;
  if (state.kind === "error") return <aside data-graph-evidence-error className="rounded-lg border bg-card p-5 text-sm" aria-label={title}><p role="alert">{frontendText(locale, "GRAPH_EVIDENCE_ERROR")}</p><Button variant="outline" onClick={read}>{frontendText(locale, "COMMON_RETRY")}</Button></aside>;
  if (state.kind === "gap") return <aside data-graph-evidence-gap className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" aria-label={title}><p className="font-medium text-foreground">{title}</p><p className="mt-2">{frontendText(locale, "GRAPH_EVIDENCE_GAP")}</p></aside>;
  return <aside data-graph-evidence className="rounded-lg border bg-card p-5" aria-label={title}><h3 className="font-medium">{title}</h3><ul className="mt-3 grid gap-3">{state.citations.map((citation) => <li key={citation.citationId} className="rounded-md border p-3 text-sm"><a className="font-medium text-primary underline-offset-4 hover:underline" href={`/knowledge/${encodeURIComponent(citation.knowledgeItemId)}#${encodeURIComponent(citation.citationId)}`}>{citation.title}</a><dl className="mt-2 grid gap-1 text-xs text-muted-foreground"><div><dt className="inline">{frontendText(locale, "GRAPH_EVIDENCE_REVISION")}: </dt><dd className="inline">{citation.revisionId}</dd></div><div><dt className="inline">{frontendText(locale, "GRAPH_EVIDENCE_CHUNK")}: </dt><dd className="inline">{citation.chunkId}</dd></div><div><dt className="inline">{frontendText(locale, "GRAPH_EVIDENCE_LOCATION")}: </dt><dd className="inline">{formatLocation(citation, locale)}</dd></div></dl></li>)}</ul></aside>;
}

function formatLocation(citation: GraphCitation, locale: LocaleRuntime): string {
  if (citation.location?.kind === "pdf" && citation.location.page !== undefined) return `${frontendText(locale, "GRAPH_EVIDENCE_PAGE")} ${citation.location.page}`;
  if (citation.location?.kind === "spreadsheet" && citation.location.sheet && citation.location.range) return `${citation.location.sheet} ${citation.location.range}`;
  if (citation.location?.kind === "slide" && citation.location.slide !== undefined) return `${frontendText(locale, "GRAPH_EVIDENCE_SLIDE")} ${citation.location.slide}`;
  return `${citation.startLine}-${citation.endLine}`;
}
