import { Alert, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/data-table";
import { PageState } from "../../components/ui/page-state";
import { Select, SelectOption } from "../../components/ui/select";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType, type NotificationFilters, type NotificationItem, type NotificationSummary } from "../../lib/notifications-data";
import type { SupportedPageSize } from "../../lib/numbered-page";
import { notificationEventKey, notificationTargetHref } from "./notification-model";

type Pagination = { page: number; pageSize: SupportedPageSize; total: number; totalPages: number };
export type NotificationsPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "recovery" }
  | { kind: "forbidden" }
  | { kind: "ready"; items: readonly NotificationItem[]; pagination: Pagination };

export function NotificationsPage({ locale, state, summary, filters, pending = false, actionPending = false, actionError, recordBlocked = false, onDiscardRecord, onRetry, onFilterChange, onLoadMore, onPageChange, onPageSizeChange, onMarkRead, onMarkVisibleRead, onOpen }: {
  locale: LocaleRuntime;
  state: NotificationsPageState;
  summary: NotificationSummary | null;
  filters: NotificationFilters;
  pending?: boolean;
  actionPending?: boolean;
  actionError?: string;
  recordBlocked?: boolean;
  onDiscardRecord?: () => void;
  onRetry: () => void;
  onFilterChange: (filters: NotificationFilters) => void;
  onLoadMore?: () => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: SupportedPageSize) => void;
  onMarkRead: (id: string) => void;
  onMarkVisibleRead: (ids: readonly string[]) => void;
  onOpen: (id: string) => void;
}) {
  if (state.kind === "loading") return <div><span className="sr-only">{frontendText(locale, "NOTIFICATIONS_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "NOTIFICATIONS_LOADING")} /></div>;
  if (state.kind === "recovery") return <PageState kind="error" title={frontendText(locale, "NOTIFICATIONS_ACTION_FAILED")} description={frontendText(locale, "NOTIFICATIONS_RECOVERY_DESCRIPTION")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button></PageState>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "NOTIFICATIONS_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button></PageState>;
  if (state.kind === "forbidden") return <PageState kind="forbidden" title={frontendText(locale, "NOTIFICATIONS_FORBIDDEN")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button></PageState>;
  const visibleUnreadIds = state.items.filter((item) => item.readAt === null).map((item) => item.id).slice(0, 100);
  const actionsDisabled = pending || actionPending || recordBlocked;
  return <section className="flex flex-col space-y-5 lg:h-full lg:min-h-0">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{frontendText(locale, "NOTIFICATIONS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "NOTIFICATIONS_DESCRIPTION")}</p></div>
      <p className="text-sm font-medium" aria-live="polite">{frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} {summary?.unread ?? 0}</p>
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
      <Select aria-label={frontendText(locale, "NOTIFICATIONS_READ_FILTER")} value={filters.read ?? ""} disabled={pending} onChange={(event) => onFilterChange({ ...filters, read: readFilter(event.currentTarget.value) })}>
        <SelectOption value="">{frontendText(locale, "NOTIFICATIONS_FILTER_ALL")}</SelectOption>
        <SelectOption value="unread">{frontendText(locale, "NOTIFICATIONS_FILTER_UNREAD")}</SelectOption>
        <SelectOption value="read">{frontendText(locale, "NOTIFICATIONS_FILTER_READ")}</SelectOption>
      </Select>
      <Select aria-label={frontendText(locale, "NOTIFICATIONS_TYPE_FILTER")} value={filters.eventType ?? ""} disabled={pending} onChange={(event) => onFilterChange({ ...filters, eventType: eventFilter(event.currentTarget.value) })}>
        <SelectOption value="">{frontendText(locale, "NOTIFICATIONS_FILTER_ALL")}</SelectOption>
        {NOTIFICATION_EVENT_TYPES.map((eventType) => <SelectOption key={eventType} value={eventType}>{frontendText(locale, notificationEventKey(eventType))}</SelectOption>)}
      </Select>
      <Button variant="outline" disabled={pending || actionPending || recordBlocked || visibleUnreadIds.length === 0} onClick={() => onMarkVisibleRead(visibleUnreadIds)}>{frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ")}</Button>
    </div>
    {recordBlocked && <Alert variant="destructive" data-notification-update-record-blocked="">
      <AlertTitle>{frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_BLOCKED")}</AlertTitle>
      <div className="mt-3"><Button variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_DISCARD")}</Button></div>
    </Alert>}
    {actionError && <Alert variant="destructive"><AlertTitle>{actionError}</AlertTitle></Alert>}
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(item: NotificationItem) => item.id}
      ariaLabel={frontendText(locale, "NOTIFICATIONS_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "NOTIFICATIONS_EMPTY")} />}
      loading={pending}
      pagination={state.pagination}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      hasMore={state.pagination.page < state.pagination.totalPages}
      onLoadMore={onLoadMore}
      fill
      rowHeight={72}
      columns={[
        { key: "notification", header: frontendText(locale, "NOTIFICATIONS_COLUMN_NOTIFICATION"), cellClassName: "whitespace-normal", cell: (item: NotificationItem) => <div data-notification-id={item.id} data-read={item.readAt === null ? "false" : "true"} className="min-w-0 space-y-1 py-1">
          <p className="line-clamp-1 font-medium">{(typeof item.payload.title === "string" ? item.payload.title.trim() : "") || frontendText(locale, notificationEventKey(item.eventType))}</p>
          <p className="line-clamp-1 text-sm text-muted-foreground">{frontendText(locale, notificationEventKey(item.eventType))}</p>
        </div> },
        { key: "createdAt", header: frontendText(locale, "NOTIFICATIONS_COLUMN_TIME"), width: "200px", cellClassName: "whitespace-normal", cell: (item: NotificationItem) => <time className="line-clamp-1 text-xs text-muted-foreground" dateTime={item.createdAt}>{item.createdAt}</time> },
        { key: "status", header: frontendText(locale, "NOTIFICATIONS_COLUMN_STATUS"), width: "120px", cell: (item: NotificationItem) => <Badge variant={item.readAt === null ? "default" : "outline"}>{frontendText(locale, item.readAt === null ? "NOTIFICATIONS_UNREAD" : "NOTIFICATIONS_READ")}</Badge> },
        { key: "actions", header: frontendText(locale, "NOTIFICATIONS_COLUMN_ACTIONS"), width: "260px", cellClassName: "whitespace-normal", cell: (item: NotificationItem) => {
          const href = notificationTargetHref(item);
          return <div className="flex flex-wrap items-center gap-2 py-1">
            {href ? <Button variant="outline" disabled={actionsDisabled} onClick={() => onOpen(item.id)}>{frontendText(locale, "NOTIFICATIONS_OPEN")}</Button> : <p className="text-sm text-muted-foreground">{frontendText(locale, "NOTIFICATIONS_TARGET_UNAVAILABLE")}</p>}
            {item.readAt === null && <Button variant="outline" disabled={actionsDisabled} onClick={() => onMarkRead(item.id)}>{frontendText(locale, "NOTIFICATIONS_MARK_READ")}</Button>}
          </div>;
        } },
      ]}
    />
  </section>;
}

function readFilter(value: string): NotificationFilters["read"] {
  return value === "read" || value === "unread" ? value : undefined;
}

function eventFilter(value: string): NotificationEventType | undefined {
  return NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType) ? value as NotificationEventType : undefined;
}
