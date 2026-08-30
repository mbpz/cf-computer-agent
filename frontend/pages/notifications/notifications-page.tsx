import { Alert, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataPagination } from "../../components/data-pagination";
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
  | { kind: "ready"; items: readonly NotificationItem[]; pagination: Pagination };

export function NotificationsPage({ locale, state, summary, filters, pending = false, actionPending = false, actionError, onRetry, onFilterChange, onPageChange, onPageSizeChange, onMarkRead, onMarkVisibleRead }: {
  locale: LocaleRuntime;
  state: NotificationsPageState;
  summary: NotificationSummary | null;
  filters: NotificationFilters;
  pending?: boolean;
  actionPending?: boolean;
  actionError?: string;
  onRetry: () => void;
  onFilterChange: (filters: NotificationFilters) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: SupportedPageSize) => void;
  onMarkRead: (id: string) => void;
  onMarkVisibleRead: (ids: readonly string[]) => void;
}) {
  if (state.kind === "loading") return <div><span className="sr-only">{frontendText(locale, "NOTIFICATIONS_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "NOTIFICATIONS_LOADING")} /></div>;
  if (state.kind === "error") return <PageState kind="error" title={frontendText(locale, "NOTIFICATIONS_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "NOTIFICATIONS_RETRY")}</Button></PageState>;
  const visibleUnreadIds = state.items.filter((item) => item.readAt === null).map((item) => item.id).slice(0, 100);
  return <section className="space-y-5">
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
      <Button variant="outline" disabled={actionPending || visibleUnreadIds.length === 0} onClick={() => onMarkVisibleRead(visibleUnreadIds)}>{frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ")}</Button>
    </div>
    {actionError && <Alert variant="destructive"><AlertTitle>{actionError}</AlertTitle></Alert>}
    {state.items.length === 0 ? <PageState kind="empty" title={frontendText(locale, "NOTIFICATIONS_EMPTY")} /> : <div className="space-y-3" aria-busy={pending || actionPending || undefined}>
      {state.items.map((item) => <NotificationCard key={item.id} item={item} locale={locale} disabled={actionPending} onMarkRead={onMarkRead} />)}
    </div>}
    <DataPagination {...state.pagination} visibleCount={state.items.length} locale={locale} pending={pending || actionPending} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
  </section>;
}

function NotificationCard({ item, locale, disabled, onMarkRead }: { item: NotificationItem; locale: LocaleRuntime; disabled: boolean; onMarkRead: (id: string) => void }) {
  const unread = item.readAt === null;
  const href = notificationTargetHref(item);
  const payloadTitle = typeof item.payload.title === "string" ? item.payload.title.trim() : "";
  return <Card data-notification-id={item.id} data-read={unread ? "false" : "true"}>
    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{payloadTitle || frontendText(locale, notificationEventKey(item.eventType))}</p><Badge variant={unread ? "default" : "outline"}>{frontendText(locale, unread ? "NOTIFICATIONS_UNREAD" : "NOTIFICATIONS_READ")}</Badge></div>
        <p className="text-sm text-muted-foreground">{frontendText(locale, notificationEventKey(item.eventType))}</p>
        <time className="block text-xs text-muted-foreground" dateTime={item.createdAt}>{item.createdAt}</time>
      </div>
      <div className="flex flex-wrap gap-2">{href && <a href={href} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">{frontendText(locale, "NOTIFICATIONS_OPEN")}</a>}{unread && <Button variant="outline" disabled={disabled} onClick={() => onMarkRead(item.id)}>{frontendText(locale, "NOTIFICATIONS_MARK_READ")}</Button>}</div>
    </CardContent>
  </Card>;
}

function readFilter(value: string): NotificationFilters["read"] {
  return value === "read" || value === "unread" ? value : undefined;
}

function eventFilter(value: string): NotificationEventType | undefined {
  return NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType) ? value as NotificationEventType : undefined;
}
