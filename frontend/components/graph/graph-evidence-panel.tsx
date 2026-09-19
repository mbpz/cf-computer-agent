import { useEffect, useState } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { loadGraphCitation, type GraphCitation } from "../../lib/graph-evidence";

type EvidenceState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "gap" }
  | { kind: "ready"; citations: GraphCitation[] }
  | { kind: "error" };

export interface GraphEvidencePanelProps {
  locale: LocaleRuntime;
  citationIds?: readonly string[];
  load?: (citationId: string, signal: AbortSignal) => Promise<GraphCitation>;
}

const defaultGraphCitationLoader = (id: string, signal: AbortSignal) => loadGraphCitation(id, fetch, signal);

export function GraphEvidencePanel({ locale, citationIds, load = defaultGraphCitationLoader }: GraphEvidencePanelProps) {
  const ids = [...new Set((citationIds ?? []).filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
  const [state, setState] = useState<EvidenceState>(citationIds === undefined ? { kind: "idle" } : ids.length ? { kind: "loading" } : { kind: "gap" });

  useEffect(() => {
    const controller = new AbortController();
    if (ids.length === 0) {
      setState({ kind: "gap" });
      return () => controller.abort();
    }
    setState({ kind: "loading" });
    void Promise.all(ids.map((id) => load(id, controller.signal))).then((citations) => {
      if (!controller.signal.aborted) setState({ kind: "ready", citations });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ kind: "gap" });
    });
    return () => controller.abort();
  }, [ids.join("\u001f"), load]);

  const title = frontendText(locale, "GRAPH_EVIDENCE_TITLE");
  if (state.kind === "idle") return <aside data-graph-evidence-idle className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" aria-label={title}><p className="font-medium text-foreground">{title}</p><p className="mt-2">{frontendText(locale, "GRAPH_EVIDENCE_IDLE")}</p></aside>;
  if (state.kind === "loading") return <aside data-graph-evidence-loading className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" aria-label={title}><p className="font-medium text-foreground">{title}</p><p className="mt-2">{frontendText(locale, "GRAPH_EVIDENCE_LOADING")}</p></aside>;
  if (state.kind === "gap" || state.kind === "error") return <aside data-graph-evidence-gap className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" aria-label={title}><p className="font-medium text-foreground">{title}</p><p className="mt-2">{frontendText(locale, "GRAPH_EVIDENCE_GAP")}</p></aside>;
  return <aside data-graph-evidence className="rounded-lg border bg-card p-5" aria-label={title}><h3 className="font-medium">{title}</h3><ul className="mt-3 grid gap-3">{state.citations.map((citation) => <li key={citation.citationId} className="rounded-md border p-3 text-sm"><a className="font-medium text-primary underline-offset-4 hover:underline" href={`/knowledge/${encodeURIComponent(citation.knowledgeItemId)}#${encodeURIComponent(citation.citationId)}`}>{citation.title}</a><dl className="mt-2 grid gap-1 text-xs text-muted-foreground"><div><dt className="inline">{frontendText(locale, "GRAPH_EVIDENCE_REVISION")}: </dt><dd className="inline">{citation.revisionId}</dd></div><div><dt className="inline">{frontendText(locale, "GRAPH_EVIDENCE_CHUNK")}: </dt><dd className="inline">{citation.chunkId}</dd></div><div><dt className="inline">{frontendText(locale, "GRAPH_EVIDENCE_LOCATION")}: </dt><dd className="inline">{formatLocation(citation, locale)}</dd></div></dl></li>)}</ul></aside>;
}

function formatLocation(citation: GraphCitation, locale: LocaleRuntime): string {
  if (citation.location?.kind === "pdf" && citation.location.page !== undefined) return `${frontendText(locale, "GRAPH_EVIDENCE_PAGE")} ${citation.location.page}`;
  if (citation.location?.kind === "spreadsheet" && citation.location.sheet && citation.location.range) return `${citation.location.sheet} ${citation.location.range}`;
  if (citation.location?.kind === "slide" && citation.location.slide !== undefined) return `${frontendText(locale, "GRAPH_EVIDENCE_SLIDE")} ${citation.location.slide}`;
  return `${citation.startLine}-${citation.endLine}`;
}
