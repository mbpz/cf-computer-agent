import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { Button } from "../components/ui/button";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { KnowledgeRevision, KnowledgeRevisionDiff, KnowledgeSourceLocation } from "../lib/knowledge-reader-data";

export type KnowledgeReaderState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

type DiffState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; diff: KnowledgeRevisionDiff } | { kind: "error" };
type KnowledgeReaderRevisionInput = Pick<KnowledgeRevision, "id" | "markdown"> & Partial<KnowledgeRevision>;

export function KnowledgeReaderPage({ revision, renderMarkdown, locale, state = { kind: "ready" }, onRetry, diffState = { kind: "idle" }, onCompare }: { revision: KnowledgeReaderRevisionInput; renderMarkdown: (markdown: string) => ReactNode; locale?: LocaleRuntime; state?: KnowledgeReaderState; onRetry?: () => void; diffState?: DiffState; onCompare?: () => void }) {
  const normalizedRevision: KnowledgeRevision = {
    id: revision.id,
    knowledgeItemId: revision.knowledgeItemId ?? "",
    title: revision.title,
    markdown: revision.markdown,
    publishedAt: revision.publishedAt,
    isCurrent: revision.isCurrent === true,
    previousRevisionId: revision.previousRevisionId ?? null,
    sourceVersionId: revision.sourceVersionId ?? "",
    sourceVersionOrdinal: revision.sourceVersionOrdinal ?? null,
    parserSchemaVersion: revision.parserSchemaVersion ?? null,
    indexStatus: revision.indexStatus ?? "pending",
    visibility: revision.visibility,
    chunks: Array.isArray(revision.chunks) ? revision.chunks : [],
  };
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "KNOWLEDGE_READER_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "KNOWLEDGE_READER_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></PageState>;
  const selectedChunk = normalizedRevision.chunks.find((chunk) => chunk.id === selectedChunkId);
  return <article className="space-y-5"><Card><CardHeader><CardTitle>{normalizedRevision.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</CardTitle><div className="flex flex-wrap items-center justify-between gap-3">{normalizedRevision.publishedAt && <p className="text-xs text-muted-foreground">{normalizedRevision.publishedAt}{normalizedRevision.isCurrent === false ? ` · ${frontendText(locale, "KNOWLEDGE_READER_HISTORICAL")}` : ""}</p>}{normalizedRevision.previousRevisionId && onCompare && <Button size="sm" variant="outline" disabled={diffState.kind === "loading"} onClick={onCompare}>{diffState.kind === "loading" ? frontendText(locale, "KNOWLEDGE_READER_COMPARING") : frontendText(locale, "KNOWLEDGE_READER_COMPARE")}</Button>}</div></CardHeader><CardContent><div className="prose prose-slate max-w-none text-sm leading-7">{renderMarkdown(normalizedRevision.markdown)}</div></CardContent></Card><SourcePanel locale={locale} revision={normalizedRevision} selectedChunkId={selectedChunkId} selectedChunk={selectedChunk} onSelectChunk={setSelectedChunkId} />{diffState.kind !== "idle" && <RevisionDiffPanel locale={locale} state={diffState} />}</article>;
}

function SourcePanel({ locale, revision, selectedChunkId, selectedChunk, onSelectChunk }: { locale?: LocaleRuntime; revision: KnowledgeRevision; selectedChunkId: string | null; selectedChunk?: KnowledgeRevision["chunks"][number]; onSelectChunk: (id: string) => void }) {
  const sourceId = revision.sourceVersionId || frontendText(locale, "COMMON_VALUE_UNAVAILABLE");
  const parser = revision.parserSchemaVersion || frontendText(locale, "COMMON_VALUE_UNAVAILABLE");
  return <Card data-source-panel="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_READER_SOURCES")}</CardTitle><p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_VERSION")} {revision.sourceVersionOrdinal === null ? "—" : `#${revision.sourceVersionOrdinal}`} · {sourceId}</p><p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_PARSE_STATUS")} {parser} · {revision.indexStatus}</p></CardHeader><CardContent className="space-y-3">{revision.chunks.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_SOURCES_EMPTY")}</p> : <div role="list" aria-label={frontendText(locale, "KNOWLEDGE_READER_SOURCES")} className="grid gap-2">{revision.chunks.map((chunk) => <button key={chunk.id} type="button" role="listitem" aria-pressed={selectedChunkId === chunk.id} data-source-selected={selectedChunkId === chunk.id ? "true" : "false"} onClick={() => onSelectChunk(chunk.id)} className="rounded-md border p-3 text-left text-sm transition hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent"><span className="font-medium">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_CHUNK")} {chunk.ordinal + 1}</span><span className="ml-2 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_LINES")} {chunk.startLine}–{chunk.endLine}</span><span className="mt-1 block text-xs text-muted-foreground">{locationLabel(chunk.location, locale) || chunk.headingPath.join(" / ") || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</span></button>)}</div>}{selectedChunk && <div role="status" className="rounded-md bg-muted/40 p-3 text-sm"><p className="font-medium">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_SELECTED")}</p><p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{selectedChunk.text.slice(0, 240)}{selectedChunk.text.length > 240 ? "…" : ""}</p></div>}</CardContent></Card>;
}

function locationLabel(location: KnowledgeSourceLocation | undefined, locale?: LocaleRuntime): string {
  if (!location) return "";
  if (location.kind === "pdf") return `${frontendText(locale, "KNOWLEDGE_READER_SOURCE_PAGE")} ${location.page}`;
  if (location.kind === "spreadsheet") return `${location.sheet} · ${location.range}`;
  return `${frontendText(locale, "KNOWLEDGE_READER_SOURCE_SLIDE")} ${location.slide} · ${location.elementStart}–${location.elementEnd}`;
}

function RevisionDiffPanel({ locale, state }: { locale?: LocaleRuntime; state: DiffState }) {
  if (state.kind === "loading") return <Card><CardContent className="p-5 text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_LOADING")}</CardContent></Card>;
  if (state.kind === "error") return <p role="alert" className="text-sm text-destructive">{frontendText(locale, "KNOWLEDGE_READER_DIFF_ERROR")}</p>;
  const diff = state.diff;
  const statsLabel = frontendText(locale, "KNOWLEDGE_READER_DIFF_STATS").replace("{added}", String(diff.stats.added)).replace("{removed}", String(diff.stats.removed));
  return <Card data-revision-diff="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_READER_DIFF_TITLE")}</CardTitle><p className="text-xs text-muted-foreground">{statsLabel}</p></CardHeader><CardContent className="space-y-4">{diff.metadataChanges.length > 0 && <div><h3 className="text-sm font-medium">{frontendText(locale, "KNOWLEDGE_READER_DIFF_METADATA")}</h3><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{diff.metadataChanges.map((change) => <li key={change.field}><span className="font-medium">{change.field}</span>: {String(change.from ?? "∅")} → {String(change.to ?? "∅")}</li>)}</ul></div>}{diff.hunks.flatMap((hunk) => hunk.lines).length > 0 ? <pre className="max-h-[30rem] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5"><code>{diff.hunks.flatMap((hunk) => hunk.lines).map((line, index) => <span key={`${line.kind}-${line.oldLine ?? "x"}-${line.newLine ?? "x"}-${index}`} className={line.kind === "added" ? "block bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : line.kind === "removed" ? "block bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200" : "block text-muted-foreground"}>{line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}{line.text}</span>)}</code></pre> : <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_EMPTY")}</p>}{diff.stats.truncated && <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_TRUNCATED")}</p>}</CardContent></Card>;
}
