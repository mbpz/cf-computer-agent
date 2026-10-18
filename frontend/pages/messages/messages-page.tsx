import { ChatCircle } from "@phosphor-icons/react";
import { ButtonLink } from "../../components/motion/button/base";
import { SharedLayoutBg } from "../../components/motion/shared-layout-bg";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { DiscussionThread } from "../../lib/discussions-data";
import { DiscussionCursorPagination } from "./thread-page";
import { discussionContextHref, threadDiscussionHref } from "./discussion-model";

export type MessagesPageState =
  | { kind: "loading" }
  | { kind: "error" }
  /** `list` = the whole messages surface is denied; `thread` = a direct context entry is no longer available. */
  | { kind: "revoked"; target: "list" | "thread" }
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
  return <section className="flex min-h-0 flex-col gap-4">
    <PageHeader
      icon={<ChatCircle size={22} weight="duotone" className="text-primary" />}
      title={frontendText(locale, "MESSAGES_TITLE")}
      description={frontendText(locale, "MESSAGES_DESCRIPTION")}
    />
    {state.kind === "loading" && <div><span className="sr-only">{frontendText(locale, "MESSAGES_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "MESSAGES_LOADING")} /></div>}
    {state.kind === "error" && <PageState kind="error" title={frontendText(locale, "MESSAGES_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "MESSAGES_RETRY")}</Button></PageState>}
    {/* Revoked access is its own state, not a retryable read failure: the list is
        hidden, the copy names the revocation, and retry re-checks the member boundary. */}
    {state.kind === "revoked" && <PageState
      kind="forbidden"
      title={frontendText(locale, state.target === "thread" ? "MESSAGES_THREAD_REVOKED" : "MESSAGES_REVOKED")}
      description={frontendText(locale, state.target === "thread" ? "MESSAGES_THREAD_REVOKED_DESCRIPTION" : "MESSAGES_REVOKED_DESCRIPTION")}
    >
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onRetry}>{frontendText(locale, "MESSAGES_RETRY")}</Button>
        <ButtonLink variant="outline" size="md" href="/messages">{frontendText(locale, "MESSAGES_BACK")}</ButtonLink>
      </div>
    </PageState>}
    {state.kind === "ready" && <>
    <div data-messages-scroll="true" className="min-h-0 max-h-[calc(100vh-18rem)] flex-1 space-y-3 overflow-y-auto pr-1" aria-busy={pending || undefined}>
      {state.items.length === 0 ? <PageState kind="empty" title={frontendText(locale, "MESSAGES_EMPTY")} /> : <SharedLayoutBg as="ul" className="space-y-3" inset={10}>
        {state.items.map((thread) => <li key={thread.id} className="rounded-lg border bg-card">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="font-medium">{frontendText(locale, thread.contextKind === "task" ? "MESSAGES_CONTEXT_TASK" : "MESSAGES_CONTEXT_KNOWLEDGE")}</p><p className="truncate text-sm text-muted-foreground">{thread.contextId}</p><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "MESSAGES_MESSAGE_COUNT")} {thread.lastSequence}</p></div>
            <div className="flex flex-wrap gap-2"><ButtonLink variant="outline" size="md" href={discussionContextHref({ kind: thread.contextKind, id: thread.contextId })}>{frontendText(locale, "MESSAGES_OPEN_CONTEXT")}</ButtonLink><ButtonLink variant="primary" size="md" href={threadDiscussionHref(thread.id)}>{frontendText(locale, "MESSAGES_OPEN_THREAD")}</ButtonLink></div>
          </div>
        </li>)}
      </SharedLayoutBg>}
    </div>
    <DiscussionCursorPagination locale={locale} page={page} limit={limit} pending={pending} hasNext={Boolean(state.nextCursor)} onPrevious={onPrevious} onNext={() => state.nextCursor && onNext(state.nextCursor)} onLimitChange={onLimitChange} />
    </>}
  </section>;
}
