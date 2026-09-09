import { useState } from "react";
import { Archive, ArrowUpRight, Link as LinkIcon, Note, Plus, Tray } from "@phosphor-icons/react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { PageState } from "../components/ui/page-state";
import { Textarea } from "../components/ui/textarea";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { InboxItem } from "../lib/inbox-data";

export type InboxPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly InboxItem[]; nextCursor?: string };

export function InboxPage({ locale, state, pending = false, actionError, onRetry, onCreate, onStatusChange, onPromoteTask, onLoadMore }: {
  locale: LocaleRuntime; state: InboxPageState; pending?: boolean; actionError?: string; onRetry?: () => void;
  onCreate?: (input: { kind: "text" | "link"; content: string; sourceUrl?: string | null }) => void;
  onStatusChange?: (item: InboxItem) => void; onPromoteTask?: (item: InboxItem) => void; onLoadMore?: () => void;
}) {
  const [kind, setKind] = useState<"text" | "link">("text");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const submit = () => { if (!content.trim()) return; onCreate?.({ kind, content: content.trim(), ...(kind === "link" && sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}) }); setContent(""); setSourceUrl(""); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "INBOX_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></PageState>;
  return <section className="space-y-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Tray size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "INBOX_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "INBOX_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "INBOX_PRIVATE_BADGE")}</Badge></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "INBOX_CAPTURE_TITLE")}</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><select aria-label={frontendText(locale, "INBOX_KIND")} className="h-10 rounded-md border bg-background px-3 text-sm" value={kind} onChange={(event) => setKind(event.currentTarget.value as "text" | "link")}><option value="text">{frontendText(locale, "INBOX_KIND_TEXT")}</option><option value="link">{frontendText(locale, "INBOX_KIND_LINK")}</option></select>{kind === "link" && <Input aria-label={frontendText(locale, "INBOX_SOURCE_URL")} value={sourceUrl} onChange={(event) => setSourceUrl(event.currentTarget.value)} placeholder={frontendText(locale, "INBOX_SOURCE_URL")} className="min-w-[15rem] flex-1" />}</div><Textarea aria-label={frontendText(locale, "INBOX_CONTENT")} value={content} onChange={(event) => setContent(event.currentTarget.value)} placeholder={frontendText(locale, "INBOX_CONTENT_PLACEHOLDER")} rows={4} /><Button type="button" onClick={submit} disabled={pending || !content.trim()}>{frontendText(locale, "INBOX_CAPTURE")}</Button></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.items.length ? <div className="space-y-3">{state.items.map((item) => <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{item.kind === "link" ? <LinkIcon size={12} className="mr-1" /> : <Note size={12} className="mr-1" />}{item.kind === "link" ? frontendText(locale, "INBOX_KIND_LINK") : frontendText(locale, "INBOX_KIND_TEXT")}</Badge><Badge variant={item.status === "promoted" ? "default" : "secondary"}>{frontendText(locale, item.status === "promoted" ? "INBOX_STATUS_PROMOTED" : item.status === "archived" ? "INBOX_STATUS_ARCHIVED" : "INBOX_STATUS_INBOX")}</Badge></div><p className="whitespace-pre-wrap break-words text-sm">{item.content}</p>{item.sourceUrl && <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}<ArrowUpRight size={12} /></a>}</div><time className="shrink-0 text-xs text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleDateString(locale.locale) : ""}</time></div>{item.status !== "promoted" && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => onStatusChange?.(item)}><Archive size={14} className="mr-1" />{item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE")}</Button><Button type="button" size="sm" onClick={() => onPromoteTask?.(item)}>{frontendText(locale, "INBOX_PROMOTE_TASK")}</Button></div>}</CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "INBOX_EMPTY")} />}
    {state.nextCursor && <div className="flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={pending}>{frontendText(locale, "INBOX_LOAD_MORE")}</Button></div>}
  </section>;
}
