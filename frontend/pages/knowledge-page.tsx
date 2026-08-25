import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { KnowledgeCard, type KnowledgeCardItem } from "../components/knowledge/knowledge-card";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export type KnowledgeState = { kind: "loading" } | { kind: "ready"; items: readonly KnowledgeCardItem[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string };

export function KnowledgePage({ state, onLoadMore, locale }: { state: KnowledgeState; onLoadMore?: () => void; locale?: LocaleRuntime }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "KNOWLEDGE_ERROR")} />;
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "KNOWLEDGE_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DESCRIPTION")}</p></div>{state.items.length ? <div className="grid gap-4 md:grid-cols-2">{state.items.map((item) => <KnowledgeCard key={item.id} locale={locale} item={item} />)}</div> : <PageState kind="empty" title={frontendText(locale, "KNOWLEDGE_EMPTY")} />}{state.nextCursor && <Button variant="outline" disabled={state.pending} onClick={onLoadMore}>{frontendText(locale, "KNOWLEDGE_LOAD_MORE")}</Button>}</section>;
}
