import { useInboxActionConfirmation } from "../components/inbox-action-confirmation";
import { DataTable } from "../components/data-table";
import type { FrontendPageMetadata } from "../lib/numbered-page";
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

export function InboxPage({ locale, state, pending = false, actionError, onRetry, onCreate, onStatusChange, onPromoteTask, onOpenTask, status, onFilterChange, onLoadMore, createMemberId, onCreateReadback, onCreateDenied, onCreateLock, capturePending }: InboxCreateCallbacks & {
  locale: LocaleRuntime; state: InboxPageState; pending?: boolean; actionError?: string; onRetry?: () => void;
  capturePending?: boolean;
  onStatusChange?: (item: InboxItem) => void; onPromoteTask?: (item: InboxItem) => void; onOpenTask?: (item: InboxItem) => void; status?: InboxStatus; onFilterChange: (status?: InboxStatus) => void; onLoadMore?: () => void;
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
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(item) => item.id}
      ariaLabel={frontendText(locale, "INBOX_TITLE")}
      loadingMoreLabel={frontendText(locale, "INBOX_LOAD_MORE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "INBOX_EMPTY")} />}
      loading={controlsPending}
      hasMore={!!onLoadMore && state.pagination.page < state.pagination.totalPages}
      onLoadMore={onLoadMore && (() => { if (!controlsPending && !confirmation.isOpen()) onLoadMore(); })}
      rowHeight={112}
      columns={[
        { key: "content", header: frontendText(locale, "INBOX_CONTENT"), cellClassName: "whitespace-normal", cell: (item) => <div className="space-y-1 py-1"><Badge variant={item.status === "promoted" ? "default" : "secondary"}>{frontendText(locale, item.status === "promoted" ? "INBOX_STATUS_PROMOTED" : item.status === "archived" ? "INBOX_STATUS_ARCHIVED" : "INBOX_STATUS_INBOX")}</Badge><p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">{item.content}</p></div> },
        { key: "source", header: frontendText(locale, "INBOX_KIND"), width: "220px", cellClassName: "whitespace-normal", cell: (item) => <div className="space-y-1 py-1"><Badge variant="outline">{item.kind === "link" ? <LinkIcon size={12} className="mr-1" /> : <Note size={12} className="mr-1" />}{item.kind === "link" ? frontendText(locale, "INBOX_KIND_LINK") : frontendText(locale, "INBOX_KIND_TEXT")}</Badge>{item.sourceUrl && <a className="line-clamp-1 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}<ArrowUpRight size={12} /></a>}</div> },
        { key: "createdAt", header: frontendText(locale, "INBOX_COLUMN_TIME"), width: "160px", cellClassName: "whitespace-normal", cell: (item) => <time className="text-xs text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleDateString(locale.locale) : ""}</time> },
        { key: "actions", header: frontendText(locale, "INBOX_COLUMN_ACTIONS"), width: "240px", cellClassName: "whitespace-normal", cell: (item) => item.status === "promoted" ? (item.promotedTaskId ? <Button type="button" size="sm" variant="outline" disabled={controlsPending} onClick={() => { if (!controlsPending && !confirmation.isOpen()) onOpenTask?.(item); }}>{frontendText(locale, "INBOX_OPEN_TASK")}</Button> : null) : <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={controlsPending} onClick={() => confirmation.request(item, "status")}><Archive size={14} className="mr-1" />{item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE")}</Button><Button type="button" size="sm" disabled={controlsPending} onClick={() => confirmation.request(item, "task")}>{frontendText(locale, "INBOX_PROMOTE_TASK")}</Button></div> },
      ]}
    />
  </section>{confirmation.dialog}</>;
}
