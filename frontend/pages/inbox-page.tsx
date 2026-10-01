import { useInboxActionConfirmation } from "../components/inbox-action-confirmation";
import { DataPagination } from "../components/data-pagination";
import type { FrontendPageMetadata, SupportedPageSize } from "../lib/numbered-page";
import type { InboxStatus } from "../lib/inbox-data";
import { InboxCreateForm, type InboxCreateCallbacks } from "../components/inbox-create-form";
import { Archive, ArrowUpRight, Link as LinkIcon, Note, Plus, Tray } from "@phosphor-icons/react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { InboxItem } from "../lib/inbox-data";

export type InboxPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly InboxItem[]; pagination: FrontendPageMetadata };

export function InboxPage({ locale, state, pending = false, actionError, onRetry, onCreate, onStatusChange, onPromoteTask, onOpenTask, status, onFilterChange, onPageChange, onPageSizeChange, createMemberId, onCreateReadback, onCreateDenied, onCreateLock, capturePending }: InboxCreateCallbacks & {
  locale: LocaleRuntime; state: InboxPageState; pending?: boolean; actionError?: string; onRetry?: () => void;
  capturePending?: boolean;
  onStatusChange?: (item: InboxItem) => void; onPromoteTask?: (item: InboxItem) => void; onOpenTask?: (item: InboxItem) => void; status?: InboxStatus; onFilterChange: (status?: InboxStatus) => void; onPageChange: (page: number) => void; onPageSizeChange: (size: SupportedPageSize) => void;
}) {
  const confirmation = useInboxActionConfirmation({ locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId, filter: status,
    blocked: pending || !!capturePending, onStatusChange, onPromoteTask });
  const controlsPending = pending || !!capturePending || confirmation.open;
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "INBOX_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></PageState>;
  return <><section className="space-y-5" inert={confirmation.open ? true : undefined}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Tray size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "INBOX_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "INBOX_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "INBOX_PRIVATE_BADGE")}</Badge></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "INBOX_CAPTURE_TITLE")}</CardTitle></CardHeader><CardContent className="space-y-3"><InboxCreateForm locale={locale} createMemberId={createMemberId} pending={(capturePending ?? pending) || confirmation.open} isSubmitBlocked={confirmation.isOpen} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={onCreateLock} /></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    <label className="flex items-center gap-2 text-sm"><span>{frontendText(locale, "INBOX_STATUS_FILTER")}</span><select aria-label={frontendText(locale, "INBOX_STATUS_FILTER")} className="h-10 rounded-md border bg-background px-3" value={status ?? ""} disabled={controlsPending} onChange={event => { if (!controlsPending && !confirmation.isOpen()) onFilterChange((event.currentTarget.value || undefined) as InboxStatus | undefined); }}><option value="">{frontendText(locale, "INBOX_STATUS_ALL")}</option><option value="inbox">{frontendText(locale, "INBOX_STATUS_INBOX")}</option><option value="archived">{frontendText(locale, "INBOX_STATUS_ARCHIVED")}</option><option value="promoted">{frontendText(locale, "INBOX_STATUS_PROMOTED")}</option></select></label>
    {state.items.length ? <div className="space-y-3">{state.items.map((item) => <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{item.kind === "link" ? <LinkIcon size={12} className="mr-1" /> : <Note size={12} className="mr-1" />}{item.kind === "link" ? frontendText(locale, "INBOX_KIND_LINK") : frontendText(locale, "INBOX_KIND_TEXT")}</Badge><Badge variant={item.status === "promoted" ? "default" : "secondary"}>{frontendText(locale, item.status === "promoted" ? "INBOX_STATUS_PROMOTED" : item.status === "archived" ? "INBOX_STATUS_ARCHIVED" : "INBOX_STATUS_INBOX")}</Badge></div><p className="whitespace-pre-wrap break-words text-sm">{item.content}</p>{item.sourceUrl && <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}<ArrowUpRight size={12} /></a>}</div><time className="shrink-0 text-xs text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleDateString(locale.locale) : ""}</time></div>{item.status === "promoted" && item.promotedTaskId && <Button type="button" size="sm" variant="outline" disabled={controlsPending} onClick={() => { if (!controlsPending && !confirmation.isOpen()) onOpenTask?.(item); }}>{frontendText(locale, "INBOX_OPEN_TASK")}</Button>}{item.status !== "promoted" && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={controlsPending} onClick={() => confirmation.request(item, "status")}><Archive size={14} className="mr-1" />{item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE")}</Button><Button type="button" size="sm" disabled={controlsPending} onClick={() => confirmation.request(item, "task")}>{frontendText(locale, "INBOX_PROMOTE_TASK")}</Button></div>}</CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "INBOX_EMPTY")} />}
    <DataPagination locale={locale} {...state.pagination} visibleCount={state.items.length} maxPage={Math.ceil(10000 / state.pagination.pageSize)} pending={controlsPending} onPageChange={page => { if (!controlsPending && !confirmation.isOpen()) onPageChange(page); }} onPageSizeChange={size => { if (!controlsPending && !confirmation.isOpen()) onPageSizeChange(size); }} />
  </section>{confirmation.dialog}</>;
}
