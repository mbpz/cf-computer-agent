import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { KnowledgeCard, type KnowledgeCardItem } from "../components/knowledge/knowledge-card";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { RecentKnowledgeItem, RecentResearchItem } from "../lib/knowledge-data";
import type { PrivateKnowledgeNoteListItem } from "../lib/knowledge-note";

export type KnowledgeState = { kind: "loading" } | { kind: "ready"; items: readonly KnowledgeCardItem[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string };

export function KnowledgePage({ state, onLoadMore, locale, recent = [], recentResearch = [], notes = [] }: { state: KnowledgeState; onLoadMore?: () => void; locale?: LocaleRuntime; recent?: readonly RecentKnowledgeItem[]; recentResearch?: readonly RecentResearchItem[]; notes?: readonly PrivateKnowledgeNoteListItem[] }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "KNOWLEDGE_ERROR")} />;
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "KNOWLEDGE_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DESCRIPTION")}</p></div>{recent.length > 0 && <RecentKnowledgePanel locale={locale} items={recent} />}{recentResearch.length > 0 && <RecentResearchPanel locale={locale} items={recentResearch} />}{notes.length > 0 && <PrivateNotesPanel locale={locale} notes={notes} />}{state.items.length ? <div className="grid gap-4 md:grid-cols-2">{state.items.map((item) => <KnowledgeCard key={item.id} locale={locale} item={item} />)}</div> : <PageState kind="empty" title={frontendText(locale, "KNOWLEDGE_EMPTY")} />}{state.nextCursor && <Button variant="outline" disabled={state.pending} onClick={onLoadMore}>{frontendText(locale, "KNOWLEDGE_LOAD_MORE")}</Button>}</section>;
}

function RecentKnowledgePanel({ locale, items }: { locale?: LocaleRuntime; items: readonly RecentKnowledgeItem[] }) {
  return <Card data-recent-knowledge="true"><CardContent className="p-4"><h2 className="text-sm font-semibold">{frontendText(locale, "KNOWLEDGE_RECENT_TITLE")}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((item) => <a key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="rounded-md border p-3 text-sm transition hover:bg-accent"><span className="block font-medium">{item.title.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</span><span className="mt-1 block text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RECENT_VISITS")} {item.visitCount}</span></a>)}</div></CardContent></Card>;
}

function RecentResearchPanel({ locale, items }: { locale?: LocaleRuntime; items: readonly RecentResearchItem[] }) {
  return <Card data-recent-research="true"><CardContent className="p-4"><h2 className="text-sm font-semibold">{frontendText(locale, "KNOWLEDGE_RESEARCH_RECENT_TITLE")}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-md border p-3 text-sm"><div className="flex items-start justify-between gap-3"><p className="font-medium">{item.goal}</p><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{frontendText(locale, `RESEARCH_STATUS_${item.status.toUpperCase()}`)}</span></div><p className="mt-2 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_SOURCES")} {item.sourceScope.spaceIds.length + item.sourceScope.collectionIds.length + item.sourceScope.knowledgeItemIds.length}</p><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_PROGRESS")} {item.checkpoint.completedSubquestionIds.length}/{item.subquestions.length}</p><a className="mt-3 inline-flex text-xs font-medium text-primary hover:underline" href={`/knowledge/${encodeURIComponent(item.knowledgeItemId)}?researchRunId=${encodeURIComponent(item.id)}`}>{frontendText(locale, "KNOWLEDGE_RESEARCH_OPEN")}</a></article>)}</div></CardContent></Card>;
}

function PrivateNotesPanel({ locale, notes }: { locale?: LocaleRuntime; notes: readonly PrivateKnowledgeNoteListItem[] }) {
  return <Card data-private-notes="true"><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{frontendText(locale, "KNOWLEDGE_NOTES_LIST_TITLE")}</h2><span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_NOTE_PRIVATE")}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{notes.map((note) => <a key={note.id} href={`/knowledge/${encodeURIComponent(note.knowledgeItemId)}`} className="rounded-md border p-3 text-sm transition hover:bg-accent"><span className="block font-medium">{note.title.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</span><span className="mt-1 block text-xs text-muted-foreground">{note.body.trim().slice(0, 140) || frontendText(locale, "KNOWLEDGE_NOTE_EMPTY")}</span></a>)}</div></CardContent></Card>;
}
