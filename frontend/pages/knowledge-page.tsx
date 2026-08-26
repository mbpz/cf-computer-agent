import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { KnowledgeCard, type KnowledgeCardItem } from "../components/knowledge/knowledge-card";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { RecentKnowledgeItem } from "../lib/knowledge-data";

export type KnowledgeState = { kind: "loading" } | { kind: "ready"; items: readonly KnowledgeCardItem[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string };

export function KnowledgePage({ state, onLoadMore, locale, recent = [] }: { state: KnowledgeState; onLoadMore?: () => void; locale?: LocaleRuntime; recent?: readonly RecentKnowledgeItem[] }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "KNOWLEDGE_ERROR")} />;
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "KNOWLEDGE_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DESCRIPTION")}</p></div>{recent.length > 0 && <RecentKnowledgePanel locale={locale} items={recent} />}{state.items.length ? <div className="grid gap-4 md:grid-cols-2">{state.items.map((item) => <KnowledgeCard key={item.id} locale={locale} item={item} />)}</div> : <PageState kind="empty" title={frontendText(locale, "KNOWLEDGE_EMPTY")} />}{state.nextCursor && <Button variant="outline" disabled={state.pending} onClick={onLoadMore}>{frontendText(locale, "KNOWLEDGE_LOAD_MORE")}</Button>}</section>;
}

function RecentKnowledgePanel({ locale, items }: { locale?: LocaleRuntime; items: readonly RecentKnowledgeItem[] }) {
  return <Card data-recent-knowledge="true"><CardContent className="p-4"><h2 className="text-sm font-semibold">{frontendText(locale, "KNOWLEDGE_RECENT_TITLE")}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((item) => <a key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="rounded-md border p-3 text-sm transition hover:bg-accent"><span className="block font-medium">{item.title.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</span><span className="mt-1 block text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RECENT_VISITS")} {item.visitCount}</span></a>)}</div></CardContent></Card>;
}
