import { Bell } from "@phosphor-icons/react";
import { useEffect, useRef, type UIEvent } from "react";
import { Alert, AlertTitle } from "../../components/ui/alert";
import { AppliedFilters, type AppliedFilter } from "../../components/ui/applied-filters";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DataPagination } from "../../components/data-pagination";
import { NotificationStack } from "../../components/motion/notification-stack";
import { OverflowActions, type OverflowActionItem } from "../../components/motion/overflow-actions";
import { FilterSelect } from "../../components/ui/filter-select";
import { FilterDisclosure } from "../../components/ui/filter-disclosure";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { useListMode } from "../../lib/list-mode";
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
  // The beUI stack is the list surface in both shapes: the desktop footer
  // carries the 20/50/100 pager, while narrow viewports keep appending from
  // the scroll container. The route owns both request paths.
  const desktop = useListMode() === "desktop";
  const hasMore = ready && state.pagination.page < state.pagination.totalPages;
  const feedEndReached = useRef(false);
  useEffect(() => { if (!pending) feedEndReached.current = false; }, [pending, state.kind]);
  const onFeedScroll = (event: UIEvent<HTMLDivElement>) => {
    if (desktop || !onLoadMore || pending || !hasMore || feedEndReached.current) return;
    const node = event.currentTarget;
    if (node.scrollHeight - node.scrollTop - node.clientHeight < 160) {
      feedEndReached.current = true;
      onLoadMore();
    }
  };
  // Only mounted while it has something to announce; the pager is desktop-only,
  // so the feed copy belongs to the narrow surface.
  const statusText = !ready ? ""
    : desktop ? ""
      : pending && state.items.length > 0 ? frontendText(locale, "LIST_LOADING_MORE")
        : !hasMore && state.items.length > 0 ? frontendText(locale, "LIST_END_OF_LIST") : "";
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
    {state.kind === "ready" && (state.items.length === 0
      ? <PageState kind="empty" title={frontendText(locale, "NOTIFICATIONS_EMPTY")} />
      : <div data-list-mode={desktop ? "desktop" : "mobile"} className={desktop ? "flex h-full min-h-0 flex-1 flex-col" : "space-y-2"}>
        <div data-notification-feed="" className={desktop ? "min-h-0 flex-1 overflow-auto" : "overflow-auto"} onScroll={onFeedScroll}>
          <NotificationStack
            items={state.items.map((item: NotificationItem) => {
              const href = notificationTargetHref(item);
              return {
                id: item.id,
                title: (typeof item.payload.title === "string" ? item.payload.title.trim() : "") || frontendText(locale, notificationEventKey(item.eventType)),
                description: frontendText(locale, notificationEventKey(item.eventType)),
                trailing: <span className="flex flex-col items-end gap-1">
                  <time className="line-clamp-1 text-xs text-muted-foreground" dateTime={item.createdAt}>{item.createdAt}</time>
                  <Badge variant={item.readAt === null ? "default" : "outline"}>{frontendText(locale, item.readAt === null ? "NOTIFICATIONS_UNREAD" : "NOTIFICATIONS_READ")}</Badge>
                </span>,
                data: { "data-notification-id": item.id, "data-read": item.readAt === null ? "false" : "true" },
                actions: (() => {
                  const actions: OverflowActionItem[] = [];
                  if (href) actions.push({ id: "open", label: frontendText(locale, "NOTIFICATIONS_OPEN"), disabled: actionsDisabled, onClick: () => onOpen(item.id) });
                  if (item.readAt === null) actions.push({ id: "mark-read", label: frontendText(locale, "NOTIFICATIONS_MARK_READ"), disabled: actionsDisabled, onClick: () => onMarkRead(item.id) });
                  return actions.length
                    ? <OverflowActions size="sm" primaryActions={actions} openLabel={frontendText(locale, "COMMON_MORE_ACTIONS")} closeLabel={frontendText(locale, "COMMON_FEWER_ACTIONS")} />
                    : <p className="text-sm text-muted-foreground">{frontendText(locale, "NOTIFICATIONS_TARGET_UNAVAILABLE")}</p>;
                })(),
              };
            })}
            interactive={false}
            ariaLabel={frontendText(locale, "NOTIFICATIONS_TITLE")}
            labels={{
              expanded: (count) => `${frontendText(locale, "NOTIFICATIONS_TITLE")} · ${count}`,
              collapsed: (count) => `${frontendText(locale, "NOTIFICATIONS_TITLE")} · ${count}`,
            }}
            footer={desktop && onPageChange && onPageSizeChange ? <DataPagination locale={locale} {...state.pagination} visibleCount={state.items.length} pending={pending} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} /> : undefined}
            collapsedLabel={frontendText(locale, "NOTIFICATIONS_TITLE")}
            expandedLabel={frontendText(locale, "NOTIFICATIONS_TITLE")}
            emptyLabel={frontendText(locale, "NOTIFICATIONS_EMPTY")}
          />
        </div>
        {statusText ? <p role="status" className="sr-only">{statusText}</p> : null}
      </div>
    )}
  </section>;
}

function readFilter(value: string): NotificationFilters["read"] {
  return value === "read" || value === "unread" ? value : undefined;
}

function eventFilter(value: string): NotificationEventType | undefined {
  return NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType) ? value as NotificationEventType : undefined;
}
