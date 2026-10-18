import { useEffect, useId, useState } from "react";
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
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { DataTable } from "../components/data-table";
import { PageHeader } from "../components/ui/page-header";
import { PageState } from "../components/ui/page-state";
import { loadCalendarIntent } from "../lib/calendar-create-intent";
import { loadCalendarDraft, persistCalendarDraft } from "../lib/calendar-draft";
import { HeatCalendar, HeatCalendarGrid, HeatCalendarTooltip } from "../components/charts/heat-calendar";

export type CalendarPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly CalendarEvent[]; pagination?: FrontendPageMetadata };

export function CalendarPage({ locale, state, pending = false, actionError, onRetry, onCreate, onCancel, range, onRangeChange, onLoadMore, onPageChange, onPageSizeChange, createPending, createMemberId, denied = false, onCreateReadback, onCreateDenied, onCreateLock }: { locale: LocaleRuntime; state: CalendarPageState; pending?: boolean; actionError?: string; onRetry?: () => void; createPending?: boolean; onCancel?: (event: CalendarEvent) => void; range?: CalendarRange; onRangeChange?: (range: CalendarRange) => void; onLoadMore?: () => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void; denied?: boolean } & CalendarCreateCallbacks) {
  const confirmation = useCalendarCancelConfirmation({ locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId, range,
    blocked: pending || !!createPending, onCancel });
  const controlsPending = pending || !!createPending || confirmation.open;
  // See GoalsPage: closed on a plain visit, auto-opened only for an unresolved stored record or
  // an unreadable composer record, so the recovery controls are never hidden behind the trigger.
  const [createOpen, setCreateOpen] = useState(() => !createMemberId || loadCalendarIntent(createMemberId).kind !== "empty" || loadCalendarDraft(createMemberId).kind === "blocked");
  const [createComposerLocked, setCreateComposerLocked] = useState(false);
  const createTitleId = useId();
  const createDescriptionId = useId();
  const createBlocked = pending || !!createPending || createComposerLocked;
  // On a denial (401/403/404) the composer and its unsent data are no longer ours to show:
  // close it and drop the stored draft instead of relying on a whole-page unmount, per §4.5.
  // A plain read failure leaves the draft alone, so unsent work survives.
  useEffect(() => {
    if (!denied) return;
    setCreateOpen(false);
    if (createMemberId) persistCalendarDraft(createMemberId, { title: "", startsAt: "", endsAt: "" });
  }, [denied, createMemberId]);
  const loadMore = () => { if (controlsPending || confirmation.isOpen()) return; onLoadMore?.(); };
  const changePage = (page: number) => { if (controlsPending || confirmation.isOpen()) return; onPageChange?.(page); };
  const changePageSize = (pageSize: SupportedPageSize) => { if (controlsPending || confirmation.isOpen()) return; onPageSizeChange?.(pageSize); };
  return <>{confirmation.dialog}<Dialog open={createOpen} onOpenChange={next => { if (!next) setCreateOpen(false); }}>
    <DialogContent role="dialog" data-calendar-create-dialog dismissLabel={frontendText(locale, "COMMON_DISMISS")} aria-labelledby={createTitleId} aria-describedby={createDescriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={createTitleId}>{frontendText(locale, "CALENDAR_CREATE_TITLE")}</DialogTitle>
      <p id={createDescriptionId} className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "CALENDAR_DESCRIPTION")}</p>
      <div className="mt-4"><CalendarCreateForm locale={locale} createMemberId={createMemberId} pending={(createPending ?? pending) || confirmation.open} isSubmitBlocked={confirmation.isOpen} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={locked => { setCreateComposerLocked(locked); onCreateLock?.(locked); }} onCreated={() => setCreateOpen(false)} /></div>
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" data-calendar-create-cancel variant="outline" onClick={() => setCreateOpen(false)}>{frontendText(locale, "COMMON_CANCEL")}</Button></div>
    </DialogContent>
  </Dialog><section className="flex flex-col space-y-5 lg:h-full lg:min-h-0" inert={confirmation.open ? true : undefined}>
    <PageHeader
      icon={<CalendarBlank size={22} weight="duotone" className="text-primary" data-icon="calendar" aria-hidden="true" />}
      title={frontendText(locale, "CALENDAR_TITLE")}
      description={frontendText(locale, "CALENDAR_DESCRIPTION")}
      status={frontendText(locale, "CALENDAR_PRIVATE_BADGE")}
      actions={<Button type="button" data-calendar-create-open aria-haspopup="dialog" aria-expanded={createOpen} disabled={createBlocked} onClick={() => setCreateOpen(true)}><Plus size={16} weight="bold" className="mr-1" aria-hidden="true" />{frontendText(locale, "CALENDAR_CREATE_TITLE")}</Button>}
    />
    {range && onRangeChange && <CalendarRangeFilter key={`${range.from}:${range.to}`} locale={locale} range={range} pending={controlsPending} onChange={next => { if (!controlsPending && !confirmation.isOpen()) onRangeChange(next); }} />}
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.kind === "ready" && <CalendarEventDensity items={state.items} locale={locale} />}
    {state.kind === "error" ? <PageState kind="error" title={state.message}><Button type="button" variant="outline" onClick={onRetry}>{frontendText(locale, "CALENDAR_RETRY")}</Button></PageState> : state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "CALENDAR_LOADING")} /> : <DataTable
      locale={locale}
      rows={state.items}
      rowId={(event) => event.id}
      ariaLabel={frontendText(locale, "CALENDAR_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "CALENDAR_EMPTY")} />}
      loading={controlsPending}
      pagination={state.pagination}
      onPageChange={onPageChange ? changePage : undefined}
      onPageSizeChange={onPageSizeChange ? changePageSize : undefined}
      fill
      className="lg:min-h-0 lg:flex-1"
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
  </section></>;
}

const HEAT_CALENDAR_WEEKS = 16;

/**
 * Event density across the loaded window: one UTC day per cell, the last
 * loaded event day ending the grid. Counts are exact (maxCount is the busiest
 * day), so a hovered cell reads the real number of events. The table below
 * stays the authoritative list; this view is additive.
 */
function CalendarEventDensity({ items, locale }: { items: readonly CalendarEvent[]; locale: LocaleRuntime }) {
  const perDay = new Map<number, number>();
  for (const item of items) {
    const at = Date.parse(item.startsAt);
    if (!Number.isFinite(at)) continue;
    const date = new Date(at);
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  if (perDay.size === 0) return null;
  const max = Math.max(...perDay.values());
  const end = new Date(Math.max(...perDay.keys()));
  // The chart's grid is Monday-first, so end on the Monday of the last loaded day's week.
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - (HEAT_CALENDAR_WEEKS - 1) * 7);
  const values = Array.from({ length: HEAT_CALENDAR_WEEKS }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + week * 7 + day);
      return (perDay.get(date.getTime()) ?? 0) / max;
    }));
  const unit = frontendText(locale, "CALENDAR_EVENT");
  return <section data-calendar-heat aria-label={frontendText(locale, "CALENDAR_EVENT")} className="shrink-0 overflow-x-auto rounded-lg border p-4">
    <HeatCalendar weeks={HEAT_CALENDAR_WEEKS} values={values} maxCount={max} endDate={end} unit={unit} color="var(--primary)">
      <HeatCalendarGrid>
        <HeatCalendarTooltip>{data => <span className="font-mono tabular-nums">{data.days > 1 ? data.total : data.count} {unit}</span>}</HeatCalendarTooltip>
      </HeatCalendarGrid>
    </HeatCalendar>
  </section>;
}
