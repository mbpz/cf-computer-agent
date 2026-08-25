import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export function KnowledgeReaderPage({ revision, renderMarkdown }: { revision: { id: string; title?: string; markdown: string }; renderMarkdown: (markdown: string) => ReactNode }) {
  return <article><Card><CardHeader><CardTitle>{revision.title?.trim() || "Untitled knowledge"}</CardTitle></CardHeader><CardContent><div className="prose prose-slate max-w-none text-sm leading-7">{renderMarkdown(revision.markdown)}</div></CardContent></Card></article>;
}
