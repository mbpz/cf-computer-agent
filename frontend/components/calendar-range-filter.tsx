import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDots, CaretDown } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "./motion/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { localCalendarInstant, localCalendarTime, validCalendarRange, type CalendarRange } from "../lib/calendar-query";
import { cn } from "../lib/utils";

/**
 * The calendar's instant range (local time zone, minute precision, at most 31
 * days), rebuilt as a beUI surface: a `motion/popover` trigger that states the
 * applied range, and a panel with the two `datetime-local` fields on the shared
 * field shell (`ui/input`), the inline validation and Apply.
 *
 * The value is deliberately not `date-range-picker`: that payload is UTC
 * calendar days (`YYYY-MM-DD`), while `CalendarRange` is a pair of local-time
 * instants (`lib/calendar-query.ts`). Downgrading the value would delete
 * minute-precision local selection; the query contract (`from`/`to`, `to >
 * from`, ≤31 days) stays exactly as it was.
 *
 * The panel is portalled by the popover, so its fields, validation alert and
 * Apply action live in `document` rather than the page container. Opening
 * moves focus to the start field; Escape, outside dismissal and Apply all
 * close the panel, and the popover returns focus to the trigger.
 */
export function CalendarRangeFilter({ locale, range, pending, onChange }: { locale: LocaleRuntime; range: CalendarRange; pending: boolean; onChange: (range: CalendarRange) => void }) {
  const [from, setFrom] = useState(() => localCalendarTime(range.from));
  const [to, setTo] = useState(() => localCalendarTime(range.to));
  const [open, setOpen] = useState(false);
  const fromInstant = localCalendarInstant(from), toInstant = localCalendarInstant(to);
  const valid = !!fromInstant && !!toInstant && validCalendarRange({ from: fromInstant, to: toInstant });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const triggerId = useId();
  const hintId = useId();

  useEffect(() => {
    if (open) fromRef.current?.focus({ preventScroll: true });
  }, [open]);

  const format = useMemo(() => new Intl.DateTimeFormat(locale.locale, { dateStyle: "medium", timeStyle: "short" }), [locale.locale]);
  const summaryFrom = format.format(new Date(range.from)), summaryTo = format.format(new Date(range.to));
  const fromLabel = frontendText(locale, "CALENDAR_RANGE_FROM");
  const toLabel = frontendText(locale, "CALENDAR_RANGE_TO");

  return <div data-calendar-range-filter className="flex flex-wrap items-center gap-x-3 gap-y-2">
    <p id={hintId} className="text-sm text-muted-foreground">{frontendText(locale, "CALENDAR_RANGE_HINT")} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    <Popover open={open} onOpenChange={setOpen} align="start" side="bottom" className="max-lg:w-full">
      <PopoverTrigger>
        <Button ref={triggerRef} id={triggerId} type="button" variant="outline" data-calendar-range-trigger aria-label={`${fromLabel}: ${summaryFrom} – ${toLabel}: ${summaryTo}`} className="h-11 max-w-full justify-start gap-2">
          <CalendarDots size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{summaryFrom} – {summaryTo}</span>
          <CaretDown size={14} aria-hidden="true" className={cn("shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>
      {open && <PopoverContent role="dialog" data-calendar-range-panel aria-labelledby={triggerId} aria-describedby={hintId} className="w-[min(92vw,32rem)] max-w-[min(92vw,32rem)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="space-y-1 font-normal">
            <span>{fromLabel}</span>
            <Input ref={fromRef} aria-label={fromLabel} aria-invalid={!valid || undefined} type="datetime-local" value={from} disabled={pending} onChange={value => setFrom(value)} />
          </Label>
          <Label className="space-y-1 font-normal">
            <span>{toLabel}</span>
            <Input aria-label={toLabel} aria-invalid={!valid || undefined} type="datetime-local" value={to} disabled={pending} onChange={value => setTo(value)} />
          </Label>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button type="button" data-calendar-range-apply disabled={pending || !valid} className="max-lg:min-h-11" onClick={() => {
            if (!valid) return;
            triggerRef.current?.focus({ preventScroll: true });
            setOpen(false);
            onChange({ from: fromInstant!, to: toInstant! });
          }}>{frontendText(locale, "CALENDAR_RANGE_APPLY")}</Button>
        </div>
        {!valid && <p role="alert" className="mt-3 text-sm text-destructive">{frontendText(locale, "CALENDAR_RANGE_INVALID")}</p>}
      </PopoverContent>}
    </Popover>
  </div>;
}
