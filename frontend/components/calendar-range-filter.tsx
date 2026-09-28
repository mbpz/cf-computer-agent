import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { localCalendarInstant, localCalendarTime, validCalendarRange, type CalendarRange } from "../lib/calendar-query";
export function CalendarRangeFilter({ locale, range, pending, onChange }: { locale: LocaleRuntime; range: CalendarRange; pending: boolean; onChange: (range: CalendarRange) => void }) {
  const [from, setFrom] = useState(() => localCalendarTime(range.from));
  const [to, setTo] = useState(() => localCalendarTime(range.to));
  const fromInstant = localCalendarInstant(from), toInstant = localCalendarInstant(to);
  const valid = !!fromInstant && !!toInstant && validCalendarRange({ from: fromInstant, to: toInstant });
  return <div className="space-y-2 rounded-lg border p-4">
    <p className="text-sm text-muted-foreground">{frontendText(locale, "CALENDAR_RANGE_HINT")} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">{frontendText(locale, "CALENDAR_RANGE_FROM")}<Input aria-label={frontendText(locale, "CALENDAR_RANGE_FROM")} type="datetime-local" value={from} disabled={pending} onChange={event => setFrom(event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm">{frontendText(locale, "CALENDAR_RANGE_TO")}<Input aria-label={frontendText(locale, "CALENDAR_RANGE_TO")} type="datetime-local" value={to} disabled={pending} onChange={event => setTo(event.currentTarget.value)} /></label>
      <Button type="button" disabled={pending || !valid} onClick={() => { if (valid) onChange({ from: fromInstant!, to: toInstant! }); }}>{frontendText(locale, "CALENDAR_RANGE_APPLY")}</Button>
    </div>
    {!valid && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "CALENDAR_RANGE_INVALID")}</p>}
  </div>;
}
