import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function KnowledgeReaderPage({ revision, renderMarkdown, locale }: { revision: { id: string; title?: string; markdown: string }; renderMarkdown: (markdown: string) => ReactNode; locale?: LocaleRuntime }) {
  return <article><Card><CardHeader><CardTitle>{revision.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</CardTitle></CardHeader><CardContent><div className="prose prose-slate max-w-none text-sm leading-7">{renderMarkdown(revision.markdown)}</div></CardContent></Card></article>;
}
