import { DataPagination } from "../components/data-pagination";
import { CalendarRangeFilter } from "../components/calendar-range-filter";
import type { CalendarRange } from "../lib/calendar-query";
import type { FrontendPageMetadata, SupportedPageSize } from "../lib/numbered-page";
import { CalendarBlank, Clock, Plus, X } from "@phosphor-icons/react";
import { CalendarCreateForm, type CalendarCreateCallbacks } from "../components/calendar-create-form";
import { useCalendarCancelConfirmation, formatCalendarRange } from "../components/calendar-cancel-confirmation";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { CalendarEvent } from "../lib/calendar-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";

export type CalendarPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly CalendarEvent[]; pagination?: FrontendPageMetadata };

export function CalendarPage({ locale, state, pending = false, actionError, onRetry, onCreate, onCancel, range, onRangeChange, onPageChange, onPageSizeChange, createPending, createMemberId, onCreateReadback, onCreateDenied, onCreateLock }: { locale: LocaleRuntime; state: CalendarPageState; pending?: boolean; actionError?: string; onRetry?: () => void; createPending?: boolean; onCancel?: (event: CalendarEvent) => void; range?: CalendarRange; onRangeChange?: (range: CalendarRange) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (size: SupportedPageSize) => void } & CalendarCreateCallbacks) {
  const confirmation = useCalendarCancelConfirmation({ locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId, range,
    blocked: pending || !!createPending, onCancel });
  const controlsPending = pending || !!createPending || confirmation.open;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button onClick={onRetry}>{frontendText(locale, "CALENDAR_RETRY")}</Button></PageState>;
  return <><section className="space-y-5" inert={confirmation.open ? true : undefined}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><CalendarBlank size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "CALENDAR_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "CALENDAR_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "CALENDAR_PRIVATE_BADGE")}</Badge></div>
    {range && onRangeChange && <CalendarRangeFilter key={`${range.from}:${range.to}`} locale={locale} range={range} pending={controlsPending} onChange={next => { if (!controlsPending && !confirmation.isOpen()) onRangeChange(next); }} />}
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "CALENDAR_CREATE_TITLE")}</CardTitle></CardHeader><CardContent><CalendarCreateForm locale={locale} createMemberId={createMemberId} pending={(createPending ?? pending) || confirmation.open} isSubmitBlocked={confirmation.isOpen} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={onCreateLock} /></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "CALENDAR_LOADING")} /> : <>
    {state.items.length ? <div className="space-y-3">{state.items.map((event) => <Card key={event.id}><CardContent className="flex items-start justify-between gap-4 p-4"><div className="min-w-0"><div className="flex items-center gap-2"><Clock size={16} className="text-muted-foreground" /><h2 className="truncate font-medium">{event.title}</h2><Badge variant="outline">{event.kind === "focus" ? frontendText(locale, "CALENDAR_FOCUS") : frontendText(locale, "CALENDAR_EVENT")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{formatCalendarRange(event, locale)}</p>{event.description && <p className="mt-2 text-sm">{event.description}</p>}</div>{event.status === "scheduled" && <Button type="button" variant="ghost" size="sm" onClick={() => confirmation.request(event)} disabled={controlsPending} aria-label={frontendText(locale, "CALENDAR_CANCEL")}>{<X size={16} />}</Button>}</CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "CALENDAR_EMPTY")} />}
    {state.pagination && onPageChange && onPageSizeChange && <DataPagination locale={locale} {...state.pagination} maxPage={Math.ceil(10000 / state.pagination.pageSize)} pending={controlsPending} onPageChange={page => { if (!controlsPending && !confirmation.isOpen()) onPageChange(page); }} onPageSizeChange={size => { if (!controlsPending && !confirmation.isOpen()) onPageSizeChange(size); }} />}
    </>}
  </section>{confirmation.dialog}</>;
}
