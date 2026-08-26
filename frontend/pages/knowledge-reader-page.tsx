import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { Button } from "../components/ui/button";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { KnowledgeRevisionDiff } from "../lib/knowledge-reader-data";

export type KnowledgeReaderState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

type DiffState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; diff: KnowledgeRevisionDiff } | { kind: "error" };

export function KnowledgeReaderPage({ revision, renderMarkdown, locale, state = { kind: "ready" }, onRetry, diffState = { kind: "idle" }, onCompare }: { revision: { id: string; title?: string; markdown: string; publishedAt?: string; isCurrent?: boolean; previousRevisionId?: string | null }; renderMarkdown: (markdown: string) => ReactNode; locale?: LocaleRuntime; state?: KnowledgeReaderState; onRetry?: () => void; diffState?: DiffState; onCompare?: () => void }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "KNOWLEDGE_READER_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "KNOWLEDGE_READER_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></PageState>;
  return <article className="space-y-5"><Card><CardHeader><CardTitle>{revision.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</CardTitle><div className="flex flex-wrap items-center justify-between gap-3">{revision.publishedAt && <p className="text-xs text-muted-foreground">{revision.publishedAt}{revision.isCurrent === false ? ` · ${frontendText(locale, "KNOWLEDGE_READER_HISTORICAL")}` : ""}</p>}{revision.previousRevisionId && onCompare && <Button size="sm" variant="outline" disabled={diffState.kind === "loading"} onClick={onCompare}>{diffState.kind === "loading" ? frontendText(locale, "KNOWLEDGE_READER_COMPARING") : frontendText(locale, "KNOWLEDGE_READER_COMPARE")}</Button>}</div></CardHeader><CardContent><div className="prose prose-slate max-w-none text-sm leading-7">{renderMarkdown(revision.markdown)}</div></CardContent></Card>{diffState.kind !== "idle" && <RevisionDiffPanel locale={locale} state={diffState} />}</article>;
}

function RevisionDiffPanel({ locale, state }: { locale?: LocaleRuntime; state: DiffState }) {
  if (state.kind === "loading") return <Card><CardContent className="p-5 text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_LOADING")}</CardContent></Card>;
  if (state.kind === "error") return <p role="alert" className="text-sm text-destructive">{frontendText(locale, "KNOWLEDGE_READER_DIFF_ERROR")}</p>;
  const diff = state.diff;
  const statsLabel = frontendText(locale, "KNOWLEDGE_READER_DIFF_STATS").replace("{added}", String(diff.stats.added)).replace("{removed}", String(diff.stats.removed));
  return <Card data-revision-diff="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_READER_DIFF_TITLE")}</CardTitle><p className="text-xs text-muted-foreground">{statsLabel}</p></CardHeader><CardContent className="space-y-4">{diff.metadataChanges.length > 0 && <div><h3 className="text-sm font-medium">{frontendText(locale, "KNOWLEDGE_READER_DIFF_METADATA")}</h3><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{diff.metadataChanges.map((change) => <li key={change.field}><span className="font-medium">{change.field}</span>: {String(change.from ?? "∅")} → {String(change.to ?? "∅")}</li>)}</ul></div>}{diff.hunks.flatMap((hunk) => hunk.lines).length > 0 ? <pre className="max-h-[30rem] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5"><code>{diff.hunks.flatMap((hunk) => hunk.lines).map((line, index) => <span key={`${line.kind}-${line.oldLine ?? "x"}-${line.newLine ?? "x"}-${index}`} className={line.kind === "added" ? "block bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : line.kind === "removed" ? "block bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200" : "block text-muted-foreground"}>{line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}{line.text}</span>)}</code></pre> : <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_EMPTY")}</p>}{diff.stats.truncated && <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_TRUNCATED")}</p>}</CardContent></Card>;
}
