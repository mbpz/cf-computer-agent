import { Bell } from "@phosphor-icons/react";
import { Alert, AlertTitle } from "../../components/ui/alert";
import { AppliedFilters, type AppliedFilter } from "../../components/ui/applied-filters";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/data-table";
import { FilterSelect } from "../../components/ui/filter-select";
import { FilterDisclosure } from "../../components/ui/filter-disclosure";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
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

export function NotificationsPage({ locale, state, summary, filters, pending = false, actionPending = false, actionError, recordBlocked = false, revokedTarget = false, onDiscardRecord, onRetry, onFilterChange, onLoadMore, onPageChange, onPageSizeChange, onMarkRead, onMarkVisibleRead, onOpen }: {
  locale: LocaleRuntime;
  state: NotificationsPageState;
  summary: NotificationSummary | null;
  filters: NotificationFilters;
  pending?: boolean;
  actionPending?: boolean;
  actionError?: string;
  recordBlocked?: boolean;
  /** A notification was opened whose target access was revoked; its content stays hidden. */
  revokedTarget?: boolean;
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
  const ready = state.kind === "ready";
  const visibleUnreadIds = ready ? state.items.filter((item) => item.readAt === null).map((item) => item.id).slice(0, 100) : [];
  const actionsDisabled = pending || actionPending || recordBlocked;
  const readOptions = [
    { value: "", label: frontendText(locale, "NOTIFICATIONS_FILTER_ALL") },
    { value: "unread", label: frontendText(locale, "NOTIFICATIONS_FILTER_UNREAD") },
    { value: "read", label: frontendText(locale, "NOTIFICATIONS_FILTER_READ") },
  ];
  const typeOptions = [
    { value: "", label: frontendText(locale, "NOTIFICATIONS_FILTER_ALL") },
    ...NOTIFICATION_EVENT_TYPES.map((eventType) => ({ value: eventType as string, label: frontendText(locale, notificationEventKey(eventType)) })),
  ];
  // Every applied condition stays visible as removable text; the same handler the control uses applies it.
  const appliedFilters: AppliedFilter[] = [];
  if (filters.read) appliedFilters.push({ id: "read", label: `${frontendText(locale, "NOTIFICATIONS_READ_FILTER")}: ${frontendText(locale, filters.read === "read" ? "NOTIFICATIONS_FILTER_READ" : "NOTIFICATIONS_FILTER_UNREAD")}`, onRemove: () => onFilterChange({ ...filters, read: undefined }) });
  if (filters.eventType) appliedFilters.push({ id: "event-type", label: `${frontendText(locale, "NOTIFICATIONS_TYPE_FILTER")}: ${frontendText(locale, notificationEventKey(filters.eventType))}`, onRemove: () => onFilterChange({ ...filters, eventType: undefined }) });
  // The page shell (header, filters and applied conditions) renders for every state; only
  // the content slot branches, so a first load or a read failure never unmounts the toolbar.
  return <section className="flex flex-col space-y-5 lg:h-full lg:min-h-0">
    <PageHeader
      icon={<Bell size={22} weight="duotone" className="text-primary" />}
      title={frontendText(locale, "NOTIFICATIONS_TITLE")}
      description={frontendText(locale, "NOTIFICATIONS_DESCRIPTION")}
      /* The server unread total only describes a loaded window; it stays hidden while
         loading, in read-only recovery, on a read failure or a revoked read. */
      actions={ready && <p className="text-sm font-medium" aria-live="polite">{frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} {summary?.unread ?? 0}</p>}
    />
    <FilterDisclosure label={frontendText(locale, "COMMON_FILTERS")} appliedCount={appliedFilters.length} rowClassName="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
      <FilterSelect label={frontendText(locale, "NOTIFICATIONS_READ_FILTER")} ariaLabel={frontendText(locale, "NOTIFICATIONS_READ_FILTER")} value={filters.read ?? ""} disabled={pending} onChange={(value) => onFilterChange({ ...filters, read: readFilter(value) })} options={readOptions} />
      <FilterSelect label={frontendText(locale, "NOTIFICATIONS_TYPE_FILTER")} ariaLabel={frontendText(locale, "NOTIFICATIONS_TYPE_FILTER")} value={filters.eventType ?? ""} disabled={pending} onChange={(value) => onFilterChange({ ...filters, eventType: eventFilter(value) })} options={typeOptions} />
    </FilterDisclosure>
    {/* The bulk action is an action, not a condition: it stays in the page on
        both surfaces instead of moving behind the mobile filter disclosure. */}
    {ready && <Button variant="outline" className="max-lg:h-11" disabled={actionsDisabled || visibleUnreadIds.length === 0} onClick={() => onMarkVisibleRead(visibleUnreadIds)}>{frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ")}</Button>}
    <AppliedFilters ariaLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")} clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")} filters={appliedFilters} onClear={() => onFilterChange({})} />
    {recordBlocked && <Alert variant="destructive" data-notification-update-record-blocked="">
      <AlertTitle>{frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_BLOCKED")}</AlertTitle>
      <div className="mt-3"><Button variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_DISCARD")}</Button></div>
    </Alert>}
    {actionError && <Alert variant="destructive"><AlertTitle>{actionError}</AlertTitle></Alert>}
    {/* An opened notification whose target lost access is an explicit, recoverable
        state: nothing about the target renders, and retry re-checks the list. */}
    {revokedTarget && <section data-notification-target-revoked="" aria-live="polite">
      <PageState kind="forbidden" title={frontendText(locale, "NOTIFICATIONS_TARGET_UNAVAILABLE")} description={frontendText(locale, "NOTIFICATIONS_TARGET_REVOKED_DESCRIPTION")}>
        <Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button>
      </PageState>
    </section>}
    {state.kind === "loading" && <div><span className="sr-only">{frontendText(locale, "NOTIFICATIONS_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "NOTIFICATIONS_LOADING")} /></div>}
    {state.kind === "recovery" && <PageState kind="error" title={frontendText(locale, "NOTIFICATIONS_ACTION_FAILED")} description={frontendText(locale, "NOTIFICATIONS_RECOVERY_DESCRIPTION")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button></PageState>}
    {state.kind === "error" && <PageState kind="error" title={frontendText(locale, "NOTIFICATIONS_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button></PageState>}
    {state.kind === "forbidden" && <PageState kind="forbidden" title={frontendText(locale, "NOTIFICATIONS_FORBIDDEN")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button></PageState>}
    {state.kind === "ready" && <DataTable
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
    />}
  </section>;
}

function readFilter(value: string): NotificationFilters["read"] {
  return value === "read" || value === "unread" ? value : undefined;
}

function eventFilter(value: string): NotificationEventType | undefined {
  return NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType) ? value as NotificationEventType : undefined;
}
