import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { Select, SelectOption } from "../../components/ui/select";
import type { DiscussionMessage, DiscussionSendInput, DiscussionThread } from "../../lib/discussions-data";
import { frontendPaginationLabels, frontendText, type LocaleRuntime } from "../../lib/i18n";
import { useCreateDraft } from "../../lib/use-create-draft";
import { createDiscussionSubmitController, discussionContextHref, mentionIdsFromBody } from "./discussion-model";

export type ThreadPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; thread: DiscussionThread; messages: readonly DiscussionMessage[]; nextCursor?: string };

export function ThreadPage({ locale, state, page, limit, pending, onRetry, onRefresh, onNext, onPrevious, onLimitChange, onSend, onLookup, onSent }: {
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
  onLookup?: (input: DiscussionSendInput) => Promise<boolean>;
  onSent?: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "pending" | "checking" | "error">("idle");
  const submitControllerRef = useRef<ReturnType<typeof createDiscussionSubmitController> | null>(null);
  if (!submitControllerRef.current) submitControllerRef.current = createDiscussionSubmitController();
  const submitPendingRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const blank = { body: "", replyId: "", replyAuthor: "" };
  const draft = useCreateDraft(blank, blank,
    () => submitPendingRef.current || submitControllerRef.current!.hasUnresolved(), locale,
    () => state.kind !== "ready");
  const { body, replyId, replyAuthor } = draft.fields;
  const locked = submitControllerRef.current.hasUnresolved() || status === "pending" || draft.confirming;
  const replyTo = replyId ? { id: replyId, authorMemberId: replyAuthor } : null;
  const selectReply = (message: DiscussionMessage | null) => {
    draft.edit("replyId", message?.id ?? "");
    draft.edit("replyAuthor", message?.authorMemberId ?? "");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!alive.current || state.kind !== "ready" || submitPendingRef.current || draft.isConfirming()) return;
    const input = discussionComposerInput(state.thread, draft.current.current.body, draft.current.current.replyId);
    if (!input) return;
    submitPendingRef.current = true;
    setStatus("pending");
    try {
      const accepted = await submitControllerRef.current!.submit(input, onSend);
      if (!alive.current) return;
      if (!accepted) { setStatus("idle"); return; }
      draft.reset();
      setStatus("idle");
      // Follow-up pagination must run after the operation and leave guard unlock.
      submitPendingRef.current = false;
      onSent?.();
    } catch {
      if (alive.current) setStatus("error");
    } finally {
      submitPendingRef.current = false;
    }
  };
  const checkResult = async () => {
    if (!alive.current || state.kind !== "ready" || !onLookup || submitPendingRef.current || draft.isConfirming()) return;
    submitPendingRef.current = true;
    setStatus("checking");
    try {
      const accepted = await submitControllerRef.current!.reconcile(onLookup);
      if (!alive.current) return;
      if (!accepted) { setStatus("error"); return; }
      draft.reset(); setStatus("idle");
      submitPendingRef.current = false;
      onSent?.();
    } catch { if (alive.current) setStatus("error"); }
    finally { submitPendingRef.current = false; }
  };
  if (state.kind === "loading") return <div>{draft.confirmation}<span className="sr-only">{frontendText(locale, "MESSAGES_THREAD_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "MESSAGES_THREAD_LOADING")} /></div>;
  if (state.kind === "error") return <>{draft.confirmation}<PageState kind="error" title={frontendText(locale, "MESSAGES_THREAD_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "MESSAGES_RETRY")}</Button></PageState></>;
  return <section className="flex min-h-0 flex-col gap-4">
    {draft.confirmation}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><a href="/messages" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "MESSAGES_BACK")}</a><h1 className="mt-1 text-2xl font-semibold">{frontendText(locale, "MESSAGES_THREAD_TITLE")}</h1><a className="text-sm text-muted-foreground hover:underline" href={discussionContextHref({ kind: state.thread.contextKind, id: state.thread.contextId })}>{state.thread.contextId}</a></div><Button variant="outline" disabled={pending} onClick={onRefresh}>{frontendText(locale, "MESSAGES_REFRESH")}</Button></div>
    <div data-thread-scroll="true" className="min-h-48 max-h-[calc(100vh-25rem)] flex-1 space-y-3 overflow-y-auto pr-1" aria-busy={pending || undefined}>
      {state.messages.length === 0 ? <PageState kind="empty" title={frontendText(locale, "MESSAGES_THREAD_EMPTY")} /> : state.messages.map((message) => <Card key={message.id} data-message-id={message.id}><CardContent className="space-y-2 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{message.authorMemberId}</p><time className="text-xs text-muted-foreground" dateTime={message.createdAt}>{message.createdAt}</time></div>{message.replyToMessageId && <p className="text-xs text-muted-foreground">{frontendText(locale, "MESSAGES_REPLYING_TO")} {message.replyToMessageId}</p>}<p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>{message.mentionMemberIds.length > 0 && <div className="flex flex-wrap gap-1">{message.mentionMemberIds.map((memberId) => <Badge key={memberId} variant="secondary">@{memberId}</Badge>)}</div>}<Button size="sm" variant="ghost" disabled={locked} onClick={() => selectReply(message)}>{frontendText(locale, "MESSAGES_REPLY")}</Button></CardContent></Card>)}
    </div>
    <DiscussionCursorPagination locale={locale} page={page} limit={limit} pending={pending} hasNext={Boolean(state.nextCursor)} onPrevious={onPrevious} onNext={() => state.nextCursor && onNext(state.nextCursor)} onLimitChange={onLimitChange} />
    <DiscussionComposer operationKey={submitControllerRef.current.operationKey()} onLookup={onLookup ? checkResult : undefined} locale={locale} body={body} status={status} locked={locked} replyTo={replyTo} onBodyChange={(value) => draft.edit("body", value)} onCancelReply={() => selectReply(null)} onSubmit={submit} />
  </section>;
}

function DiscussionComposer({ locale, body, status, locked, replyTo, onBodyChange, onCancelReply, onSubmit, operationKey, onLookup }: {
  locale: LocaleRuntime;
  body: string;
  status: "idle" | "pending" | "checking" | "error";
  locked: boolean;
  replyTo: Pick<DiscussionMessage, "id" | "authorMemberId"> | null;
  operationKey: string | null;
  onLookup?: () => Promise<void>;
  onBodyChange: (body: string) => void;
  onCancelReply: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  return <form className="space-y-2 rounded-lg border bg-card p-3" onSubmit={(event) => void onSubmit(event)}>
    {replyTo && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{frontendText(locale, "MESSAGES_REPLYING_TO")} {replyTo.authorMemberId}</span><button type="button" className="text-primary hover:underline" disabled={locked} onClick={onCancelReply}>{frontendText(locale, "MESSAGES_CANCEL_REPLY")}</button></div>}
    {status === "error" && <Alert variant="destructive"><AlertTitle>{frontendText(locale, "MESSAGES_SEND_ERROR")}</AlertTitle></Alert>}
    {operationKey && <div className="space-y-2 text-xs text-muted-foreground"><p>{frontendText(locale, "MESSAGES_OPERATION_KEY")} <code className="break-all">{operationKey}</code></p>{onLookup && <Button type="button" variant="outline" disabled={status === "pending" || status === "checking"} onClick={() => void onLookup()}>{frontendText(locale, status === "checking" ? "MESSAGES_CHECKING_RESULT" : "MESSAGES_CHECK_RESULT")}</Button>}</div>}
    <label className="block text-sm font-medium" htmlFor="discussion-composer">{frontendText(locale, "MESSAGES_COMPOSER_LABEL")}</label>
    <textarea id="discussion-composer" value={body} onChange={(event) => onBodyChange(event.currentTarget.value)} maxLength={5_000} disabled={locked} className="min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={frontendText(locale, "MESSAGES_COMPOSER_PLACEHOLDER")} />
    <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{frontendText(locale, "MESSAGES_MENTION_HINT")}</p><Button type="submit" disabled={status === "pending" || status === "checking" || !body.trim()}>{status === "pending" ? frontendText(locale, "MESSAGES_SENDING") : frontendText(locale, status === "error" ? "MESSAGES_RETRY_SEND" : "MESSAGES_SEND")}</Button></div>
  </form>;
}

function discussionComposerInput(
  thread: DiscussionThread,
  body: string,
  replyId: string,
): Omit<DiscussionSendInput, "clientKey"> | null {
  const normalized = body.trim();
  if (!normalized) return null;
  return {
    context: { kind: thread.contextKind, id: thread.contextId },
    body: normalized,
    ...(replyId ? { replyToMessageId: replyId } : {}),
    mentionMemberIds: mentionIdsFromBody(normalized),
  };
}

export function DiscussionCursorPagination({ locale, page, limit, pending, hasNext, onPrevious, onNext, onLimitChange }: { locale: LocaleRuntime; page: number; limit: 20 | 50; pending: boolean; hasNext: boolean; onPrevious: () => void; onNext: () => void; onLimitChange: (limit: 20 | 50) => void }) {
  const labels = frontendPaginationLabels(locale);
  return <nav aria-label={labels.navigationLabel} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-sm text-muted-foreground">{labels.pageLabel(page)}</p><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm text-muted-foreground"><span>{labels.pageSizeLabel}</span><Select aria-label={labels.pageSizeLabel} value={String(limit)} disabled={pending} onChange={(event) => onLimitChange(Number(event.currentTarget.value) as 20 | 50)}><SelectOption value="20">20</SelectOption><SelectOption value="50">50</SelectOption></Select></label><Button type="button" variant="outline" aria-label={labels.previousLabel} disabled={pending || page <= 1} onClick={onPrevious}>{labels.previousLabel}</Button><Button type="button" variant="outline" aria-label={labels.nextLabel} disabled={pending || !hasNext} onClick={onNext}>{labels.nextLabel}</Button></div></nav>;
}
