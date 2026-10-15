import { useId, useState } from "react";
import { useInboxActionConfirmation } from "../components/inbox-action-confirmation";
import { DataTable } from "../components/data-table";
import type { FrontendPageMetadata, SupportedPageSize } from "../lib/numbered-page";
import type { InboxStatus } from "../lib/inbox-data";
import { InboxCreateForm, type InboxCreateCallbacks } from "../components/inbox-create-form";
import { loadInboxIntent } from "../lib/inbox-create-intent";
import { loadInboxDraft } from "../lib/inbox-draft";
import { Archive, ArrowUpRight, Link as LinkIcon, Note, Plus, Tray } from "@phosphor-icons/react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { InboxItem } from "../lib/inbox-data";

export type InboxPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly InboxItem[]; pagination: FrontendPageMetadata };

export function InboxPage({ locale, state, pending = false, actionError, onRetry, onCreate, onStatusChange, onPromoteTask, onOpenTask, status, onFilterChange, onLoadMore, onPageChange, onPageSizeChange, createMemberId, onCreateReadback, onCreateDenied, onCreateLock, capturePending }: InboxCreateCallbacks & {
  locale: LocaleRuntime; state: InboxPageState; pending?: boolean; actionError?: string; onRetry?: () => void;
  capturePending?: boolean;
  onStatusChange?: (item: InboxItem) => void; onPromoteTask?: (item: InboxItem) => void; onOpenTask?: (item: InboxItem) => void; status?: InboxStatus; onFilterChange: (status?: InboxStatus) => void; onLoadMore?: () => void;
  onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void;
}) {
  const confirmation = useInboxActionConfirmation({ locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId, filter: status,
    blocked: pending || !!capturePending, onStatusChange, onPromoteTask });
  // A record that is not a clean empty draft may be an unresolved write or an unreadable
  // composer record from this tab: reopen the composer so its recovery controls are in
  // reach instead of silently hidden behind the trigger.
  const [captureOpen, setCaptureOpen] = useState(() => !createMemberId || loadInboxIntent(createMemberId).kind !== "empty" || loadInboxDraft(createMemberId).kind === "blocked");
  const [captureLocked, setCaptureLocked] = useState(false);
  const captureTitleId = useId();
  const captureDescriptionId = useId();
  const controlsPending = pending || !!capturePending || confirmation.open;
  const guard = (run: () => void) => { if (!controlsPending && !confirmation.isOpen()) run(); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "INBOX_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></PageState>;
  return <><section className="flex flex-col gap-4 lg:h-full lg:min-h-0" inert={confirmation.open || captureOpen ? true : undefined}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Tray size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "INBOX_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "INBOX_DESCRIPTION")}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{frontendText(locale, "INBOX_PRIVATE_BADGE")}</Badge><Button type="button" data-inbox-capture-open aria-haspopup="dialog" aria-expanded={captureOpen} onClick={() => setCaptureOpen(true)} {...(captureLocked ? { "data-inbox-capture-pending": "" } : {})}><Plus size={16} weight="bold" className="mr-1" aria-hidden="true" />{frontendText(locale, "INBOX_CAPTURE_TITLE")}</Button></div></div>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    <div className="flex flex-wrap items-center gap-2 text-sm"><label className="flex items-center gap-2"><span>{frontendText(locale, "INBOX_STATUS_FILTER")}</span><select aria-label={frontendText(locale, "INBOX_STATUS_FILTER")} className="h-10 rounded-md border bg-background px-3" value={status ?? ""} disabled={controlsPending} onChange={event => { const next = (event.currentTarget.value || undefined) as InboxStatus | undefined; guard(() => onFilterChange(next)); }}><option value="">{frontendText(locale, "INBOX_STATUS_ALL")}</option><option value="inbox">{frontendText(locale, "INBOX_STATUS_INBOX")}</option><option value="archived">{frontendText(locale, "INBOX_STATUS_ARCHIVED")}</option><option value="promoted">{frontendText(locale, "INBOX_STATUS_PROMOTED")}</option></select></label></div>
    <DataTable
      locale={locale}
      className="lg:min-h-0 lg:flex-1"
      fill
      rows={state.items}
      rowId={(item) => item.id}
      ariaLabel={frontendText(locale, "INBOX_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "INBOX_EMPTY")} />}
      loading={controlsPending}
      pagination={state.pagination}
      onPageChange={page => guard(() => onPageChange?.(page))}
      onPageSizeChange={pageSize => guard(() => onPageSizeChange?.(pageSize))}
      hasMore={state.pagination.page < state.pagination.totalPages}
      onLoadMore={onLoadMore && (() => guard(onLoadMore))}
      rowHeight={112}
      columns={[
        { key: "content", header: frontendText(locale, "INBOX_CONTENT"), cellClassName: "whitespace-normal", cell: (item) => <div className="space-y-1 py-1"><Badge variant={item.status === "promoted" ? "default" : "secondary"}>{frontendText(locale, item.status === "promoted" ? "INBOX_STATUS_PROMOTED" : item.status === "archived" ? "INBOX_STATUS_ARCHIVED" : "INBOX_STATUS_INBOX")}</Badge><p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">{item.content}</p></div> },
        { key: "source", header: frontendText(locale, "INBOX_KIND"), width: "220px", cellClassName: "whitespace-normal", cell: (item) => <div className="space-y-1 py-1"><Badge variant="outline">{item.kind === "link" ? <LinkIcon size={12} className="mr-1" /> : <Note size={12} className="mr-1" />}{item.kind === "link" ? frontendText(locale, "INBOX_KIND_LINK") : frontendText(locale, "INBOX_KIND_TEXT")}</Badge>{item.sourceUrl && <a className="line-clamp-1 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}<ArrowUpRight size={12} /></a>}</div> },
        { key: "createdAt", header: frontendText(locale, "INBOX_COLUMN_TIME"), width: "160px", cellClassName: "whitespace-normal", cell: (item) => <time className="text-xs text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleDateString(locale.locale) : ""}</time> },
        { key: "actions", header: frontendText(locale, "INBOX_COLUMN_ACTIONS"), width: "240px", cellClassName: "whitespace-normal", cell: (item) => item.status === "promoted" ? (item.promotedTaskId ? <Button type="button" size="sm" variant="outline" aria-label={frontendText(locale, "INBOX_OPEN_TASK")} disabled={controlsPending} onClick={() => guard(() => onOpenTask?.(item))}>{frontendText(locale, "INBOX_OPEN_TASK")}</Button> : null) : <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" aria-label={item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE")} disabled={controlsPending} onClick={() => confirmation.request(item, "status")}><Archive size={14} className="mr-1" aria-hidden="true" />{item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE")}</Button><Button type="button" size="sm" aria-label={frontendText(locale, "INBOX_PROMOTE_TASK")} disabled={controlsPending} onClick={() => confirmation.request(item, "task")}>{frontendText(locale, "INBOX_PROMOTE_TASK")}</Button></div> },
      ]}
    />
  </section>
  <Dialog open={captureOpen} onOpenChange={next => { if (!next) setCaptureOpen(false); }}>
    {captureOpen && <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" onClick={() => setCaptureOpen(false)} />}
    <DialogContent role="dialog" data-inbox-capture-dialog aria-labelledby={captureTitleId} aria-describedby={captureDescriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={captureTitleId}>{frontendText(locale, "INBOX_CAPTURE_TITLE")}</DialogTitle>
      <p id={captureDescriptionId} className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "INBOX_DESCRIPTION")}</p>
      <div className="mt-4"><InboxCreateForm locale={locale} createMemberId={createMemberId} pending={(capturePending ?? pending) || confirmation.open} isSubmitBlocked={confirmation.isOpen} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={locked => { setCaptureLocked(locked); onCreateLock?.(locked); }} onCreated={() => setCaptureOpen(false)} /></div>
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" data-capture-cancel variant="outline" onClick={() => setCaptureOpen(false)}>{frontendText(locale, "COMMON_CANCEL")}</Button></div>
    </DialogContent>
  </Dialog>
  {confirmation.dialog}</>;
}
