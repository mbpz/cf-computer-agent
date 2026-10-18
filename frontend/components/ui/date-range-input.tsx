import { useEffect, useId, useRef } from "react";
import { CalendarDots, CaretDown } from "@phosphor-icons/react";
import {
  DateRangePicker,
  DateRangePickerCalendar,
  DateRangePickerFooter,
  DateRangePickerGrid,
  DateRangePickerHeader,
  DateRangePickerSelection,
  useDateRangePicker,
  type DateRange,
} from "../motion/date-range-picker";
import { Button } from "./button";
import { cn } from "../../lib/utils";

/**
 * A day-granularity range, spelled the way the location spells it: `from`/`to`
 * are `YYYY-MM-DD` (or empty when that bound is not stated). It mirrors the
 * query-parameter shape of both surfaces that use it, so a route can hand its
 * parsed range straight in and write the picked days straight back.
 */
export interface DayRange {
  from: string;
  to: string;
}

/** The words the shared control needs; every one is supplied by the caller. */
export interface DayRangeTexts {
  /** Names the trigger and the calendar surface. */
  label: string;
  /** Trigger text while neither bound is stated. */
  placeholder: string;
  /** Prefix for the start bound in the trigger summary. */
  start: string;
  /** Prefix for the end bound in the trigger summary. */
  end: string;
  /** Names the clear action and labels its button. */
  clear: string;
}

/** Extra attributes for the trigger, e.g. a page's `data-*` hooks. */
export type TriggerData = { [key: `data-${string}`]: string };

export interface DateRangeInputProps {
  value: DayRange;
  onChange: (next: DayRange) => void;
  /** BCP 47 tag used for the calendar's month, weekday and day names. */
  locale: string;
  texts: DayRangeTexts;
  disabled?: boolean;
  className?: string;
  /** Extra attributes for the trigger, e.g. a page's `data-*` hooks. */
  triggerProps?: TriggerData;
}

const TRIGGER_CLASS = "inline-flex h-11 w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 max-lg:w-full";

/**
 * One day-range control for the whole app, on top of the installed beUI
 * `date-range-picker`. Callers own the draft and the commit (both surfaces
 * apply on an explicit action), so only a completed pick leaves this control.
 *
 * The calendar is composed in flow rather than through the payload's portalled
 * popover: one of its two homes is the search filter row, which becomes a
 * focus-scoped bottom sheet below `lg` (`ui/filter-disclosure`); a body portal
 * there would put the calendar outside that scope. The parts are the payload's
 * own, and the visible summary/footer are supplied here because the payload's
 * defaults are English-only.
 */
export function DateRangeInput({ value, onChange, locale, texts, disabled = false, className, triggerProps }: DateRangeInputProps) {
  // `DateRange.from` is required, so a stated end alone cannot be expressed to
  // the payload. The draft keeps it (the applied chips and the summary show it);
  // the calendar simply starts a fresh range when the member picks a day. The
  // controller also throws on unordered or unparsable values, and a location can
  // state either, so only a usable ordered range reaches it.
  const pickerValue: DateRange | null = isUsableRange(value) ? { from: value.from, to: value.to || undefined } : null;
  return <DateRangePicker
    value={pickerValue}
    onValueChange={(next) => onChange({ from: next?.from ?? "", to: next?.to ?? "" })}
    label={texts.label}
    locale={locale}
    disabled={disabled}
    closeOnSelect
    className={cn("flex-col items-start gap-2", className)}
  >
    <RangeControl value={value} texts={texts} disabled={disabled} onChange={onChange} triggerProps={triggerProps} />
  </DateRangePicker>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
/** A stated bound the calendar can parse and order. */
function isUsableRange(value: DayRange): boolean {
  if (!DAY.test(value.from)) return false;
  const stated = Date.parse(`${value.from}T00:00:00.000Z`);
  if (!Number.isFinite(stated) || new Date(stated).toISOString().slice(0, 10) !== value.from) return false;
  if (!value.to) return true;
  const end = Date.parse(`${value.to}T00:00:00.000Z`);
  return Number.isFinite(end) && new Date(end).toISOString().slice(0, 10) === value.to && value.to >= value.from;
}

function RangeControl({ value, texts, disabled, onChange, triggerProps }: { value: DayRange; texts: DayRangeTexts; disabled: boolean; onChange: (next: DayRange) => void; triggerProps?: TriggerData }) {
  const { open, setOpen } = useDateRangePicker();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const wasOpen = useRef(open);
  // Match the payload's popover: opening lands on the active day, closing hands
  // focus back to the trigger. `closeOnSelect` closes once both bounds exist.
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('button[tabindex="0"]')?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  const stated = Boolean(value.from || value.to);
  const summary = stated
    ? [value.from && `${texts.start}: ${value.from}`, value.to && `${texts.end}: ${value.to}`].filter(Boolean).join(" · ")
    : texts.placeholder;
  return <>
    <Button
      {...triggerProps}
      ref={trigger}
      type="button"
      variant="outline"
      size="sm"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={stated ? `${texts.label}: ${summary}` : texts.label}
      disabled={disabled}
      onClick={() => setOpen(!open)}
      className={TRIGGER_CLASS}
    >
      <CalendarDots size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{summary}</span>
      <CaretDown size={14} aria-hidden="true" className={cn("shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-180")} />
    </Button>
    {open && <div
      ref={panel}
      id={panelId}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <DateRangePickerCalendar>
        <DateRangePickerHeader />
        <DateRangePickerGrid />
        <DateRangePickerFooter>
          <div className="flex items-center justify-between gap-2">
            <DateRangePickerSelection>{summary}</DateRangePickerSelection>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={texts.clear}
              disabled={disabled || !stated}
              onClick={() => onChange({ from: "", to: "" })}
              className="h-auto rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 max-lg:min-h-11"
            >
              {texts.clear}
            </Button>
          </div>
        </DateRangePickerFooter>
      </DateRangePickerCalendar>
    </div>}
  </>;
}
