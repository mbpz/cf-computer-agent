import { useRef, useState, type FormEvent } from "react";
import { Alert, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { Select, SelectOption } from "../../components/ui/select";
import type { DiscussionMessage, DiscussionSendInput, DiscussionThread } from "../../lib/discussions-data";
import { frontendPaginationLabels, frontendText, type LocaleRuntime } from "../../lib/i18n";
import { createDiscussionSubmitController, discussionContextHref, discussionSendFingerprint, mentionIdsFromBody } from "./discussion-model";

export type ThreadPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; thread: DiscussionThread; messages: readonly DiscussionMessage[]; nextCursor?: string };

export function ThreadPage({ locale, state, page, limit, pending, onRetry, onRefresh, onNext, onPrevious, onLimitChange, onSend }: {
  locale: LocaleRuntime;
  state: ThreadPageState;
  page: number;
  limit: 20 | 50;
  pending: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  onNext: (cursor: string) => void;
  onPrevious: () => void;
  onLimitChange: (limit: 20 | 50) => void;
  onSend: (input: DiscussionSendInput) => Promise<void>;
}) {
  const [replyTo, setReplyTo] = useState<DiscussionMessage | null>(null);
  if (state.kind === "loading") return <div><span className="sr-only">{frontendText(locale, "MESSAGES_THREAD_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "MESSAGES_THREAD_LOADING")} /></div>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "MESSAGES_THREAD_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "MESSAGES_RETRY")}</Button></PageState>;
  return <section className="flex min-h-0 flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><a href="/messages" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "MESSAGES_BACK")}</a><h1 className="mt-1 text-2xl font-semibold">{frontendText(locale, "MESSAGES_THREAD_TITLE")}</h1><a className="text-sm text-muted-foreground hover:underline" href={discussionContextHref({ kind: state.thread.contextKind, id: state.thread.contextId })}>{state.thread.contextId}</a></div><Button variant="outline" disabled={pending} onClick={onRefresh}>{frontendText(locale, "MESSAGES_REFRESH")}</Button></div>
    <div data-thread-scroll="true" className="min-h-48 max-h-[calc(100vh-25rem)] flex-1 space-y-3 overflow-y-auto pr-1" aria-busy={pending || undefined}>
      {state.messages.length === 0 ? <PageState kind="empty" title={frontendText(locale, "MESSAGES_THREAD_EMPTY")} /> : state.messages.map((message) => <Card key={message.id} data-message-id={message.id}><CardContent className="space-y-2 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{message.authorMemberId}</p><time className="text-xs text-muted-foreground" dateTime={message.createdAt}>{message.createdAt}</time></div>{message.replyToMessageId && <p className="text-xs text-muted-foreground">{frontendText(locale, "MESSAGES_REPLYING_TO")} {message.replyToMessageId}</p>}<p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>{message.mentionMemberIds.length > 0 && <div className="flex flex-wrap gap-1">{message.mentionMemberIds.map((memberId) => <Badge key={memberId} variant="secondary">@{memberId}</Badge>)}</div>}<Button size="sm" variant="ghost" onClick={() => setReplyTo(message)}>{frontendText(locale, "MESSAGES_REPLY")}</Button></CardContent></Card>)}
    </div>
    <DiscussionCursorPagination locale={locale} page={page} limit={limit} pending={pending} hasNext={Boolean(state.nextCursor)} onPrevious={onPrevious} onNext={() => state.nextCursor && onNext(state.nextCursor)} onLimitChange={onLimitChange} />
    <DiscussionComposer key={state.thread.id} locale={locale} thread={state.thread} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={onSend} />
  </section>;
}

function DiscussionComposer({ locale, thread, replyTo, onCancelReply, onSend }: { locale: LocaleRuntime; thread: DiscussionThread; replyTo: DiscussionMessage | null; onCancelReply: () => void; onSend: (input: DiscussionSendInput) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const submitControllerRef = useRef<ReturnType<typeof createDiscussionSubmitController> | null>(null);
  if (!submitControllerRef.current) submitControllerRef.current = createDiscussionSubmitController();
  const currentInput = discussionComposerInput(thread, body, replyTo);
  const currentFingerprintRef = useRef<string | null>(null);
  currentFingerprintRef.current = currentInput ? discussionSendFingerprint(currentInput) : null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = discussionComposerInput(thread, body, replyTo);
    if (!input) return;
    const submittedFingerprint = discussionSendFingerprint(input);
    setStatus("pending");
    try {
      const accepted = await submitControllerRef.current!.submit(input, onSend);
      if (!accepted) return;
      if (currentFingerprintRef.current !== submittedFingerprint) {
        setStatus("idle");
        return;
      }
      setBody("");
      onCancelReply();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };
  return <form className="space-y-2 rounded-lg border bg-card p-3" onSubmit={(event) => void submit(event)}>
    {replyTo && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{frontendText(locale, "MESSAGES_REPLYING_TO")} {replyTo.authorMemberId}</span><button type="button" className="text-primary hover:underline" onClick={onCancelReply}>{frontendText(locale, "MESSAGES_CANCEL_REPLY")}</button></div>}
    {status === "error" && <Alert variant="destructive"><AlertTitle>{frontendText(locale, "MESSAGES_SEND_ERROR")}</AlertTitle></Alert>}
    <label className="block text-sm font-medium" htmlFor="discussion-composer">{frontendText(locale, "MESSAGES_COMPOSER_LABEL")}</label>
    <textarea id="discussion-composer" value={body} onChange={(event) => setBody(event.currentTarget.value)} maxLength={5_000} disabled={status === "pending"} className="min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={frontendText(locale, "MESSAGES_COMPOSER_PLACEHOLDER")} />
    <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{frontendText(locale, "MESSAGES_MENTION_HINT")}</p><Button type="submit" disabled={status === "pending" || !body.trim()}>{status === "pending" ? frontendText(locale, "MESSAGES_SENDING") : frontendText(locale, "MESSAGES_SEND")}</Button></div>
  </form>;
}

function discussionComposerInput(
  thread: DiscussionThread,
  body: string,
  replyTo: DiscussionMessage | null,
): Omit<DiscussionSendInput, "clientKey"> | null {
  const normalized = body.trim();
  if (!normalized) return null;
  return {
    context: { kind: thread.contextKind, id: thread.contextId },
    body: normalized,
    ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
    mentionMemberIds: mentionIdsFromBody(normalized),
  };
}

export function DiscussionCursorPagination({ locale, page, limit, pending, hasNext, onPrevious, onNext, onLimitChange }: { locale: LocaleRuntime; page: number; limit: 20 | 50; pending: boolean; hasNext: boolean; onPrevious: () => void; onNext: () => void; onLimitChange: (limit: 20 | 50) => void }) {
  const labels = frontendPaginationLabels(locale);
  return <nav aria-label={labels.navigationLabel} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-sm text-muted-foreground">{labels.pageLabel(page)}</p><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm text-muted-foreground"><span>{labels.pageSizeLabel}</span><Select aria-label={labels.pageSizeLabel} value={String(limit)} disabled={pending} onChange={(event) => onLimitChange(Number(event.currentTarget.value) as 20 | 50)}><SelectOption value="20">20</SelectOption><SelectOption value="50">50</SelectOption></Select></label><Button type="button" variant="outline" aria-label={labels.previousLabel} disabled={pending || page <= 1} onClick={onPrevious}>{labels.previousLabel}</Button><Button type="button" variant="outline" aria-label={labels.nextLabel} disabled={pending || !hasNext} onClick={onNext}>{labels.nextLabel}</Button></div></nav>;
}
