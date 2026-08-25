import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { Button } from "../components/ui/button";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export type KnowledgeReaderState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

export function KnowledgeReaderPage({ revision, renderMarkdown, locale, state = { kind: "ready" }, onRetry }: { revision: { id: string; title?: string; markdown: string; publishedAt?: string; isCurrent?: boolean }; renderMarkdown: (markdown: string) => ReactNode; locale?: LocaleRuntime; state?: KnowledgeReaderState; onRetry?: () => void }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "KNOWLEDGE_READER_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "KNOWLEDGE_READER_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></PageState>;
  return <article><Card><CardHeader><CardTitle>{revision.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</CardTitle>{revision.publishedAt && <p className="text-xs text-muted-foreground">{revision.publishedAt}{revision.isCurrent === false ? ` · ${frontendText(locale, "KNOWLEDGE_READER_HISTORICAL")}` : ""}</p>}</CardHeader><CardContent><div className="prose prose-slate max-w-none text-sm leading-7">{renderMarkdown(revision.markdown)}</div></CardContent></Card></article>;
}
