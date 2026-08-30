import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { DiscussionThread } from "../../lib/discussions-data";
import { DiscussionCursorPagination } from "./thread-page";
import { discussionContextHref, threadDiscussionHref } from "./discussion-model";

export type MessagesPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: readonly DiscussionThread[]; nextCursor?: string };

export function MessagesPage({ locale, state, page, limit, pending, onRetry, onNext, onPrevious, onLimitChange }: {
  locale: LocaleRuntime;
  state: MessagesPageState;
  page: number;
  limit: 20 | 50;
  pending: boolean;
  onRetry: () => void;
  onNext: (cursor: string) => void;
  onPrevious: () => void;
  onLimitChange: (limit: 20 | 50) => void;
}) {
  if (state.kind === "loading") return <div><span className="sr-only">{frontendText(locale, "MESSAGES_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "MESSAGES_LOADING")} /></div>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "MESSAGES_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "MESSAGES_RETRY")}</Button></PageState>;
  return <section className="flex min-h-0 flex-col gap-4">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "MESSAGES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "MESSAGES_DESCRIPTION")}</p></div>
    <div data-messages-scroll="true" className="min-h-0 max-h-[calc(100vh-18rem)] flex-1 space-y-3 overflow-y-auto pr-1" aria-busy={pending || undefined}>
      {state.items.length === 0 ? <PageState kind="empty" title={frontendText(locale, "MESSAGES_EMPTY")} /> : state.items.map((thread) => <Card key={thread.id}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="font-medium">{frontendText(locale, thread.contextKind === "task" ? "MESSAGES_CONTEXT_TASK" : "MESSAGES_CONTEXT_KNOWLEDGE")}</p><p className="truncate text-sm text-muted-foreground">{thread.contextId}</p><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "MESSAGES_MESSAGE_COUNT")} {thread.lastSequence}</p></div>
          <div className="flex flex-wrap gap-2"><a href={discussionContextHref({ kind: thread.contextKind, id: thread.contextId })} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">{frontendText(locale, "MESSAGES_OPEN_CONTEXT")}</a><a href={threadDiscussionHref(thread.id)} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">{frontendText(locale, "MESSAGES_OPEN_THREAD")}</a></div>
        </CardContent>
      </Card>)}
    </div>
    <DiscussionCursorPagination locale={locale} page={page} limit={limit} pending={pending} hasNext={Boolean(state.nextCursor)} onPrevious={onPrevious} onNext={() => state.nextCursor && onNext(state.nextCursor)} onLimitChange={onLimitChange} />
  </section>;
}
