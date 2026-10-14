import { CalendarRangeFilter } from "../components/calendar-range-filter";
import type { CalendarRange } from "../lib/calendar-query";
import type { FrontendPageMetadata } from "../lib/numbered-page";
import { CalendarBlank, Clock, Plus, X } from "@phosphor-icons/react";
import { CalendarCreateForm, type CalendarCreateCallbacks } from "../components/calendar-create-form";
import { useCalendarCancelConfirmation, formatCalendarRange } from "../components/calendar-cancel-confirmation";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { CalendarEvent } from "../lib/calendar-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { DataTable } from "../components/data-table";
import { PageState } from "../components/ui/page-state";

export type CalendarPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly CalendarEvent[]; pagination?: FrontendPageMetadata };

export function CalendarPage({ locale, state, pending = false, actionError, onRetry, onCreate, onCancel, range, onRangeChange, onLoadMore, createPending, createMemberId, onCreateReadback, onCreateDenied, onCreateLock }: { locale: LocaleRuntime; state: CalendarPageState; pending?: boolean; actionError?: string; onRetry?: () => void; createPending?: boolean; onCancel?: (event: CalendarEvent) => void; range?: CalendarRange; onRangeChange?: (range: CalendarRange) => void; onLoadMore?: () => void } & CalendarCreateCallbacks) {
  const confirmation = useCalendarCancelConfirmation({ locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId, range,
    blocked: pending || !!createPending, onCancel });
  const controlsPending = pending || !!createPending || confirmation.open;
  const loadMore = () => { if (controlsPending || confirmation.isOpen()) return; onLoadMore?.(); };
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button onClick={onRetry}>{frontendText(locale, "CALENDAR_RETRY")}</Button></PageState>;
  return <><section className="space-y-5" inert={confirmation.open ? true : undefined}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><CalendarBlank size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "CALENDAR_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "CALENDAR_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "CALENDAR_PRIVATE_BADGE")}</Badge></div>
    {range && onRangeChange && <CalendarRangeFilter key={`${range.from}:${range.to}`} locale={locale} range={range} pending={controlsPending} onChange={next => { if (!controlsPending && !confirmation.isOpen()) onRangeChange(next); }} />}
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "CALENDAR_CREATE_TITLE")}</CardTitle></CardHeader><CardContent><CalendarCreateForm locale={locale} createMemberId={createMemberId} pending={(createPending ?? pending) || confirmation.open} isSubmitBlocked={confirmation.isOpen} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={onCreateLock} /></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "CALENDAR_LOADING")} /> : <DataTable
      locale={locale}
      rows={state.items}
      rowId={(event) => event.id}
      ariaLabel={frontendText(locale, "CALENDAR_TITLE")}
      loadingMoreLabel={frontendText(locale, "CALENDAR_LOAD_MORE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "CALENDAR_EMPTY")} />}
      loading={controlsPending}
      hasMore={!!state.pagination && state.pagination.page < state.pagination.totalPages}
      onLoadMore={onLoadMore ? loadMore : undefined}
      rowHeight={88}
      columns={[
        { key: "event", header: frontendText(locale, "CALENDAR_COLUMN_TITLE"), cellClassName: "whitespace-normal", cell: (event) => <div className="py-1"><div className="flex items-center gap-2"><Clock size={16} className="shrink-0 text-muted-foreground" /><p className="line-clamp-1 font-medium">{event.title}</p></div>{event.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>}</div> },
        { key: "time", header: frontendText(locale, "CALENDAR_COLUMN_TIME"), width: "240px", cellClassName: "whitespace-normal", cell: (event) => <p className="line-clamp-1 text-sm text-muted-foreground">{formatCalendarRange(event, locale)}</p> },
        { key: "kind", header: frontendText(locale, "CALENDAR_COLUMN_KIND"), width: "140px", cell: (event) => <Badge variant="outline">{event.kind === "focus" ? frontendText(locale, "CALENDAR_FOCUS") : frontendText(locale, "CALENDAR_EVENT")}</Badge> },
        { key: "actions", header: frontendText(locale, "CALENDAR_COLUMN_ACTIONS"), width: "120px", align: "right", cell: (event) => event.status === "scheduled" ? <Button type="button" variant="ghost" size="sm" onClick={() => confirmation.request(event)} disabled={controlsPending} aria-label={frontendText(locale, "CALENDAR_CANCEL")}><X size={16} /></Button> : null },
      ]}
    />}
  </section>{confirmation.dialog}</>;
}
